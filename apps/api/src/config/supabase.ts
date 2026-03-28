/**
 * Cliente Supabase con service_role
 * SOLO para usar en el backend (API server, workers)
 * NUNCA importar este módulo desde apps/web
 */

import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Cliente con service_role — bypasea RLS
 * Usar SOLO para operaciones de sistema:
 * - Workers de BullMQ
 * - Operaciones admin privilegiadas
 * - Jobs de ETL/anonimización
 * NUNCA usar para operaciones iniciadas por el usuario final
 */
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Crea un cliente Supabase autenticado con el JWT del usuario
 * Respeta RLS — usar para operaciones del usuario
 */
export function createUserClient(userJwt: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
