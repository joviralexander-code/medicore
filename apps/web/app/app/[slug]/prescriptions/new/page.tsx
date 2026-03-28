import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PrescriptionForm } from '@/components/prescriptions/prescription-form';

export const metadata: Metadata = { title: 'Nueva Receta' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ patient?: string }>;
}

export default async function NewPrescriptionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { patient: patientParam } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login`);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  // Get doctor profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, first_name, last_name')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/onboarding');

  // If patient is preselected, fetch name
  let preselectedPatientName: string | undefined;
  if (patientParam) {
    const { data: patient } = await supabase
      .from('patients')
      .select('first_name, last_name')
      .eq('id', patientParam)
      .eq('tenant_id', tenant.id)
      .single();
    if (patient) {
      preselectedPatientName = `${patient.first_name} ${patient.last_name}`;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href={`/app/${slug}/prescriptions`} className="hover:text-gray-900 transition-colors">
            Recetas
          </Link>
          <span>›</span>
          <span className="text-gray-900">Nueva receta</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva Receta Médica</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Dr. {profile.first_name} {profile.last_name}
        </p>
      </div>

      <PrescriptionForm
        slug={slug}
        tenantId={tenant.id}
        doctorId={profile.id}
        {...(patientParam !== undefined ? { preselectedPatientId: patientParam } : {})}
        {...(preselectedPatientName !== undefined ? { preselectedPatientName } : {})}
      />
    </div>
  );
}
