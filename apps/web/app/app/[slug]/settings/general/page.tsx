import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GeneralSettingsForm } from '@/components/settings/general-settings-form';

export const metadata: Metadata = { title: 'Configuración general' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GeneralSettingsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, first_name, last_name, speciality, senescyt_registration, cedula, phone')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect(`/app/${slug}/dashboard`);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug, timezone, currency')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href={`/app/${slug}/settings`} className="hover:text-gray-900 transition-colors">
            Configuración
          </Link>
          <span>›</span>
          <span className="text-gray-900">General</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Información general</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Datos del consultorio y del médico titular
        </p>
      </div>

      <GeneralSettingsForm
        slug={slug}
        tenantId={tenant.id}
        userId={user.id}
        initialTenant={{
          name: tenant.name ?? '',
          timezone: (tenant.timezone as string | null) ?? 'America/Guayaquil',
          currency: (tenant.currency as string | null) ?? 'USD',
        }}
        initialProfile={{
          first_name: profile.first_name ?? '',
          last_name: profile.last_name ?? '',
          speciality: profile.speciality ?? '',
          senescyt_registration: profile.senescyt_registration ?? '',
          cedula: profile.cedula ?? '',
          phone: profile.phone ?? '',
        }}
      />
    </div>
  );
}
