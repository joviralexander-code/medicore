import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppointmentForm } from '@/components/agenda/appointment-form';

export const metadata: Metadata = { title: 'Nueva Cita' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ patient?: string; date?: string }>;
}

export default async function NewAppointmentPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { patient: patientParam, date: dateParam } = await searchParams;
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
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/app/${slug}/agenda${dateParam ? `?date=${dateParam}` : ''}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-900 transition-colors"
        >
          ← Volver a la agenda
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva cita</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Complete los datos de la cita. Los campos con{' '}
          <span className="text-red-500 font-medium">*</span> son obligatorios.
        </p>
      </div>

      <AppointmentForm
        slug={slug}
        tenantId={tenant.id}
        {...(patientParam !== undefined ? { preselectedPatientId: patientParam } : {})}
        {...(preselectedPatientName !== undefined ? { preselectedPatientName } : {})}
        {...(dateParam !== undefined ? { preselectedDate: dateParam } : {})}
      />
    </div>
  );
}
