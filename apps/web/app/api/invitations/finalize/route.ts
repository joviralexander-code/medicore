import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

interface FinalizeBody {
  userId: string;
  invitationId: string;
  tenantId: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as FinalizeBody;
  const { userId, invitationId, tenantId, role, firstName, lastName } = body;

  if (!userId || !invitationId || !tenantId || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify the invitation exists and belongs to this tenant (prevents forged requests)
  const supabaseAdmin = createSupabaseAdmin(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } }
  );

  const { data: invitation } = await supabaseAdmin
    .from('tenant_invitations')
    .select('id, tenant_id, role')
    .eq('id', invitationId)
    .eq('tenant_id', tenantId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ error: 'Invitación inválida o expirada.' }, { status: 404 });
  }

  // Upsert profile — service role bypasses RLS, safe because we verified the invitation
  const profilePayload: Record<string, unknown> = {
    id:        userId,
    tenant_id: tenantId,
    role:      invitation.role, // use DB-stored role, not caller-supplied role
    is_active: true,
  };
  if (firstName) profilePayload['first_name'] = firstName;
  if (lastName)  profilePayload['last_name']  = lastName;

  const { error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Delete invitation so it can't be reused
  await supabaseAdmin.from('tenant_invitations').delete().eq('id', invitationId);

  return NextResponse.json({ ok: true });
}
