import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConsultationCertificates } from '@/components/certificates/consultation-certificates';

export const metadata: Metadata = { title: 'Historial del paciente' };

interface PatientDetailPageProps {
  params: Promise<{ slug: string; id: string }>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Diagnosis {
  cie10_code: string;
  description: string;
}

interface Vitals {
  weight?: number;
  height?: number;
  bp_systolic?: number;
  bp_diastolic?: number;
  heart_rate?: number;
  temperature?: number;
  oxygen_saturation?: number;
}

interface Consultation {
  id: string;
  doctor_id: string | null;
  consultation_date: string;
  consultation_type: string | null;
  reason: string | null;
  diagnoses: Diagnosis[] | null;
  vitals: Vitals | null;
  is_signed: boolean;
}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  cedula_type: string | null;
  cedula: string | null;
  birth_date: string | null;
  sex: string | null;
  civil_status: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  blood_type: string | null;
  allergies: string[] | null;
  chronic_conditions: string[] | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  insurance_type: string | null;
  insurance_number: string | null;
  insurance_company: string | null;
  insurance_coverage_pct: number | null;
  data_consent: boolean;
  marketing_consent: boolean | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  return Math.floor(
    (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  );
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr));
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const INSURANCE_LABELS: Record<string, string> = {
  ninguno: 'Ninguno',
  iess: 'IESS',
  issfa: 'ISSFA',
  isspol: 'ISSPOL',
  privado: 'Privado',
};

const SEX_LABELS: Record<string, string> = {
  masculino: 'Masculino',
  femenino: 'Femenino',
  otro: 'Otro',
};

const CIVIL_LABELS: Record<string, string> = {
  soltero: 'Soltero/a',
  casado: 'Casado/a',
  divorciado: 'Divorciado/a',
  viudo: 'Viudo/a',
  'unión libre': 'Unión libre',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}

function TagChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
      {label}
    </span>
  );
}

function ConsultationCard({
  consultation, tenantId, patientId, patientName,
}: {
  consultation: Consultation;
  tenantId: string;
  patientId: string;
  patientName: string;
}) {
  const diagnoses = consultation.diagnoses ?? [];

  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-gray-800">
            {formatDate(consultation.consultation_date)}
          </p>
          {consultation.consultation_type && (
            <p className="text-xs text-muted-foreground">
              {capitalizeFirst(consultation.consultation_type)}
            </p>
          )}
        </div>
        {consultation.is_signed && (
          <span className="shrink-0 inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
            ✓ Firmada
          </span>
        )}
      </div>

      {consultation.reason && (
        <p className="text-sm text-gray-700">
          <span className="font-medium">Motivo:</span> {consultation.reason}
        </p>
      )}

      {diagnoses.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500">Diagnósticos:</p>
          <ul className="space-y-0.5">
            {diagnoses.map((d, i) => (
              <li key={i} className="text-xs text-gray-700">
                <span className="font-mono bg-gray-100 px-1 rounded text-gray-600 mr-1.5">
                  {d.cie10_code}
                </span>
                {d.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Certificates linked to this consultation */}
      <div className="pt-1 border-t border-gray-100">
        <ConsultationCertificates
          tenantId={tenantId}
          patientId={patientId}
          patientName={patientName}
          consultationId={consultation.id}
          doctorId={consultation.doctor_id ?? ''}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PatientDetailPage({ params }: PatientDetailPageProps) {
  const { slug, id } = await params;
  const supabase = await createClient();

  // Resolve tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) {
    redirect('/onboarding');
  }

  const tenantId = tenant.id;

  // Fetch patient and consultations in parallel
  const [patientResult, consultationsResult] = await Promise.all([
    supabase
      .from('patients')
      .select(
        'id, first_name, last_name, cedula_type, cedula, birth_date, sex, civil_status, nationality, phone, email, address, province, city, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, insurance_type, insurance_number, insurance_company, insurance_coverage_pct, data_consent, marketing_consent'
      )
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('consultations')
      .select(
        'id, consultation_date, consultation_type, reason, diagnoses, vitals, is_signed, doctor_id'
      )
      .eq('patient_id', id)
      .eq('tenant_id', tenantId)
      .order('consultation_date', { ascending: false })
      .limit(50),
  ]);

  if (!patientResult.data) {
    redirect(`/app/${slug}/patients`);
  }

  const patient = patientResult.data as Patient;
  const consultations = (consultationsResult.data ?? []) as Consultation[];
  const age = calcAge(patient.birth_date);

  const fullName = `${patient.first_name} ${patient.last_name}`;
  const locationParts = [patient.city, patient.province].filter(Boolean);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/app/${slug}/patients`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-900 transition-colors mb-1"
          >
            ← Volver a pacientes
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
            {age !== null && (
              <span className="inline-flex items-center bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full">
                {age} años
              </span>
            )}
            {patient.blood_type && patient.blood_type !== 'desconocido' && (
              <span className="inline-flex items-center bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                {patient.blood_type}
              </span>
            )}
          </div>
          {patient.cedula && (
            <p className="text-sm text-muted-foreground">
              {patient.cedula_type ? capitalizeFirst(patient.cedula_type) : 'Documento'}: {patient.cedula}
            </p>
          )}
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href={`/app/${slug}/patients/${id}/edit`}>Editar paciente</Link>
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Two-column layout                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ---------------------------------------------------------------- */}
        {/* Left: Historial clínico (2/3)                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  🩺 Historial clínico
                  <span className="text-xs font-normal text-muted-foreground">
                    ({consultations.length} consulta{consultations.length !== 1 ? 's' : ''})
                  </span>
                </CardTitle>
                <Button asChild size="sm">
                  <Link href={`/app/${slug}/clinical/new?patient=${id}`}>
                    + Nueva consulta
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {consultations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-4xl mb-3">🩺</p>
                  <p className="font-medium">Sin consultas aún</p>
                  <p className="text-sm mt-1">
                    Registra la primera consulta de este paciente.
                  </p>
                </div>
              ) : (
                consultations.map((c) => (
                  <ConsultationCard key={c.id} consultation={c} tenantId={tenantId} patientId={patient.id} patientName={fullName} />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right: Sidebar (1/3)                                             */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-4">
          {/* Patient info card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">
                👤 Información del paciente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {/* Datos personales */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Datos personales
                </p>
                <InfoRow
                  label="Sexo"
                  value={patient.sex ? SEX_LABELS[patient.sex] ?? patient.sex : null}
                />
                <InfoRow
                  label="Estado civil"
                  value={
                    patient.civil_status
                      ? CIVIL_LABELS[patient.civil_status] ?? patient.civil_status
                      : null
                  }
                />
                <InfoRow label="Nacionalidad" value={patient.nationality} />
                {patient.birth_date && (
                  <InfoRow
                    label="Fecha de nacimiento"
                    value={formatDate(patient.birth_date)}
                  />
                )}
              </div>

              <hr />

              {/* Contacto */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Contacto
                </p>
                {patient.phone && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Teléfono</span>
                    <a
                      href={`tel:${patient.phone}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {patient.phone}
                    </a>
                  </div>
                )}
                {patient.email && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Email</span>
                    <a
                      href={`mailto:${patient.email}`}
                      className="text-sm font-medium text-primary hover:underline truncate"
                    >
                      {patient.email}
                    </a>
                  </div>
                )}
                {locationParts.length > 0 && (
                  <InfoRow label="Ubicación" value={locationParts.join(', ')} />
                )}
                {patient.address && (
                  <InfoRow label="Dirección" value={patient.address} />
                )}
              </div>

              {/* Datos médicos */}
              {(patient.blood_type ||
                (patient.allergies && patient.allergies.length > 0) ||
                (patient.chronic_conditions && patient.chronic_conditions.length > 0) ||
                patient.emergency_contact_name) && (
                <>
                  <hr />
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Datos médicos
                    </p>
                    {patient.blood_type && (
                      <InfoRow label="Tipo de sangre" value={patient.blood_type} />
                    )}
                    {patient.allergies && patient.allergies.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Alergias</span>
                        <div className="flex flex-wrap gap-1">
                          {patient.allergies.map((a) => (
                            <TagChip key={a} label={a} />
                          ))}
                        </div>
                      </div>
                    )}
                    {patient.chronic_conditions && patient.chronic_conditions.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">
                          Condiciones crónicas
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {patient.chronic_conditions.map((c) => (
                            <TagChip key={c} label={c} />
                          ))}
                        </div>
                      </div>
                    )}
                    {patient.emergency_contact_name && (
                      <InfoRow
                        label="Contacto de emergencia"
                        value={
                          patient.emergency_contact_phone
                            ? `${patient.emergency_contact_name} — ${patient.emergency_contact_phone}`
                            : patient.emergency_contact_name
                        }
                      />
                    )}
                  </div>
                </>
              )}

              {/* Seguro médico */}
              {patient.insurance_type && patient.insurance_type !== 'ninguno' && (
                <>
                  <hr />
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Seguro médico
                    </p>
                    <InfoRow
                      label="Tipo"
                      value={INSURANCE_LABELS[patient.insurance_type] ?? patient.insurance_type}
                    />
                    {patient.insurance_company && (
                      <InfoRow label="Aseguradora" value={patient.insurance_company} />
                    )}
                    {patient.insurance_number && (
                      <InfoRow label="N.º afiliado" value={patient.insurance_number} />
                    )}
                    {patient.insurance_coverage_pct != null && (
                      <InfoRow
                        label="Cobertura"
                        value={`${patient.insurance_coverage_pct}%`}
                      />
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick actions card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">
                ⚡ Acciones rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                asChild
                className="w-full justify-start gap-2 bg-primary hover:bg-primary/90 text-white"
                size="sm"
              >
                <Link href={`/app/${slug}/clinical/new?patient=${id}`}>
                  🩺 Nueva consulta
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start gap-2" size="sm">
                <Link href={`/app/${slug}/prescriptions/new?patient=${id}`}>
                  💊 Nueva receta
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start gap-2" size="sm">
                <Link href={`/app/${slug}/billing/new?patient=${id}`}>
                  🧾 Nueva factura
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
