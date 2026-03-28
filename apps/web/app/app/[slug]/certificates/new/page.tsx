import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { NewCertificatePage } from '@/components/certificates/new-certificate-page';

export const metadata: Metadata = { title: 'Nuevo certificado médico' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ patient?: string }>;
}

export default async function CertificatesNewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { patient: patientParam } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/onboarding');

  // Preselected patient
  let prePatient: { id: string; first_name: string; last_name: string } | null = null;
  if (patientParam) {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .eq('id', patientParam)
      .eq('tenant_id', tenant.id)
      .single();
    if (data) prePatient = data;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href={`/app/${slug}/certificates`} className="hover:text-gray-900 transition-colors">
            Certificados
          </Link>
          <span>›</span>
          <span className="text-gray-900">Nuevo</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo certificado médico</h1>
      </div>

      <NewCertificatePage
        tenantId={tenant.id}
        doctorId={profile.id}
        slug={slug}
        prePatient={prePatient}
      />
    </div>
  );
}
