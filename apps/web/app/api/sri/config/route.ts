import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

const supabaseAdmin = createAdmin(
  process.env['NEXT_PUBLIC_SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { persistSession: false } }
);

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

  const body = await request.json() as {
    ruc: string;
    razonSocial: string;
    nombreComercial?: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    serie: string;
    ambiente: number;
  };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      sri_ruc: body.ruc,
      sri_razon_social: body.razonSocial,
      sri_nombre_comercial: body.nombreComercial ?? null,
      sri_direccion: body.direccion ?? null,
      sri_telefono: body.telefono ?? null,
      sri_email: body.email ?? null,
      sri_serie: body.serie,
      sri_ambiente: body.ambiente,
    })
    .eq('id', profile.tenant_id);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
