/**
 * Worker: appointment-reminder
 * Envía recordatorios a pacientes (24h y 1h antes)
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../config/redis';
import { supabaseAdmin } from '../../config/supabase';

interface ReminderJobData {
  appointmentId: string;
  type: '24h' | '1h';
}

async function processReminder(job: Job): Promise<void> {
  const { appointmentId, type } = job.data as ReminderJobData;

  const { data: appt } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, appointment_date, start_time, status,
      patients(first_name, last_name, phone, email),
      tenants(name, settings),
      reminder_24h_sent, reminder_1h_sent
    `)
    .eq('id', appointmentId)
    .single();

  if (!appt) return;

  const a = appt as Record<string, unknown>;
  if (a['status'] === 'cancelada' || a['status'] === 'completada') return;

  const already24h = a['reminder_24h_sent'] as boolean;
  const already1h = a['reminder_1h_sent'] as boolean;

  if (type === '24h' && already24h) return;
  if (type === '1h' && already1h) return;

  const patient = a['patients'] as Record<string, string> | null;
  const tenant = a['tenants'] as Record<string, unknown> | null;
  const settings = (tenant?.['settings'] as Record<string, unknown>) ?? {};
  const notifications = (settings['notifications'] as Record<string, unknown>) ?? {};
  const channel = (notifications['reminderChannel'] as string) ?? 'email';

  const patientName = patient
    ? `${patient['first_name']} ${patient['last_name']}`
    : 'Paciente';
  const clinicName = (tenant?.['name'] as string) ?? 'el consultorio';
  const date = a['appointment_date'] as string;
  const time = (a['start_time'] as string).slice(0, 5);
  const timeLabel = type === '24h' ? 'mañana' : 'en 1 hora';

  const messageText = `Hola ${patientName}, le recordamos que tiene una cita en ${clinicName} ${timeLabel} (${date} a las ${time}). Si necesita cancelar, contáctenos.`;

  // Send via email if configured
  if ((channel === 'email' || channel === 'both') && patient?.['email']) {
    // TODO: integrate Resend email sending
    console.log(`[reminder] Email to ${patient['email']}: ${messageText}`);
  }

  // Send via WhatsApp if configured
  if ((channel === 'whatsapp' || channel === 'both') && patient?.['phone']) {
    // TODO: integrate WhatsApp sending
    console.log(`[reminder] WhatsApp to ${patient['phone']}: ${messageText}`);
  }

  // Mark as sent
  const updateField = type === '24h' ? 'reminder_24h_sent' : 'reminder_1h_sent';
  await supabaseAdmin
    .from('appointments')
    .update({ [updateField]: true })
    .eq('id', appointmentId);
}

export function startReminderWorker() {
  const worker = new Worker('appointment-reminder', processReminder, {
    connection: redis,
    concurrency: 10,
  });

  worker.on('failed', (job, err) => {
    console.error(`[reminder-worker] Job ${job?.id} failed:`, err);
  });

  return worker;
}
