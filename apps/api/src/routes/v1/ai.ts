/**
 * Rutas de IA — CIE-10 suggest, content generation
 */

import { Router } from 'express';
import { z } from 'zod';
import { staffOnly, adminOnly } from '../../middleware/roles';
import { AppError } from '../../middleware/errorHandler';
import { callClaude } from '../../services/ai/claude';
import { buildCie10SuggestPrompt } from '../../services/ai/prompts/cie10-suggest';
import { buildContentGenPrompt } from '../../services/ai/prompts/content-gen';
import { requirePlanFeature } from '../../middleware/planGuard';
import { supabaseAdmin } from '../../config/supabase';
import { withCache } from '../../config/redis';
import { CACHE_TTL } from '@medicore/shared/constants';

export const aiRouter = Router();

/**
 * POST /api/v1/ai/cie10-suggest
 * Sugiere diagnósticos CIE-10 desde síntomas
 */
aiRouter.post('/cie10-suggest', staffOnly, async (req, res, next) => {
  try {
    const { symptoms } = z.object({
      symptoms: z.string().min(10).max(2000),
    }).parse(req.body);

    // Obtener especialidad del médico para el contexto
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('speciality')
      .eq('id', req.auth.userId)
      .single();

    const prompt = buildCie10SuggestPrompt(symptoms, {
      doctorSpeciality: profile?.speciality ?? 'Medicina General',
      country: 'Ecuador',
    });

    const result = await callClaude<{
      sugerencias: Array<{
        cie10_code: string;
        description: string;
        type: string;
        justificacion: string;
      }>;
    }>(prompt, { maxTokens: 1024, temperature: 0.2 });

    res.json({ suggestions: result.content.sugerencias ?? [] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/ai/cie10-search?q=diabetes
 * Busca en la base de datos CIE-10 (no usa IA — usa PostgreSQL FTS)
 */
aiRouter.get('/cie10-search', staffOnly, async (req, res, next) => {
  try {
    const { q, limit } = z.object({
      q: z.string().min(2).max(100),
      limit: z.coerce.number().int().min(1).max(50).default(15),
    }).parse(req.query);

    const cacheKey = `cie10:search:${q}:${limit}`;

    const results = await withCache(cacheKey, CACHE_TTL.CIE10_SEARCH, async () => {
      const { data, error } = await req.supabase.rpc('search_cie10', {
        p_query: q,
        p_limit: limit,
      });
      if (error) throw new AppError(500, error.message);
      return data;
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/ai/content-generate
 * Genera/mejora contenido para redes sociales
 * Solo disponible desde plan Pro
 */
aiRouter.post(
  '/content-generate',
  adminOnly,
  requirePlanFeature('socialMedia'),
  async (req, res, next) => {
    try {
      const { mode, input, platform } = z.object({
        mode: z.enum(['mejorar_texto', 'desde_tema', 'plantilla']),
        input: z.string().min(5).max(3000),
        platform: z.enum(['instagram', 'facebook', 'tiktok', 'linkedin']).default('instagram'),
      }).parse(req.body);

      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('speciality')
        .eq('id', req.auth.userId)
        .single();

      const prompt = buildContentGenPrompt(mode, input, {
        doctorSpeciality: profile?.speciality ?? 'Medicina General',
        country: 'Ecuador',
      }, platform);

      const result = await callClaude(prompt, { maxTokens: 2048, temperature: 0.7 });

      res.json({ result: result.content });
    } catch (err) {
      next(err);
    }
  }
);
