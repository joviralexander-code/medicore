/**
 * Ruta: /v1/tenant (pública)
 * Utilidades para verificación de slug y datos públicos del tenant
 */

import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase';

export const tenant_Router = Router();

// GET /tenant/check-slug?slug=<slug> — verificar disponibilidad de slug
tenant_Router.get('/check-slug', async (req, res) => {
  try {
    const slug = (req.query['slug'] as string | undefined)?.trim().toLowerCase();

    if (!slug || slug.length < 3) {
      res.status(400).json({ available: false, error: 'Slug mínimo 3 caracteres' });
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ available: false, error: 'Solo letras minúsculas, números y guiones' });
      return;
    }

    const reserved = ['admin', 'api', 'app', 'portal', 'www', 'mail', 'support', 'billing', 'help', 'dashboard'];
    if (reserved.includes(slug)) {
      res.json({ available: false, reason: 'reserved' });
      return;
    }

    const { data } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    res.json({ available: !data, slug });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /tenant/public/:slug — info pública del tenant (para portal paciente)
tenant_Router.get('/public/:slug', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, settings, timezone')
      .eq('slug', req.params['slug']!)
      .eq('status', 'active')
      .single();

    if (error ?? !data) {
      res.status(404).json({ error: 'Consultorio no encontrado' });
      return;
    }

    const t = data as Record<string, unknown>;
    res.json({
      id: t['id'],
      name: t['name'],
      slug: t['slug'],
      timezone: t['timezone'],
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
