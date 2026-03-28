import { z } from 'zod';
import { SRI_DOC_TYPES } from '../constants/sri';

const paymentMethodsSri = [
  'efectivo', 'cheque', 'debito', 'transferencia',
  'tarjeta_credito', 'tarjeta_debito', 'compensacion',
  'endoso_titulos', 'otros',
] as const;

export const sriItemSchema = z.object({
  codigoPrincipal: z.string().max(25).optional(),
  descripcion: z.string().min(1).max(300),
  cantidad: z.number().positive().multipleOf(0.001),
  precioUnitario: z.number().positive().multipleOf(0.000001),
  descuento: z.number().min(0).default(0),
  ivaPct: z.union([z.literal(0), z.literal(12), z.literal(15), z.literal(-1)]).default(0),
});

export const createSriDocumentSchema = z.object({
  docType: z.enum(SRI_DOC_TYPES),
  // Receptor
  buyerIdType: z.enum(['cedula', 'ruc', 'pasaporte', 'consumidor_final']).default('cedula'),
  buyerId: z.string().min(1).max(20),
  buyerName: z.string().min(1).max(300),
  buyerEmail: z.string().email().optional().nullable(),
  buyerAddress: z.string().max(300).optional().nullable(),
  // Paciente
  patientId: z.string().uuid().optional().nullable(),
  // Items
  items: z.array(sriItemSchema).min(1, 'Debe incluir al menos un ítem'),
  // Pago
  paymentMethod: z.enum(paymentMethodsSri).default('efectivo'),
  paymentDeadlineDays: z.number().int().min(0).default(0),
  // Nota crédito
  modifiedDocId: z.string().uuid().optional().nullable(),
  modificationReason: z.string().max(300).optional().nullable(),
  // Varios
  notes: z.string().max(2000).optional().nullable(),
});

export type SriItemInput = z.infer<typeof sriItemSchema>;
export type CreateSriDocumentInput = z.infer<typeof createSriDocumentSchema>;
