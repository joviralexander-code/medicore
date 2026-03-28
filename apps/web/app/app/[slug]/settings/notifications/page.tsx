import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NotificationsForm } from '@/components/settings/notifications-form';

export const metadata: Metadata = { title: 'Notificaciones' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function NotificationsSettingsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect(`/app/${slug}/dashboard`);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, settings')
    .eq('slug', slug)
    .single();

  // Defaults si no hay settings guardados
  const settings = (tenant?.settings as Record<string, unknown>) ?? {};
  const notifications = (settings['notifications'] as Record<string, boolean>) ?? {};

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/app/${slug}/settings`} className="hover:text-gray-900 transition-colors">
          Configuración
        </Link>
        <span>›</span>
        <span className="text-gray-900">Notificaciones</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notificaciones</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configura recordatorios y alertas para tu consultorio
        </p>
      </div>

      <NotificationsForm
        tenantId={tenant?.id ?? ''}
        slug={slug}
        initialValues={{
          reminder24h: (notifications['reminder24h'] as boolean) ?? true,
          reminder1h: (notifications['reminder1h'] as boolean) ?? true,
          reminderChannel: typeof notifications['reminderChannel'] === 'string' ? notifications['reminderChannel'] : 'email',
          newBookingAlert: (notifications['newBookingAlert'] as boolean) ?? true,
          prescriptionAlert: (notifications['prescriptionAlert'] as boolean) ?? false,
          sriErrorAlert: (notifications['sriErrorAlert'] as boolean) ?? true,
          tokenExpiryAlert: (notifications['tokenExpiryAlert'] as boolean) ?? true,
        }}
      />
    </div>
  );
}
