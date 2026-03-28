/**
 * Helpers para tests de RLS
 * Crea clientes Supabase con JWTs de diferentes roles para verificar políticas
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as jose from 'jose';

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
const JWT_SECRET = process.env['SUPABASE_JWT_SECRET'] ?? 'super-secret-jwt-token-with-at-least-32-characters-long';

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Crea un cliente Supabase con un JWT personalizado (para tests de RLS)
 */
export async function createClientWithRole(
  userId: string,
  tenantId: string | null,
  role: 'admin' | 'secretaria' | 'paciente'
): Promise<SupabaseClient> {
  const secret = new TextEncoder().encode(JWT_SECRET);

  const token = await new jose.SignJWT({
    sub: userId,
    aud: 'authenticated',
    role: 'authenticated',
    // Custom claims inyectados por el hook
    tenant_id: tenantId,
    role: role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

/**
 * Crea un tenant de prueba y retorna su ID
 */
export async function createTestTenant(name: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .insert({ name, slug: name.toLowerCase().replace(/\s/g, '-') })
    .select('id')
    .single();

  if (error) throw new Error(`createTestTenant failed: ${error.message}`);
  return data.id as string;
}

/**
 * Crea un usuario de prueba con un rol específico en un tenant
 */
export async function createTestUser(
  email: string,
  tenantId: string,
  role: 'admin' | 'secretaria' | 'paciente'
): Promise<string> {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
  });

  if (authError || !authData.user) throw new Error(`createTestUser auth failed: ${authError?.message}`);

  await supabaseAdmin
    .from('user_profiles')
    .update({ tenant_id: tenantId, role })
    .eq('id', authData.user.id);

  return authData.user.id;
}

/**
 * Limpia datos de prueba después de cada test suite
 */
export async function cleanupTestData(tenantIds: string[]): Promise<void> {
  for (const tenantId of tenantIds) {
    await supabaseAdmin.from('tenants').delete().eq('id', tenantId);
  }
}
