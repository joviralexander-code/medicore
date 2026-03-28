/**
 * Ruta: /v1/consultations
 * Historial clínico — CRUD de consultas médicas
 */

import { Router } from 'express';
import { z } from 'zod';
import { staffOnly, adminOnly } from '../../middleware/roles';
import { audit } from '../../middleware/audit';
import { callClaude } from '../../services/ai/claude';
import { buildCie10SuggestPrompt } from '../../services/ai/prompts/cie10-suggest';

export const consultations_Router = Router();

const vitalsSchema = z.object({
  bp_systolic: z.number().optional(),
  bp_diastolic: z.number().optional(),
  heart_rate: z.number().optional(),
  temp: z.number().optional(),
  o2_sat: z.number().optional(),
  weight_kg: z.number().optional(),
  height_cm: z.number().optional(),
}).optional();

// GET /consultations — lista por paciente o del tenant
consultations_Router.get(
  '/',
  staffOnly,
  audit({ action: 'consultation.list', resourceType: 'consultations' }),
  async (req, res) => {
    try {
      const { patient_id, page = '1', limit = '20' } = req.query as Record<string, string>;
      const from = (parseInt(page) - 1) * parseInt(limit);
      const to = from + parseInt(limit) - 1;

      let query = req.supabase
        .from('consultations')
        .select(
          'id, consultation_date, consultation_type, reason, diagnoses, is_signed, signed_at, patients(first_name, last_name), user_profiles(first_name, last_name)',
          { count: 'exact' }
        )
        .eq('tenant_id', req.tenantId)
        .order('consultation_date', { ascending: false })
        .range(from, to);

      if (patient_id) query = query.eq('patient_id', patient_id);

      const { data, error, count } = await query;
      if (error) { res.status(400).json({ error: error.message }); return; }
      res.json({ data, total: count, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  }
);

// GET /consultations/:id
consultations_Router.get(
  '/:id',
  staffOnly,
  audit({ action: 'consultation.read', resourceType: 'consultations', getResourceId: (r) => r.params['id'] as string | undefined }),
  async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('consultations')
        .select('*, patients(first_name, last_name, cedula, birth_date, sex, blood_type, allergies, chronic_conditions), user_profiles(first_name, last_name, speciality)')
        .eq('id', req.params['id']!)
        .eq('tenant_id', req.tenantId)
        .single();

      if (error) { res.status(404).json({ error: 'Consulta no encontrada' }); return; }
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  }
);

// POST /consultations
consultations_Router.post(
  '/',
  adminOnly,
  audit({ action: 'consultation.create', resourceType: 'consultations' }),
  async (req, res) => {
    try {
      const body = req.body as {
        patient_id: string;
        appointment_id?: string;
        consultation_type: string;
        consultation_date?: string;
        reason?: string;
        current_illness?: string;
        vitals?: z.infer<typeof vitalsSchema>;
        diagnoses?: unknown[];
        treatment_plan?: string;
      };

      const insertPayload: Record<string, unknown> = {
        tenant_id: req.tenantId,
        patient_id: body.patient_id,
        doctor_id: req.auth.userId,
        consultation_type: body.consultation_type,
        consultation_date: body.consultation_date ?? new Date().toISOString(),
        diagnoses: body.diagnoses ?? [],
        is_signed: false,
      };

      if (body.appointment_id !== undefined) insertPayload['appointment_id'] = body.appointment_id;
      if (body.reason !== undefined) insertPayload['reason'] = body.reason;
      if (body.current_illness !== undefined) insertPayload['current_illness'] = body.current_illness;
      if (body.vitals !== undefined) insertPayload['vitals'] = body.vitals;
      if (body.treatment_plan !== undefined) insertPayload['treatment_plan'] = body.treatment_plan;

      const { data, error } = await req.supabase
        .from('consultations')
        .insert(insertPayload)
        .select()
        .single();

      if (error) { res.status(400).json({ error: error.message }); return; }
      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  }
);

// PATCH /consultations/:id
consultations_Router.patch(
  '/:id',
  adminOnly,
  audit({ action: 'consultation.update', resourceType: 'consultations', getResourceId: (r) => r.params['id'] as string | undefined }),
  async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;

      // Prevent editing a signed consultation
      const { data: existing } = await req.supabase
        .from('consultations')
        .select('is_signed')
        .eq('id', req.params['id']!)
        .eq('tenant_id', req.tenantId)
        .single();

      if ((existing as Record<string, unknown> | null)?.['is_signed'] === true) {
        res.status(400).json({ error: 'No se puede editar una consulta firmada' });
        return;
      }

      const allowed = ['reason', 'current_illness', 'vitals', 'diagnoses', 'treatment_plan', 'consultation_type'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }

      const { data, error } = await req.supabase
        .from('consultations')
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
  }
);

// POST /consultations/:id/sign — firmar consulta (inmutable)
consultations_Router.post(
  '/:id/sign',
  adminOnly,
  audit({ action: 'consultation.sign', resourceType: 'consultations', getResourceId: (r) => r.params['id'] as string | undefined }),
  async (req, res) => {
    try {
      const { data, error } = await req.supabase
        .from('consultations')
        .update({
          is_signed: true,
          signed_at: new Date().toISOString(),
          signed_by: req.auth.userId,
        })
        .eq('id', req.params['id']!)
        .eq('tenant_id', req.tenantId)
        .eq('is_signed', false)
        .select()
        .single();

      if (error) { res.status(400).json({ error: error.message }); return; }
      if (!data) { res.status(404).json({ error: 'Consulta no encontrada o ya firmada' }); return; }
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  }
);

// POST /consultations/ai/suggest-diagnoses — sugerencia CIE-10 con Claude
consultations_Router.post(
  '/ai/suggest-diagnoses',
  adminOnly,
  async (req, res) => {
    try {
      const { symptoms, speciality = 'Médico General' } = req.body as {
        symptoms: string;
        speciality?: string;
      };

      if (!symptoms?.trim()) {
        res.status(400).json({ error: 'Síntomas requeridos' });
        return;
      }

      const prompt = buildCie10SuggestPrompt(symptoms, {
        doctorSpeciality: speciality,
        country: 'Ecuador',
      });

      const { content } = await callClaude<{ sugerencias: unknown[] }>(prompt, {
        maxTokens: 800,
        temperature: 0.2,
      });

      res.json(content);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  }
);
