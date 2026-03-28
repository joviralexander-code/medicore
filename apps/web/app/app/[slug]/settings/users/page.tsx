import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteUserForm } from '@/components/settings/invite-user-form';

export const metadata: Metadata = { title: 'Usuarios y roles' };

interface Props {
  params: Promise<{ slug: string }>;
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  cedula: string | null;
  phone: string | null;
  is_active: boolean;
  last_login: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expires_at: string;
}

const ROLE_LABELS: Record<string, { label: string; cls: string }> = {
  admin:      { label: 'Médico / Admin', cls: 'bg-blue-100 text-blue-800' },
  secretaria: { label: 'Secretaria',     cls: 'bg-teal-100 text-teal-800' },
  paciente:   { label: 'Paciente',       cls: 'bg-gray-100 text-gray-600' },
};

export default async function UsersPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: currentProfile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (currentProfile?.role !== 'admin') redirect(`/app/${slug}/dashboard`);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, plan_tier')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  const [profilesResult, invitationsResult] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, first_name, last_name, role, cedula, phone, is_active, last_login')
      .eq('tenant_id', tenant.id)
      .order('role')
      .order('last_name'),
    supabase
      .from('tenant_invitations')
      .select('id, email, role, expires_at')
      .eq('tenant_id', tenant.id)
      .gt('expires_at', new Date().toISOString()),
  ]);

  const profiles    = (profilesResult.data as unknown as UserProfile[]) ?? [];
  const invitations = (invitationsResult.data as unknown as Invitation[]) ?? [];
  const staffCount  = profiles.filter((p) => p.role !== 'paciente').length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href={`/app/${slug}/settings`} className="hover:text-gray-900 transition-colors">
            Configuración
          </Link>
          <span>›</span>
          <span className="text-gray-900">Usuarios y roles</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Usuarios y roles</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gestiona el acceso al consultorio
        </p>
      </div>

      {/* Invite form */}
      <InviteUserForm
        slug={slug}
        tenantId={tenant.id}
        tenantName={(tenant as unknown as { name: string }).name ?? slug}
        planTier={tenant.plan_tier ?? 'free'}
      />

      {/* Active users */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Equipo activo
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {staffCount} miembro{staffCount !== 1 ? 's' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {profiles.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Sin usuarios</p>
          ) : (
            <div className="divide-y">
              {profiles
                .filter((p) => p.role !== 'paciente')
                .map((p) => {
                  const roleEntry = ROLE_LABELS[p.role] ?? { label: p.role, cls: 'bg-gray-100 text-gray-600' };
                  const isCurrentUser = p.id === user.id;
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-semibold text-sm">
                          {(p.first_name ?? '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900">
                          {p.first_name} {p.last_name}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-muted-foreground">(tú)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.cedula ?? '—'}
                          {p.phone ? ` · ${p.phone}` : ''}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleEntry.cls}`}>
                        {roleEntry.label}
                      </span>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.is_active ? 'bg-green-400' : 'bg-gray-300'}`} />
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invitaciones pendientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {invitations.map((inv) => {
                const roleEntry = ROLE_LABELS[inv.role] ?? { label: inv.role, cls: 'bg-gray-100 text-gray-600' };
                const expires = new Date(inv.expires_at);
                const daysLeft = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={inv.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-9 h-9 rounded-full bg-yellow-50 flex items-center justify-center flex-shrink-0">
                      <span className="text-yellow-600 text-sm">✉</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Expira en {daysLeft} día{daysLeft !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleEntry.cls}`}>
                      {roleEntry.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
