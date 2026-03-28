import { z } from 'zod';

const appointmentStatuses = [
  'programada', 'confirmada', 'en_proceso', 'completada',
  'cancelada', 'no_show', 'reprogramada',
] as const;

const appointmentSources = [
  'manual', 'portal', 'whatsapp', 'phone', 'walk_in',
] as const;

const consultationTypes = [
  'primera_vez', 'control', 'emergencia', 'teleconsulta', 'domicilio',
] as const;

export const createAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  slotId: z.string().uuid().optional().nullable(),
  appointmentDate: z.coerce.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  consultationType: z.enum(consultationTypes).default('primera_vez'),
  source: z.enum(appointmentSources).default('manual'),
  reason: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateAppointmentSchema = z.object({
  status: z.enum(appointmentStatuses).optional(),
  notes: z.string().max(2000).optional().nullable(),
  cancellationReason: z.string().max(500).optional().nullable(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
