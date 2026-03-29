/**
 * Ruta: /v1/social
 * Gestión de cuentas de redes sociales + publicaciones + AI content
 */

import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminOnly, staffOnly } from '../../middleware/roles';
import { callClaude } from '../../services/ai/claude';
import { supabaseAdmin } from '../../config/supabase';

export const social_Router = Router();

social_Router.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', module: 'social' });
});

// -----------------------------------------------------------------------
// Accounts
// -----------------------------------------------------------------------

// GET /social/accounts
social_Router.get('/accounts', authMiddleware, staffOnly, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('social_accounts')
      .select('id, platform, account_name, account_id, token_expires_at, page_id')
      .eq('tenant_id', req.tenantId)
      .order('platform');

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /social/accounts/:id
social_Router.delete('/accounts/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { error } = await req.supabase
      .from('social_accounts')
      .delete()
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId);

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /social/accounts/meta/callback — OAuth Meta (Facebook/Instagram)
social_Router.post('/accounts/meta/callback', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { code, redirect_uri, platform } = req.body as {
      code: string;
      redirect_uri: string;
      platform: 'instagram' | 'facebook';
    };

    if (!code || !redirect_uri) {
      res.status(400).json({ error: 'code y redirect_uri requeridos' });
      return;
    }

    const metaAppId = process.env['META_APP_ID'];
    const metaAppSecret = process.env['META_APP_SECRET'];

    if (!metaAppId || !metaAppSecret) {
      res.status(500).json({ error: 'Meta credentials no configuradas' });
      return;
    }

    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${metaAppSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };

    if (!tokenData.access_token) {
      res.status(400).json({ error: tokenData.error?.message ?? 'Error obteniendo token' });
      return;
    }

    // Exchange for long-lived token (60 days)
    const llRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const llData = await llRes.json() as { access_token?: string; expires_in?: number };

    const accessToken = llData.access_token ?? tokenData.access_token;
    const expiresIn = llData.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const meRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${accessToken}&fields=id,name`);
    const meData = await meRes.json() as { id?: string; name?: string };

    const { data, error } = await supabaseAdmin
      .from('social_accounts')
      .upsert({
        tenant_id: req.tenantId,
        platform,
        account_id: meData.id ?? '',
        account_name: meData.name ?? '',
        access_token: accessToken,
        token_expires_at: expiresAt,
      }, { onConflict: 'tenant_id,platform,account_id' })
      .select('id, platform, account_name, token_expires_at')
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// -----------------------------------------------------------------------
// Posts
// -----------------------------------------------------------------------

// GET /social/posts
social_Router.get('/posts', authMiddleware, staffOnly, async (req, res) => {
  try {
    const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
    const from = (parseInt(page) - 1) * parseInt(limit);
    const to = from + parseInt(limit) - 1;

    let query = req.supabase
      .from('social_posts')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /social/posts
social_Router.post('/posts', authMiddleware, staffOnly, async (req, res) => {
  try {
    const { platforms, caption, media_urls, scheduled_at, status = 'borrador' } = req.body as {
      platforms: string[];
      caption: string;
      media_urls?: string[];
      scheduled_at?: string;
      status?: string;
    };

    const insertPayload: Record<string, unknown> = {
      tenant_id: req.tenantId,
      platforms,
      caption,
      status,
      media_urls: media_urls ?? [],
    };
    if (scheduled_at !== undefined) insertPayload['scheduled_at'] = scheduled_at;

    const { data, error } = await req.supabase
      .from('social_posts')
      .insert(insertPayload)
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /social/posts/:id
social_Router.patch('/posts/:id', authMiddleware, staffOnly, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const allowed = ['platforms', 'caption', 'media_urls', 'scheduled_at', 'status'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await req.supabase
      .from('social_posts')
      .update(updates)
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /social/posts/:id — solo borradores/error
social_Router.delete('/posts/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { error } = await req.supabase
      .from('social_posts')
      .delete()
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .in('status', ['borrador', 'error']);

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /social/posts/:id/publish — publicar ahora vía Graph API
social_Router.post('/posts/:id/publish', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { data: post, error: fetchErr } = await req.supabase
      .from('social_posts')
      .select('*')
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .single();

    if (fetchErr ?? !post) { res.status(404).json({ error: 'Post no encontrado' }); return; }

    const p = post as Record<string, unknown>;
    const platforms = (p['platforms'] as string[]) ?? [];

    const { data: accounts } = await req.supabase
      .from('social_accounts')
      .select('platform, access_token, page_id, account_id')
      .eq('tenant_id', req.tenantId)
      .in('platform', platforms);

    const platformPostIds: Record<string, string> = {};
    const errors: string[] = [];

    for (const account of (accounts ?? []) as Array<Record<string, string>>) {
      try {
        const pageId = account['page_id'] ?? account['account_id'];
        const accessToken = account['access_token'];
        const platform = account['platform'];

        if (platform === 'facebook' || platform === 'instagram') {
          const fbRes = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}/feed`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: p['caption'], access_token: accessToken }),
            }
          );
          const fbData = await fbRes.json() as { id?: string; error?: { message: string } };
          if (fbData.id) {
            platformPostIds[platform] = fbData.id;
          } else {
            errors.push(`${platform}: ${fbData.error?.message ?? 'Error desconocido'}`);
          }
        }
        // TikTok and LinkedIn: TODO — their Content APIs require separate SDK flows
      } catch {
        errors.push(`${account['platform']}: Error de conexión`);
      }
    }

    const newStatus = Object.keys(platformPostIds).length > 0 ? 'publicado' : 'error';

    const { data, error } = await supabaseAdmin
      .from('social_posts')
      .update({
        status: newStatus,
        published_at: new Date().toISOString(),
        platform_post_ids: platformPostIds,
        ...(errors.length > 0 ? { error_message: errors.join('; ') } : {}),
      })
      .eq('id', req.params['id']!)
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ post: data, platformPostIds, errors });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// -----------------------------------------------------------------------
// AI Content Generation
// -----------------------------------------------------------------------

social_Router.post(
  '/generate-content',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantName, contentType, topic, platforms } = req.body as {
      tenantName: string;
      contentType: string;
      topic: string;
      platforms: string[];
    };

    if (!topic?.trim()) {
      res.status(400).json({ error: 'topic is required' });
      return;
    }

    const CONTENT_TYPE_LABELS: Record<string, string> = {
      consejos_salud:      'un consejo práctico de salud',
      prevencion:          'una publicación sobre prevención y autocuidado',
      mitos_verdades:      'desmintiendo un mito médico común',
      cuando_consultar:    'orientando sobre cuándo consultar al médico',
      promocion_servicios: 'promocionando los servicios del consultorio',
      testimonio:          'un mensaje inspirador sobre salud',
    };

    const platformList = Array.isArray(platforms) ? platforms : [];
    const isLinkedIn = platformList.includes('linkedin');
    const isShortForm = platformList.includes('instagram') || platformList.includes('tiktok');

    const platformNote = isLinkedIn
      ? 'Tono profesional y formal. Sin emojis excesivos. Máximo 200 palabras.'
      : isShortForm
      ? 'Usa emojis estratégicamente. Incluye 5-7 hashtags relevantes al final (#salud #medicina #Ecuador #PlexoMed). Máximo 200 palabras.'
      : 'Tono amigable y accesible. Puedes usar algunos emojis. Máximo 250 palabras.';

    const promptContent = CONTENT_TYPE_LABELS[contentType] ?? contentType;
    const tenant = tenantName ?? 'el consultorio médico';

    const prompt = `Eres el community manager de "${tenant}", un consultorio médico en Ecuador.

Crea ${promptContent} sobre el siguiente tema: "${topic}".

Requisitos:
- Escrito en español para audiencia ecuatoriana
- ${platformNote}
- Información médica precisa y responsable
- No hagas diagnósticos ni prometas curas específicas
- Termina con un llamado a la acción (ej: "Agenda tu cita con nosotros")
- Devuelve ÚNICAMENTE el texto de la publicación, sin ninguna explicación adicional, sin comillas, sin título`;

    try {
      const result = await callClaude<string>(prompt, { maxTokens: 600, temperature: 0.7 });
      const caption = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      res.json({ caption });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error generating content';
      res.status(500).json({ error: message });
    }
  }
);
