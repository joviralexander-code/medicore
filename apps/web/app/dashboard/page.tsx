import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardRedirectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id, tenants(slug)')
    .eq('id', user.id)
    .single();

  const tenants = profile?.tenants as unknown as { slug: string } | null;
  const tenantSlug = tenants?.slug;

  if (!tenantSlug) {
    redirect('/onboarding');
  }

  redirect(`/app/${tenantSlug}/dashboard`);
}
