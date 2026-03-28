/**
 * Rutas de gestión de pacientes
 */

import { Router } from 'express';
import { z } from 'zod';
import { staffOnly } from '../../middleware/roles';
import { audit } from '../../middleware/audit';
import { AppError } from '../../middleware/errorHandler';
import { createPacienteSchema, updatePacienteSchema } from '@medicore/shared/schemas';
import { invalidateCache } from '../../config/redis';

export const patientsRouter = Router();

/**
 * GET /api/v1/patients?q=Juan&limit=20
 * Busca pacientes del tenant (full-text + trigram)
 */
patientsRouter.get(
  '/',
  staffOnly,
  audit({ action: 'patient.list', resourceType: 'patients' }),
  async (req, res, next) => {
    try {
      const query = z.object({
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      }).parse(req.query);

      if (query.q && query.q.length >= 2) {
        // Búsqueda full-text via función PostgreSQL
        const { data, error } = await req.supabase.rpc('search_patients', {
          p_tenant_id: req.tenantId,
          p_query: query.q,
          p_limit: query.limit,
        });

        if (error) throw new AppError(500, error.message);
        res.json({ data, total: data?.length ?? 0 });
        return;
      }

      // Sin búsqueda — listar recientes
      const { data, error, count } = await req.supabase
        .from('patients')
        .select('id, first_name, last_name, cedula, phone, email, birth_date, insurance_type, is_active', { count: 'exact' })
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(query.offset, query.offset + query.limit - 1);

      if (error) throw new AppError(500, error.message);
      res.json({ data, total: count ?? 0 });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/patients/:id
 * Obtiene un paciente completo
 */
patientsRouter.get(
  '/:id',
  staffOnly,
  audit({
    action: 'patient.read',
    resourceType: 'patients',
    getResourceId: (req) => req.params['id'] as string,
  }),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params['id']);

      const { data, error } = await req.supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) throw new AppError(404, 'Paciente no encontrado');
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/patients
 * Crea un nuevo paciente
 */
patientsRouter.post(
  '/',
  staffOnly,
  audit({
    action: 'patient.create',
    resourceType: 'patients',
    getChangedFields: (req) => Object.keys(req.body as Record<string, unknown>),
  }),
  async (req, res, next) => {
    try {
      const data = createPacienteSchema.parse(req.body);

      const { data: patient, error } = await req.supabase
        .from('patients')
        .insert({
          tenant_id: req.tenantId,
          cedula: data.cedula,
          cedula_type: data.cedulaType,
          first_name: data.firstName,
          last_name: data.lastName,
          birth_date: data.birthDate?.toISOString().split('T')[0] ?? null,
          sex: data.sex,
          civil_status: data.civilStatus,
          nationality: data.nationality,
          email: data.email,
          phone: data.phone,
          phone_alt: data.phoneAlt,
          address: data.address,
          city: data.city,
          province: data.province,
          blood_type: data.bloodType,
          allergies: data.allergies,
          chronic_conditions: data.chronicConditions,
          emergency_contact_name: data.emergencyContactName,
          emergency_contact_phone: data.emergencyContactPhone,
          insurance_type: data.insuranceType,
          insurance_number: data.insuranceNumber,
          insurance_company: data.insuranceCompany,
          notes: data.notes,
          data_consent: data.dataConsent,
          marketing_consent: data.marketingConsent,
        })
        .select('id')
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError(409, 'Ya existe un paciente con esta cédula');
        }
        throw new AppError(500, error.message);
      }

      // Invalidar caché de búsqueda
      await invalidateCache(`patients:search:${req.tenantId}:*`);

      res.status(201).json({ id: patient!.id });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/patients/:id
 * Actualiza datos del paciente
 */
patientsRouter.patch(
  '/:id',
  staffOnly,
  audit({
    action: 'patient.update',
    resourceType: 'patients',
    getResourceId: (req) => req.params['id'] as string,
    getChangedFields: (req) => Object.keys(req.body as Record<string, unknown>),
  }),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params['id']);
      const data = updatePacienteSchema.parse(req.body);

      // Mapear campos camelCase → snake_case
      const updates: Record<string, unknown> = {};
      if (data.firstName !== undefined) updates['first_name'] = data.firstName;
      if (data.lastName !== undefined) updates['last_name'] = data.lastName;
      if (data.email !== undefined) updates['email'] = data.email;
      if (data.phone !== undefined) updates['phone'] = data.phone;
      if (data.address !== undefined) updates['address'] = data.address;
      if (data.city !== undefined) updates['city'] = data.city;
      if (data.province !== undefined) updates['province'] = data.province;
      if (data.bloodType !== undefined) updates['blood_type'] = data.bloodType;
      if (data.allergies !== undefined) updates['allergies'] = data.allergies;
      if (data.chronicConditions !== undefined) updates['chronic_conditions'] = data.chronicConditions;
      if (data.notes !== undefined) updates['notes'] = data.notes;
      if (data.insuranceType !== undefined) updates['insurance_type'] = data.insuranceType;
      if (data.insuranceNumber !== undefined) updates['insurance_number'] = data.insuranceNumber;
      if (data.insuranceCompany !== undefined) updates['insurance_company'] = data.insuranceCompany;

      const { error } = await req.supabase
        .from('patients')
        .update(updates)
        .eq('id', id);

      if (error) throw new AppError(500, error.message);

      await invalidateCache(`patients:${id}`);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/v1/patients/:id
 * Desactiva un paciente (soft delete)
 */
patientsRouter.delete(
  '/:id',
  audit({
    action: 'patient.deactivate',
    resourceType: 'patients',
    getResourceId: (req) => req.params['id'] as string,
  }),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params['id']);

      const { error } = await req.supabase
        .from('patients')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw new AppError(500, error.message);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);
