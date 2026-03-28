import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Configuración' };

interface SettingsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect(`/app/${slug}/dashboard`);
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select(
      'name, slug, plan_tier, status, sri_ruc, sri_razon_social, sri_ambiente, timezone, currency, settings'
    )
    .eq('slug', slug)
    .single();

  const sections = [
    {
      title: 'Información del consultorio',
      description: 'Nombre, subdominio y datos generales',
      href: `/app/${slug}/settings/general`,
      icon: '🏥',
    },
    {
      title: 'Facturación SRI',
      description: 'RUC, certificado digital, serie y secuencial',
      href: `/app/${slug}/settings/sri`,
      icon: '🧾',
    },
    {
      title: 'Plan y facturación',
      description: 'Gestiona tu suscripción y métodos de pago',
      href: `/app/${slug}/settings/billing`,
      icon: '💳',
    },
    {
      title: 'Usuarios y roles',
      description: 'Invita secretarias y gestiona accesos',
      href: `/app/${slug}/settings/users`,
      icon: '👥',
    },
    {
      title: 'Notificaciones',
      description: 'Recordatorios, alertas y preferencias de email/WhatsApp',
      href: `/app/${slug}/settings/notifications`,
      icon: '🔔',
    },
    {
      title: 'Privacidad y datos',
      description: 'Consentimientos LOPDP y data business',
      href: `/app/${slug}/settings/privacy`,
      icon: '🔒',
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Administra tu consultorio {tenant?.name}
        </p>
      </div>

      {/* Current plan badge */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Plan actual</p>
              <p className="text-xs text-muted-foreground capitalize">
                {tenant?.plan_tier ?? 'free'}
              </p>
            </div>
            <a
              href={`/app/${slug}/settings/billing`}
              className="text-xs text-primary hover:underline"
            >
              Gestionar plan →
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Settings sections */}
      <div className="grid gap-3">
        {sections.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="block p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
          >
            <div className="flex items-center space-x-4">
              <span className="text-2xl">{section.icon}</span>
              <div>
                <p className="text-sm font-medium">{section.title}</p>
                <p className="text-xs text-muted-foreground">
                  {section.description}
                </p>
              </div>
              <span className="ml-auto text-muted-foreground text-sm">→</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
