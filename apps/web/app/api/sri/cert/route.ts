import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createAdmin(
  process.env['NEXT_PUBLIC_SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { persistSession: false } }
);

function encryptPassword(plain: string): string {
  const rawKey = process.env['SRI_CERT_ENCRYPTION_KEY'] ?? 'fallback-key-32-bytes-padding!!';
  const key = Buffer.alloc(32);
  Buffer.from(rawKey).copy(key);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export async function POST(request: NextRequest) {
  // Verify session via Bearer token
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return NextResponse.json({ message: 'No autorizado' }, { status: 401 });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ message: 'Sesión inválida' }, { status: 401 });

  // Check user is admin
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ message: 'Sin permisos' }, { status: 403 });
  }

  const body = await request.json() as { p12Base64: string; password: string };

  if (!body.p12Base64 || !body.password) {
    return NextResponse.json({ message: 'Faltan datos del certificado' }, { status: 400 });
  }

  const certBuffer = Buffer.from(body.p12Base64, 'base64');
  const encryptedPassword = encryptPassword(body.password);

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      sri_cert_p12: certBuffer,
      sri_cert_password: encryptedPassword,
    })
    .eq('id', profile.tenant_id);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
