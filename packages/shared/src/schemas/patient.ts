import { z } from 'zod';

const sexTypes = ['masculino', 'femenino', 'otro'] as const;
const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'desconocido'] as const;
const civilStatuses = ['soltero', 'casado', 'divorciado', 'viudo', 'union_libre'] as const;
const insuranceTypes = ['iess', 'issfa', 'isspol', 'privado', 'ninguno'] as const;

export const createPacienteSchema = z.object({
  cedula: z
    .string()
    .max(13)
    .optional()
    .nullable(),
  cedulaType: z.enum(['cedula', 'pasaporte', 'ruc']).default('cedula'),
  firstName: z
    .string()
    .min(2, 'Nombre requerido')
    .max(100)
    .transform((v) => v.trim()),
  lastName: z
    .string()
    .min(2, 'Apellido requerido')
    .max(100)
    .transform((v) => v.trim()),
  birthDate: z.coerce.date().optional().nullable(),
  sex: z.enum(sexTypes).optional().nullable(),
  civilStatus: z.enum(civilStatuses).optional().nullable(),
  nationality: z.string().max(100).default('Ecuatoriana'),
  email: z.string().email('Email inválido').max(255).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  phoneAlt: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  bloodType: z.enum(bloodTypes).default('desconocido'),
  allergies: z.array(z.string().max(200)).default([]),
  chronicConditions: z.array(z.string().max(200)).default([]),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: z.string().max(20).optional().nullable(),
  insuranceType: z.enum(insuranceTypes).default('ninguno'),
  insuranceNumber: z.string().max(50).optional().nullable(),
  insuranceCompany: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  dataConsent: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
});

export const updatePacienteSchema = createPacienteSchema.partial();

export type CreatePacienteInput = z.infer<typeof createPacienteSchema>;
export type UpdatePacienteInput = z.infer<typeof updatePacienteSchema>;
