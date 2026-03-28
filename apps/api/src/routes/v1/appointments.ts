/**
 * Ruta: /v1/appointments
 * Agenda médica — citas y slots
 */

import { Router } from 'express';
import { staffOnly, adminOnly } from '../../middleware/roles';
import { queues } from '../../jobs/queues';

export const appointments_Router = Router();

// GET /appointments — citas del tenant (filtrable por fecha, estado, doctor)
appointments_Router.get('/', staffOnly, async (req, res) => {
  try {
    const {
      date, date_from, date_to,
      status, doctor_id, patient_id,
      page = '1', limit = '50',
    } = req.query as Record<string, string>;

    const from = (parseInt(page) - 1) * parseInt(limit);
    const to = from + parseInt(limit) - 1;

    let query = req.supabase
      .from('appointments')
      .select(
        'id, appointment_date, start_time, end_time, consultation_type, status, source, reminder_24h_sent, reminder_1h_sent, patients(first_name, last_name, phone, cedula), user_profiles(first_name, last_name)',
        { count: 'exact' }
      )
      .eq('tenant_id', req.tenantId)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true })
      .range(from, to);

    if (date) query = query.eq('appointment_date', date);
    if (date_from) query = query.gte('appointment_date', date_from);
    if (date_to) query = query.lte('appointment_date', date_to);
    if (status) query = query.eq('status', status);
    if (doctor_id) query = query.eq('doctor_id', doctor_id);
    if (patient_id) query = query.eq('patient_id', patient_id);

    const { data, error, count } = await query;
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /appointments/:id
appointments_Router.get('/:id', staffOnly, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('appointments')
      .select('*, patients(first_name, last_name, phone, email, cedula), user_profiles(first_name, last_name, speciality)')
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error) { res.status(404).json({ error: 'Cita no encontrada' }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /appointments — crear cita
appointments_Router.post('/', staffOnly, async (req, res) => {
  try {
    const body = req.body as {
      patient_id: string;
      doctor_id?: string;
      appointment_date: string;
      start_time: string;
      end_time: string;
      consultation_type: string;
      slot_id?: string;
      notes?: string;
    };

    const insertPayload: Record<string, unknown> = {
      tenant_id: req.tenantId,
      patient_id: body.patient_id,
      doctor_id: body.doctor_id ?? req.auth.userId,
      appointment_date: body.appointment_date,
      start_time: body.start_time,
      end_time: body.end_time,
      consultation_type: body.consultation_type,
      status: 'confirmada',
      source: 'app',
      reminder_24h_sent: false,
      reminder_1h_sent: false,
    };
    if (body.slot_id !== undefined) insertPayload['slot_id'] = body.slot_id;
    if (body.notes !== undefined) insertPayload['notes'] = body.notes;

    const { data, error } = await req.supabase
      .from('appointments')
      .insert(insertPayload)
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }

    const appt = data as Record<string, unknown>;

    // Schedule reminders via BullMQ
    const apptDateStr = appt['appointment_date'] as string;
    const startTimeStr = appt['start_time'] as string;
    const apptDateTime = new Date(`${apptDateStr}T${startTimeStr}`);

    const now = Date.now();
    const reminder24hAt = apptDateTime.getTime() - 24 * 60 * 60 * 1000;
    const reminder1hAt = apptDateTime.getTime() - 60 * 60 * 1000;

    if (reminder24hAt > now) {
      await queues.reminder.add(
        `reminder-24h-${appt['id']}`,
        { appointmentId: appt['id'], type: '24h' },
        { delay: reminder24hAt - now, removeOnComplete: true }
      );
    }

    if (reminder1hAt > now) {
      await queues.reminder.add(
        `reminder-1h-${appt['id']}`,
        { appointmentId: appt['id'], type: '1h' },
        { delay: reminder1hAt - now, removeOnComplete: true }
      );
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /appointments/:id — actualizar cita (estado, notas, rescheduling)
appointments_Router.patch('/:id', staffOnly, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const allowed = ['status', 'appointment_date', 'start_time', 'end_time', 'notes', 'consultation_type', 'doctor_id'];
    const updates: Record<string, unknown> = {};

    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Track rescheduling
    if (body['appointment_date'] !== undefined || body['start_time'] !== undefined) {
      updates['rescheduled_from'] = req.params['id'];
    }

    const { data, error } = await req.supabase
      .from('appointments')
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

// DELETE /appointments/:id — cancelar (soft delete via status)
appointments_Router.delete('/:id', staffOnly, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('appointments')
      .update({ status: 'cancelada' })
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .select('id, status')
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /appointments/slots — slots disponibles por fecha y doctor
appointments_Router.get('/slots', staffOnly, async (req, res) => {
  try {
    const { date, doctor_id } = req.query as Record<string, string>;

    if (!date) { res.status(400).json({ error: 'date requerido' }); return; }

    let query = req.supabase
      .from('appointment_slots')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .eq('date', date)
      .eq('is_available', true)
      .eq('is_blocked', false)
      .order('start_time');

    if (doctor_id) query = query.eq('doctor_id', doctor_id);

    const { data, error } = await query;
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /appointments/slots — crear slots
appointments_Router.post('/slots', adminOnly, async (req, res) => {
  try {
    const body = req.body as {
      date: string;
      doctor_id?: string;
      slots: Array<{ start_time: string; end_time: string }>;
    };

    const rows = body.slots.map((s) => ({
      tenant_id: req.tenantId,
      doctor_id: body.doctor_id ?? req.auth.userId,
      date: body.date,
      start_time: s.start_time,
      end_time: s.end_time,
      is_available: true,
      is_blocked: false,
    }));

    const { data, error } = await req.supabase
      .from('appointment_slots')
      .upsert(rows, { onConflict: 'tenant_id,doctor_id,date,start_time' })
      .select();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
