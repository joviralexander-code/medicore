/**
 * Worker: whatsapp-send
 * Envía mensajes de WhatsApp de forma asíncrona via WhatsApp Business Cloud API
 * También maneja recordatorios de citas programados por el reminder-worker
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../config/redis';
import { supabaseAdmin } from '../../config/supabase';

export interface WhatsappSendJobData {
  tenantId: string;
  /** Número destino en formato internacional: +593991234567 */
  to: string;
  message: string;
  /** Si se asocia a una conversación existente */
  conversationId?: string;
  /** Si es respuesta del bot */
  isBotResponse?: boolean;
}

const WA_API_BASE = 'https://graph.facebook.com/v19.0';

async function sendWhatsappMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<string> {
  const res = await fetch(`${WA_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/\D/g, ''), // solo dígitos
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${errText}`);
  }

  const data = await res.json() as { messages?: [{ id: string }] };
  return data.messages?.[0]?.id ?? '';
}

async function processWhatsappSend(job: Job): Promise<void> {
  const { tenantId, to, message, conversationId, isBotResponse = false } =
    job.data as WhatsappSendJobData;

  // Get tenant's WhatsApp connection
  const { data: conn } = await supabaseAdmin
    .from('whatsapp_connections')
    .select('phone_number_id, access_token, is_connected, connection_type')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const c = conn as Record<string, unknown> | null;

  if (!c?.['is_connected']) {
    throw new Error('WhatsApp no conectado para este tenant');
  }

  const phoneNumberId = c['phone_number_id'] as string | undefined;
  const accessToken = c['access_token'] as string | undefined;

  if (!phoneNumberId || !accessToken) {
    throw new Error('Credenciales WhatsApp incompletas');
  }

  const waMessageId = await sendWhatsappMessage(phoneNumberId, accessToken, to, message);

  // Persist message to DB
  const now = new Date().toISOString();

  // Resolve or create conversation
  let convId = conversationId;
  if (!convId) {
    const { data: existingConv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone_number', to)
      .maybeSingle();

    if (existingConv) {
      convId = (existingConv as Record<string, string>)['id'];
    } else {
      const { data: newConv } = await supabaseAdmin
        .from('whatsapp_conversations')
        .insert({
          tenant_id: tenantId,
          phone_number: to,
          contact_name: to,
          last_message_at: now,
          unread_count: 0,
          is_bot_active: true,
        })
        .select('id')
        .single();
      convId = (newConv as Record<string, string> | null)?.['id'];
    }
  }

  if (convId) {
    await supabaseAdmin.from('whatsapp_messages').insert({
      tenant_id: tenantId,
      conversation_id: convId,
      direction: 'outbound',
      message_type: 'text',
      content: message,
      wa_message_id: waMessageId,
      status: 'sent',
      sent_at: now,
      is_bot_response: isBotResponse,
    });

    // Update conversation last_message_at
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({ last_message_at: now })
      .eq('id', convId);
  }
}

export function startWhatsappWorker() {
  const worker = new Worker('whatsapp-send', processWhatsappSend, {
    connection: redis,
    concurrency: 10,
  });

  worker.on('failed', (job, err) => {
    console.error(`[whatsapp-worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
