import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PrivacyConsentForm } from '@/components/settings/privacy-consent-form';

export const metadata: Metadata = { title: 'Privacidad y datos' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PrivacySettingsPage({ params }: Props) {
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

  if (profile?.role !== 'admin') redirect(`/app/${slug}/dashboard`);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, plan_tier, name')
    .eq('slug', slug)
    .single();

  const { data: dataConsent } = await supabase
    .from('data_business_consent')
    .select('consented, consented_at')
    .eq('tenant_id', tenant?.id ?? '')
    .maybeSingle();

  const isDataBusinessPlan =
    tenant?.plan_tier === 'clinica' || tenant?.plan_tier === 'enterprise';

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/app/${slug}/settings`} className="hover:text-gray-900 transition-colors">
          Configuración
        </Link>
        <span>›</span>
        <span className="text-gray-900">Privacidad y datos</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Privacidad y datos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gestiona los consentimientos LOPDP y el programa de datos
        </p>
      </div>

      {/* LOPDP info */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <p className="font-semibold text-white text-sm">⚖️ Ley Orgánica de Protección de Datos Personales (LOPDP)</p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">
            MediCore Ecuador cumple con la{' '}
            <strong>Ley Orgánica de Protección de Datos Personales del Ecuador</strong>{' '}
            (LOPDP, vigente desde mayo 2023). Como responsable del tratamiento, tu consultorio
            tiene las siguientes obligaciones:
          </p>
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              'Obtener consentimiento explícito de cada paciente antes de procesar sus datos',
              'Informar a los pacientes sobre el uso de sus datos',
              'Permitir a los pacientes acceder, rectificar y eliminar sus datos',
              'Reportar brechas de seguridad a la DINARDAP en 72 horas',
              'Mantener un registro de actividades de tratamiento',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <strong>Audit trail:</strong> MediCore registra automáticamente todos los accesos a
            datos de pacientes (consultas, prescripciones, facturas) en el log de auditoría,
            incluido el usuario, IP y timestamp.
          </div>
        </div>
      </div>

      {/* Patient data consent tracking */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <p className="font-semibold text-gray-900 text-sm">📋 Consentimientos de pacientes</p>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-sm text-gray-700">
            El formulario de agendamiento del portal y el formulario de nuevo paciente incluyen
            una casilla de consentimiento informado. El sistema almacena la fecha y hora del
            consentimiento para cada paciente.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border bg-gray-50 p-4">
              <p className="text-xs text-muted-foreground">Consentimiento requerido en</p>
              <p className="text-sm font-medium mt-1">Portal de pacientes</p>
              <p className="text-sm font-medium">Nuevo paciente (app)</p>
            </div>
            <div className="rounded-lg border bg-gray-50 p-4">
              <p className="text-xs text-muted-foreground">Campos almacenados</p>
              <p className="text-sm font-medium mt-1">data_consent: boolean</p>
              <p className="text-sm font-medium">data_consent_date: timestamp</p>
            </div>
          </div>
        </div>
      </div>

      {/* Data Business Program */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <p className="font-semibold text-gray-900 text-sm">💰 Programa de datos (Data Business)</p>
          {!isDataBusinessPlan && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full ml-2">
              Plan Clínica o Enterprise
            </span>
          )}
        </div>
        {isDataBusinessPlan ? (
          <div className="p-6">
            <p className="text-sm text-gray-700 mb-4">
              El programa de datos te permite monetizar información clínica anónima. Los datos
              se procesan con <strong>k-anonimidad ≥ 5</strong> y se eliminan todos los
              identificadores personales antes de cualquier exportación.
            </p>
            <PrivacyConsentForm
              tenantId={tenant?.id ?? ''}
              initialConsented={dataConsent?.consented ?? false}
              consentedAt={dataConsent?.consented_at as string | null ?? null}
            />
          </div>
        ) : (
          <div className="p-6">
            <p className="text-sm text-muted-foreground">
              El programa de datos está disponible en los planes{' '}
              <strong>Clínica</strong> y <strong>Enterprise</strong>. Genera ingresos
              adicionales compartiendo datos clínicos anonimizados con farmacéuticas e
              investigadores.
            </p>
            <Link
              href={`/app/${slug}/settings/billing`}
              className="inline-block mt-3 text-sm text-primary hover:underline"
            >
              Actualizar plan →
            </Link>
          </div>
        )}
      </div>

      {/* Data deletion */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <p className="font-semibold text-gray-900 text-sm">🗑️ Eliminación de datos</p>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-sm text-gray-700">
            Para solicitar la eliminación completa de los datos de tu consultorio (derecho al
            olvido, LOPDP Art. 24), contacta a soporte con el asunto{' '}
            <strong>"Solicitud eliminación de datos"</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            El proceso tarda 30 días hábiles y es irreversible. Se conservarán únicamente los
            datos requeridos por la LOPDP y regulaciones tributarias (SRI) por el tiempo mínimo
            legal.
          </p>
          <a
            href="mailto:privacidad@plexomed.com?subject=Solicitud eliminación de datos"
            className="inline-block text-sm text-red-600 hover:underline"
          >
            Solicitar eliminación de datos →
          </a>
        </div>
      </div>
    </div>
  );
}
