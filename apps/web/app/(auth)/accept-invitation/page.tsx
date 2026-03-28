import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AcceptInvitationForm } from '@/components/auth/accept-invitation-form';

export const metadata: Metadata = { title: 'Aceptar invitación' };

interface Props {
  searchParams: Promise<{ token?: string }>;
}

interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  expires_at: string;
  tenants: { name: string; slug: string } | null;
}

export default async function AcceptInvitationPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) redirect('/login');

  const supabase = await createClient();

  const { data } = await supabase
    .from('tenant_invitations')
    .select('id, tenant_id, email, role, expires_at, tenants(name, slug)')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  const invitation = data as unknown as Invitation | null;

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-teal-50 px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <p className="text-5xl">❌</p>
          <h1 className="text-xl font-bold text-gray-900">Invitación inválida o expirada</h1>
          <p className="text-muted-foreground text-sm">
            Este enlace de invitación ya no es válido. Solicita una nueva invitación al administrador
            del consultorio.
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-[#1E40AF] text-white text-sm font-medium h-10 px-6 hover:bg-[#1e3a8a] transition-colors"
          >
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  const tenantName = invitation.tenants?.name ?? 'el consultorio';
  const ROLE_LABELS: Record<string, string> = {
    admin: 'Médico / Administrador',
    secretaria: 'Secretaria',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-teal-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#1E40AF] flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="text-2xl font-bold text-[#1E40AF]">MediCore</span>
          </div>
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-sm font-semibold text-[#1E40AF]">
              Has sido invitado a {tenantName}
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Rol: {ROLE_LABELS[invitation.role] ?? invitation.role}
            </p>
          </div>
        </div>

        <AcceptInvitationForm
          token={token}
          email={invitation.email}
          tenantId={invitation.tenant_id}
          tenantName={tenantName}
          tenantSlug={invitation.tenants?.slug ?? ''}
          role={invitation.role}
          invitationId={invitation.id}
        />
      </div>
    </div>
  );
}
