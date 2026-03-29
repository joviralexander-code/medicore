import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/components/auth/onboarding-wizard';

export const metadata: Metadata = {
  title: 'Configurar tu cuenta',
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Si ya completó el onboarding, redirigir al dashboard
  // Leemos user_profiles directamente (tenant_id en JWT puede estar desactualizado)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id, tenants(slug)')
    .eq('id', user.id)
    .single();

  const tenants = profile?.tenants as unknown as { slug: string } | null;
  const tenantSlug = tenants?.slug;
  if (tenantSlug) {
    redirect(`/app/${tenantSlug}/dashboard`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#1E40AF] flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="text-2xl font-bold text-[#1E40AF]">MediCore</span>
          </div>
          <p className="text-muted-foreground">
            Configuremos tu consultorio en 3 pasos
          </p>
        </div>
        <OnboardingWizard userEmail={user.email ?? ''} />
      </div>
    </div>
  );
}
