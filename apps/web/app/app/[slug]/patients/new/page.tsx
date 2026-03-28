import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PatientForm } from '@/components/patients/patient-form';

export const metadata: Metadata = { title: 'Nuevo Paciente' };

interface NewPatientPageProps {
  params: Promise<{ slug: string }>;
}

export default async function NewPatientPage({ params }: NewPatientPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) {
    redirect('/onboarding');
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/app/${slug}/patients`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-900 transition-colors"
        >
          ← Volver a pacientes
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo paciente</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Complete los datos del paciente. Los campos con{' '}
          <span className="text-red-500 font-medium">*</span> son obligatorios.
        </p>
      </div>

      <PatientForm slug={slug} tenantId={tenant.id} />
    </div>
  );
}
