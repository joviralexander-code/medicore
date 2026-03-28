/**
 * Rutas de autenticación y onboarding
 */

import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authMiddleware } from '../../middleware/auth';
import { createTenantSchema, tenantSriConfigSchema } from '@medicore/shared/schemas';
import { generateSlug } from '@medicore/shared/utils';
import { AppError } from '../../middleware/errorHandler';

export const authRouter = Router();

/**
 * POST /api/v1/auth/onboarding/profile
 * Completa el perfil del médico (paso 1 del onboarding)
 */
authRouter.post(
  '/onboarding/profile',
  authMiddleware,
  async (req, res, next) => {
    try {
      const schema = z.object({
        firstName: z.string().min(2).max(100),
        lastName: z.string().min(2).max(100),
        speciality: z.string().min(2).max(200),
        cedula: z.string().optional(),
        phone: z.string().optional(),
        senescytRegistration: z.string().optional(),
      });

      const data = schema.parse(req.body);
      const { userId } = req.auth;

      await supabaseAdmin
        .from('user_profiles')
        .update({
          first_name: data.firstName,
          last_name: data.lastName,
          speciality: data.speciality,
          cedula: data.cedula ?? null,
          phone: data.phone ?? null,
          senescyt_registration: data.senescytRegistration ?? null,
        })
        .eq('id', userId);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/auth/onboarding/slug-available?slug=dr-juan
 * Verifica si un slug está disponible
 */
authRouter.get('/onboarding/slug-available', async (req, res, next) => {
  try {
    const slug = z.string().min(3).max(63).regex(/^[a-z0-9-]+$/).parse(req.query['slug']);

    const { data } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single();

    res.json({ available: !data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/onboarding/tenant
 * Crea el tenant del médico (paso 2 del onboarding)
 */
authRouter.post(
  '/onboarding/tenant',
  authMiddleware,
  async (req, res, next) => {
    try {
      const data = createTenantSchema.parse(req.body);
      const { userId } = req.auth;

      // Verificar que el usuario no tenga tenant ya
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('tenant_id')
        .eq('id', userId)
        .single();

      if (profile?.tenant_id) {
        throw new AppError(400, 'Ya tienes un tenant configurado');
      }

      // Generar slug si no viene
      const slug = data.slug || generateSlug(data.name);

      // Verificar disponibilidad
      const { data: existing } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .single();

      if (existing) {
        throw new AppError(409, `El subdominio "${slug}" ya está en uso`, 'SLUG_TAKEN');
      }

      // Crear tenant
      const { data: tenant, error } = await supabaseAdmin
        .from('tenants')
        .insert({
          slug,
          name: data.name,
          plan_tier: data.planTier,
          timezone: data.timezone,
          status: 'trial',
        })
        .select('id, slug')
        .single();

      if (error || !tenant) {
        throw new AppError(500, 'Error creando el tenant');
      }

      // Asignar tenant al usuario
      await supabaseAdmin
        .from('user_profiles')
        .update({ tenant_id: tenant.id, role: 'admin' })
        .eq('id', userId);

      res.status(201).json({
        tenantId: tenant.id,
        slug: tenant.slug,
        subdomain: `${tenant.slug}.medicore.ec`,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/onboarding/sri-config
 * Configura los datos SRI del tenant (paso 3 del onboarding)
 */
authRouter.post(
  '/onboarding/sri-config',
  authMiddleware,
  async (req, res, next) => {
    try {
      const data = tenantSriConfigSchema.parse(req.body);
      const { userId } = req.auth;

      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('tenant_id')
        .eq('id', userId)
        .single();

      if (!profile?.tenant_id) {
        throw new AppError(400, 'Crea primero tu cuenta médica');
      }

      await supabaseAdmin
        .from('tenants')
        .update({
          sri_ruc: data.ruc,
          sri_razon_social: data.razonSocial,
          sri_nombre_comercial: data.nombreComercial ?? null,
          sri_direccion: data.direccion,
          sri_telefono: data.telefono ?? null,
          sri_email: data.email ?? null,
          sri_serie: data.serie,
          sri_ambiente: data.ambiente,
        })
        .eq('id', profile.tenant_id);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);
