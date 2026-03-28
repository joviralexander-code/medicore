/**
 * Ruta: /v1/prescriptions
 * CRUD de recetas médicas + generación de PDF
 */

import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { generatePrescriptionPdf } from '../../services/pdf/prescription';
import type { PrescriptionPdfInput } from '../../services/pdf/prescription';

export const prescriptions_Router = Router();

// GET /prescriptions — lista paginada del tenant
prescriptions_Router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '20', status, patient_id } = req.query as Record<string, string>;
    const from = (parseInt(page) - 1) * parseInt(limit);
    const to = from + parseInt(limit) - 1;

    let query = req.supabase
      .from('prescriptions')
      .select('id, prescription_number, status, diagnoses, medications, doctor_signed_at, created_at, patients(first_name, last_name, cedula)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);
    if (patient_id) query = query.eq('patient_id', patient_id);

    const { data, error, count } = await query;
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /prescriptions/:id
prescriptions_Router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('prescriptions')
      .select('*, patients(first_name, last_name, cedula, birth_date, sex, phone, email), user_profiles(first_name, last_name, speciality, senescyt_registration), tenants(name, sri_ruc, settings)')
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error) { res.status(404).json({ error: 'Receta no encontrada' }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /prescriptions — crear nueva receta
prescriptions_Router.post('/', async (req, res) => {
  try {
    const {
      patient_id, consultation_id, diagnoses, medications,
      validity_days = 30, notes,
    } = req.body as {
      patient_id: string;
      consultation_id?: string;
      diagnoses: Array<{ cie10_code: string; description: string }>;
      medications: unknown[];
      validity_days?: number;
      notes?: string;
    };

    // Generate prescription number via RPC
    const { data: rpcData } = await req.supabase
      .rpc('generate_prescription_number', { p_tenant_id: req.tenantId });

    const prescriptionNumber = (rpcData as string | null) ?? `RX-${Date.now()}`;

    // Generate verification code (16 chars alphanumeric)
    const verificationCode = Array.from({ length: 16 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
    ).join('');

    const insertPayload: Record<string, unknown> = {
      tenant_id: req.tenantId,
      patient_id,
      doctor_id: req.auth.userId,
      prescription_number: prescriptionNumber,
      diagnoses: diagnoses ?? [],
      medications: medications ?? [],
      status: 'borrador',
      verification_code: verificationCode,
      validity_days,
    };
    if (consultation_id !== undefined) insertPayload['consultation_id'] = consultation_id;
    if (notes !== undefined) insertPayload['notes'] = notes;

    const { data, error } = await req.supabase
      .from('prescriptions')
      .insert(insertPayload)
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /prescriptions/:id — actualizar receta (solo en borrador)
prescriptions_Router.patch('/:id', async (req, res) => {
  try {
    const { diagnoses, medications, notes } = req.body as {
      diagnoses?: unknown[];
      medications?: unknown[];
      notes?: string;
    };

    const updates: Record<string, unknown> = {};
    if (diagnoses !== undefined) updates['diagnoses'] = diagnoses;
    if (medications !== undefined) updates['medications'] = medications;
    if (notes !== undefined) updates['notes'] = notes;

    const { data, error } = await req.supabase
      .from('prescriptions')
      .update(updates)
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .eq('status', 'borrador')
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /prescriptions/:id/emit — emitir receta y generar PDF
prescriptions_Router.post('/:id/emit', async (req, res) => {
  try {
    const { data: prescription, error: fetchErr } = await supabaseAdmin
      .from('prescriptions')
      .select(`
        *,
        patients(first_name, last_name, cedula, birth_date, sex),
        user_profiles!doctor_id(first_name, last_name, speciality, senescyt_registration, phone, email),
        tenants(name, sri_ruc, settings)
      `)
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .single();

    if (fetchErr ?? !prescription) {
      res.status(404).json({ error: 'Receta no encontrada' });
      return;
    }

    const p = prescription as Record<string, unknown>;

    if (p['status'] !== 'borrador') {
      res.status(400).json({ error: 'Solo se pueden emitir recetas en borrador' });
      return;
    }

    const patient = p['patients'] as Record<string, unknown> | null;
    const doctor = p['user_profiles'] as Record<string, unknown> | null;
    const tenant = p['tenants'] as Record<string, unknown> | null;

    const pdfInput: PrescriptionPdfInput = {
      prescriptionNumber: p['prescription_number'] as string,
      issuedAt: new Date(),
      validUntilDays: (p['validity_days'] as number | undefined) ?? 30, // maps DB validity_days → PDF validUntilDays
      verificationCode: p['verification_code'] as string,
      doctor: {
        firstName: (doctor?.['first_name'] as string | undefined) ?? '',
        lastName: (doctor?.['last_name'] as string | undefined) ?? '',
        speciality: (doctor?.['speciality'] as string | undefined) ?? 'Médico General',
        ...(doctor?.['senescyt_registration'] != null
          ? { senescytRegistration: doctor['senescyt_registration'] as string }
          : {}),
        ...(doctor?.['phone'] != null ? { phone: doctor['phone'] as string } : {}),
        ...(doctor?.['email'] != null ? { email: doctor['email'] as string } : {}),
      },
      tenant: {
        name: (tenant?.['name'] as string | undefined) ?? '',
        ...(tenant?.['sri_ruc'] != null ? { ruc: tenant['sri_ruc'] as string } : {}),
      },
      patient: {
        firstName: (patient?.['first_name'] as string | undefined) ?? '',
        lastName: (patient?.['last_name'] as string | undefined) ?? '',
        ...(patient?.['cedula'] != null ? { cedula: patient['cedula'] as string } : {}),
        ...(patient?.['birth_date'] != null ? { birthDate: patient['birth_date'] as string } : {}),
        ...(patient?.['sex'] != null ? { sex: patient['sex'] as string } : {}),
      },
      diagnoses: ((p['diagnoses'] as Array<Record<string, unknown>> | undefined) ?? []).map((d) => ({
        cie10Code: d['cie10_code'] as string,
        description: d['description'] as string,
      })),
      medications: ((p['medications'] as Array<Record<string, unknown>> | undefined) ?? []).map((m) => ({
        name: m['name'] as string,
        ...(m['active_ingredient'] != null ? { activeIngredient: m['active_ingredient'] as string } : {}),
        ...(m['concentration'] != null ? { concentration: m['concentration'] as string } : {}),
        ...(m['pharmaceutical_form'] != null ? { pharmaceuticalForm: m['pharmaceutical_form'] as string } : {}),
        quantity: m['quantity'] as number,
        unit: m['unit'] as string,
        dosage: m['dosage'] as PrescriptionPdfInput['medications'][0]['dosage'],
        ...(m['is_controlled'] != null ? { isControlled: m['is_controlled'] as boolean } : {}),
      })),
    };

    const pdfBuffer = await generatePrescriptionPdf(pdfInput);

    const pdfPath = `${req.tenantId}/prescriptions/${req.params['id']}.pdf`;
    await supabaseAdmin.storage
      .from('documents')
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(pdfPath);

    await supabaseAdmin
      .from('prescriptions')
      .update({
        status: 'emitida',
        pdf_storage_path: pdfPath,
        doctor_signed_at: new Date().toISOString(),
      })
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId);

    res.json({ pdfUrl: publicUrl, pdfPath });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /prescriptions/:id/pdf — URL del PDF
prescriptions_Router.get('/:id/pdf', async (req, res) => {
  try {
    const { data: prescription } = await req.supabase
      .from('prescriptions')
      .select('pdf_storage_path')
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .single();

    const storagePath = (prescription as Record<string, unknown> | null)?.['pdf_storage_path'] as string | undefined;
    const pdfUrl = storagePath
      ? supabaseAdmin.storage.from('documents').getPublicUrl(storagePath).data.publicUrl
      : undefined;
    if (!pdfUrl) {
      res.status(404).json({ error: 'PDF no generado. Emita primero la receta.' });
      return;
    }
    res.json({ pdfUrl });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
