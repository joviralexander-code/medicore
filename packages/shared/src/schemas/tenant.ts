import { z } from 'zod';
import { PLAN_TIERS } from '../constants/plans';

export const tenantSlugSchema = z
  .string()
  .min(3, 'Mínimo 3 caracteres')
  .max(63, 'Máximo 63 caracteres')
  .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones');

export const createTenantSchema = z.object({
  slug: tenantSlugSchema,
  name: z.string().min(2, 'Nombre requerido').max(255),
  planTier: z.enum(PLAN_TIERS).default('free'),
  timezone: z.string().default('America/Guayaquil'),
});

export const updateTenantSchema = createTenantSchema.partial().omit({ slug: true });

export const tenantSriConfigSchema = z.object({
  ruc: z.string().length(13, 'RUC debe tener 13 dígitos').regex(/^\d+$/, 'Solo dígitos'),
  razonSocial: z.string().min(2).max(300),
  nombreComercial: z.string().max(300).optional(),
  direccion: z.string().min(5).max(500),
  telefono: z.string().max(20).optional(),
  email: z.string().email().optional(),
  serie: z.string().length(6, 'Serie debe tener 6 dígitos, ej: 001001').regex(/^\d+$/),
  ambiente: z.union([z.literal(1), z.literal(2)]).default(1),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type TenantSriConfigInput = z.infer<typeof tenantSriConfigSchema>;
