import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConsultationForm } from '@/components/clinical/consultation-form';

export const metadata: Metadata = { title: 'Nueva Consulta' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ patient?: string }>;
}

export default async function NewConsultationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { patient: patientParam } = await searchParams;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) {
    redirect('/onboarding');
  }

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
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={
            patientParam
              ? `/app/${slug}/patients/${patientParam}`
              : `/app/${slug}/clinical`
          }
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-900 transition-colors"
        >
          ← Volver
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva consulta</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Complete los datos de la consulta. Los campos con{' '}
          <span className="text-red-500 font-medium">*</span> son obligatorios.
        </p>
      </div>

      <ConsultationForm
        slug={slug}
        tenantId={tenant.id}
        {...(patientParam !== undefined ? { preselectedPatientId: patientParam } : {})}
        {...(preselectedPatientName !== undefined ? { preselectedPatientName } : {})}
      />
    </div>
  );
}
