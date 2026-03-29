import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/dashboard&tenant=${slug}`);
  }

  // Verificar que el usuario pertenece a este tenant
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id, role, first_name, last_name')
    .eq('id', user.id)
    .single();

  if (!profile?.tenant_id) {
    redirect('/onboarding');
  }

  // Verificar que el slug corresponde al tenant del usuario
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug, plan_tier, status')
    .eq('id', profile.tenant_id)
    .eq('slug', slug)
    .single();

  if (!tenant) {
    redirect('/onboarding');
  }

  if (tenant.status === 'suspended') {
    redirect('/suspended');
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'hsl(var(--surface))' }}>
      <AppSidebar
        slug={slug}
        tenantName={tenant.name}
        planTier={tenant.plan_tier}
        userRole={profile.role}
      />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <AppHeader
          userName={`${profile.first_name} ${profile.last_name}`}
          userRole={profile.role}
          tenantName={tenant.name}
        />
        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}
