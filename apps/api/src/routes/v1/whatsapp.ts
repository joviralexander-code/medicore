/**
 * Ruta: /v1/whatsapp
 * Gestión de conversaciones + chatbot Claude
 */

import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { callClaude } from '../../services/ai/claude';
import { buildChatbotSystemPrompt, buildChatbotUserMessage } from '../../services/ai/prompts/chatbot';

export const whatsapp_Router = Router();

// GET /whatsapp/status — estado de conexión del tenant
whatsapp_Router.get('/status', async (req, res) => {
  try {
    const { data } = await req.supabase
      .from('whatsapp_connections')
      .select('is_connected, connection_type, phone_number, last_connected_at')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    res.json({ connection: data ?? null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /whatsapp/conversations — lista de conversaciones
whatsapp_Router.get('/conversations', async (req, res) => {
  try {
    const { page = '1', limit = '30' } = req.query as Record<string, string>;
    const from = (parseInt(page) - 1) * parseInt(limit);
    const to = from + parseInt(limit) - 1;

    const { data, error, count } = await req.supabase
      .from('whatsapp_conversations')
      .select('*, patients(first_name, last_name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('last_message_at', { ascending: false })
      .range(from, to);

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data, total: count });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /whatsapp/conversations/:id/messages — historial de mensajes
whatsapp_Router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { before, limit = '50' } = req.query as Record<string, string>;

    let query = req.supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .eq('conversation_id', req.params['id']!)
      .order('sent_at', { ascending: false })
      .limit(parseInt(limit));

    if (before) query = query.lt('sent_at', before);

    const { data, error } = await query;
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data: (data ?? []).reverse() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /whatsapp/conversations/:id/messages — enviar mensaje manual
whatsapp_Router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { content } = req.body as { content: string };

    if (!content?.trim()) {
      res.status(400).json({ error: 'Contenido requerido' });
      return;
    }

    // Get conversation to obtain phone
    const { data: conv } = await req.supabase
      .from('whatsapp_conversations')
      .select('phone_number, patient_id')
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .single();

    if (!conv) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }

    // Insert message record
    const { data: msg, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        tenant_id: req.tenantId,
        conversation_id: req.params['id'],
        direction: 'outbound',
        message_type: 'text',
        content: content.trim(),
        status: 'sent',
        sent_at: new Date().toISOString(),
        is_bot_response: false,
      })
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }

    // Update conversation last_message_at
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', req.params['id']!);

    // TODO: actually send via WhatsApp Business API / Baileys
    // For now, just persist the message

    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /whatsapp/conversations/:id/bot-toggle — activar/desactivar bot
whatsapp_Router.post('/conversations/:id/bot-toggle', async (req, res) => {
  try {
    const { is_bot_active } = req.body as { is_bot_active: boolean };

    const { data, error } = await req.supabase
      .from('whatsapp_conversations')
      .update({ is_bot_active })
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .select('id, is_bot_active')
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /whatsapp/webhook — recibir mensajes entrantes (desde WhatsApp Business API)
// Ruta pública — verificación de webhook Meta
whatsapp_Router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN']) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// POST /whatsapp/webhook — mensajes entrantes del bot
whatsapp_Router.post('/webhook', async (req, res) => {
  // Acknowledge immediately (Meta requires <5s response)
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body as Record<string, unknown>;
    const entry = ((body['entry'] as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;
    const changes = ((entry?.['changes'] as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;
    const value = changes?.['value'] as Record<string, unknown> | undefined;
    const messages = (value?.['messages'] as unknown[]) ?? [];

    if (messages.length === 0) return;

    const msg = messages[0] as Record<string, unknown>;
    const from = msg['from'] as string;
    const msgType = msg['type'] as string;
    const textBody = (msg['text'] as Record<string, string> | undefined)?.['body'] ?? '';
    const waMessageId = msg['id'] as string;

    if (msgType !== 'text' || !textBody.trim()) return;

    // Find tenant by phone number ID
    const phoneNumberId = (value?.['metadata'] as Record<string, string> | undefined)?.['phone_number_id'];

    const { data: connection } = await supabaseAdmin
      .from('whatsapp_connections')
      .select('tenant_id')
      .eq('waba_id', phoneNumberId ?? '')
      .maybeSingle();

    if (!connection) return;

    const tenantId = connection['tenant_id'] as string;

    // Get or create conversation
    let { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, is_bot_active, patient_id')
      .eq('tenant_id', tenantId)
      .eq('phone_number', from)
      .maybeSingle();

    if (!conv) {
      const { data: newConv } = await supabaseAdmin
        .from('whatsapp_conversations')
        .insert({
          tenant_id: tenantId,
          phone_number: from,
          contact_name: from,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
          is_bot_active: true,
        })
        .select()
        .single();
      conv = newConv as typeof conv;
    }

    if (!conv) return;

    const conversationId = (conv as Record<string, unknown>)['id'] as string;
    const isBotActive = (conv as Record<string, unknown>)['is_bot_active'] as boolean;

    // Persist inbound message
    await supabaseAdmin.from('whatsapp_messages').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'inbound',
      message_type: 'text',
      content: textBody,
      wa_message_id: waMessageId,
      status: 'delivered',
      sent_at: new Date().toISOString(),
    });

    // Update unread count
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({ last_message_at: new Date().toISOString(), unread_count: supabaseAdmin.rpc('increment') })
      .eq('id', conversationId);

    if (!isBotActive) return;

    // Get tenant info for bot context
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name, settings')
      .eq('id', tenantId)
      .single();

    // Get doctor profile for speciality
    const { data: doctor } = await supabaseAdmin
      .from('user_profiles')
      .select('speciality')
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();

    // Get conversation history (last 6 messages)
    const { data: history } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('direction, content')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(6);

    const historyFormatted = ((history ?? []) as Array<Record<string, string>>)
      .reverse()
      .slice(0, -1) // exclude the message we just inserted
      .map((m) => ({
        role: m['direction'] === 'inbound' ? ('user' as const) : ('assistant' as const),
        content: (m['content'] as string | undefined) ?? '',
      }));

    // Find patient name
    const patientId = (conv as Record<string, unknown>)['patient_id'] as string | null;
    let patientName: string | undefined;
    if (patientId) {
      const { data: patient } = await supabaseAdmin
        .from('patients')
        .select('first_name')
        .eq('id', patientId)
        .single();
      patientName = (patient as Record<string, string> | null)?.['first_name'];
    }

    const systemPrompt = buildChatbotSystemPrompt({
      tenantName: (tenant as Record<string, string> | null)?.['name'] ?? 'el consultorio',
      speciality: (doctor as Record<string, string> | null)?.['speciality'] ?? 'Médico General',
      timezone: 'America/Guayaquil',
      ...(patientName !== undefined ? { patientName } : {}),
    });

    const userMessage = buildChatbotUserMessage(historyFormatted, textBody);

    const { content: botReply } = await callClaude<string>(userMessage, {
      system: systemPrompt,
      maxTokens: 400,
      temperature: 0.5,
    });

    const replyText = typeof botReply === 'string' ? botReply : JSON.stringify(botReply);

    // Check if bot wants to escalate
    const shouldEscalate = replyText.startsWith('[ESCALAR_HUMANO]');
    const cleanReply = replyText.replace(/^\[(ESCALAR_HUMANO|AGENDAR_CITA)\]\s*/,'');

    // Persist bot response
    await supabaseAdmin.from('whatsapp_messages').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'outbound',
      message_type: 'text',
      content: cleanReply,
      status: 'sent',
      sent_at: new Date().toISOString(),
      is_bot_response: true,
    });

    if (shouldEscalate) {
      await supabaseAdmin
        .from('whatsapp_conversations')
        .update({ is_bot_active: false })
        .eq('id', conversationId);
    }

    // TODO: send actual WhatsApp message via API
    // await sendWhatsAppMessage(from, cleanReply, phoneNumberId);
  } catch {
    // Errors after 200 response — log but don't fail
  }
});
