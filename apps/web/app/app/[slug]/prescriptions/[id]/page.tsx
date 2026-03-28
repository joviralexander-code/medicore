import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmitPrescriptionButton } from '@/components/prescriptions/emit-prescription-button';
import { SendByEmailButton } from '@/components/shared/send-by-email-button';

export const metadata: Metadata = { title: 'Receta' };

interface Props {
  params: Promise<{ slug: string; id: string }>;
}

interface Dosage {
  amount: string;
  unit: string;
  frequency: string;
  duration: string;
  instructions: string;
}

interface Medication {
  name: string;
  active_ingredient: string;
  concentration: string;
  pharmaceutical_form: string;
  quantity: string;
  unit: string;
  dosage: Dosage;
  is_controlled: boolean;
}

interface DiagnosisItem {
  cie10_code: string;
  description: string;
}

interface Prescription {
  id: string;
  prescription_number: string;
  issue_date: string;
  validity_days: number;
  status: string;
  diagnoses: DiagnosisItem[];
  medications: Medication[];
  instructions: string | null;
  verification_code: string;
  created_at: string;
  patients: { first_name: string; last_name: string; cedula: string | null; birth_date: string | null } | null;
  doctor: { first_name: string; last_name: string; speciality: string | null; senescyt_registration: string | null } | null;
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} de ${MONTH_NAMES[d.getMonth()] ?? ''} de ${d.getFullYear()}`;
}

function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    borrador:   { label: 'Borrador',   cls: 'bg-yellow-100 text-yellow-800' },
    emitida:    { label: 'Emitida',    cls: 'bg-green-100 text-green-800' },
    dispensada: { label: 'Dispensada', cls: 'bg-blue-100 text-blue-800' },
    anulada:    { label: 'Anulada',    cls: 'bg-red-100 text-red-800' },
  };
  const entry = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

export default async function PrescriptionDetailPage({ params }: Props) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  const { data: rx } = await supabase
    .from('prescriptions')
    .select(`
      id, prescription_number, issue_date, validity_days, status,
      diagnoses, medications, instructions, verification_code, created_at,
      patients(first_name, last_name, cedula, birth_date),
      doctor:doctor_id(first_name, last_name, speciality, senescyt_registration)
    `)
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .single() as { data: Prescription | null };

  if (!rx) notFound();

  const patient = rx.patients;
  const doctor  = rx.doctor;
  const meds    = Array.isArray(rx.medications) ? rx.medications : [];
  const diags   = Array.isArray(rx.diagnoses) ? rx.diagnoses : [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href={`/app/${slug}/prescriptions`} className="hover:text-gray-900 transition-colors">
            Recetas
          </Link>
          <span>›</span>
          <span className="text-gray-900">{rx.prescription_number}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{rx.prescription_number}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Emitida el {formatDate(rx.issue_date)} · Válida {rx.validity_days} días
            </p>
          </div>
          <StatusBadge status={rx.status} />
        </div>
      </div>

      {/* Doctor + Patient info */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium">Médico tratante</CardTitle>
          </CardHeader>
          <CardContent>
            {doctor ? (
              <div>
                <p className="font-semibold text-gray-900">
                  Dr. {doctor.first_name} {doctor.last_name}
                </p>
                {doctor.speciality && (
                  <p className="text-sm text-muted-foreground">{doctor.speciality}</p>
                )}
                {doctor.senescyt_registration && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    SENESCYT: {doctor.senescyt_registration}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No disponible</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium">Paciente</CardTitle>
          </CardHeader>
          <CardContent>
            {patient ? (
              <div>
                <p className="font-semibold text-gray-900">
                  {patient.first_name} {patient.last_name}
                </p>
                {patient.cedula && (
                  <p className="text-sm text-muted-foreground">CI: {patient.cedula}</p>
                )}
                {patient.birth_date && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {calculateAge(patient.birth_date)} años
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No disponible</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diagnoses */}
      {diags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Diagnósticos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {diags.map((d, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-primary bg-blue-50 px-2 py-0.5 rounded">
                    {d.cie10_code}
                  </span>
                  <span className="text-sm text-gray-700">{d.description}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Medications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Medicamentos prescritos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {meds.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted-foreground text-sm">Sin medicamentos</p>
          ) : (
            <div className="divide-y">
              {meds.map((m, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{m.name || 'Sin nombre'}</p>
                        {m.is_controlled && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                            Control especial
                          </span>
                        )}
                      </div>
                      {m.active_ingredient && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m.active_ingredient}
                          {m.concentration ? ` ${m.concentration}` : ''}
                          {m.pharmaceutical_form ? ` · ${m.pharmaceutical_form}` : ''}
                        </p>
                      )}
                      <div className="mt-2 text-sm text-gray-700 space-y-0.5">
                        {m.dosage.frequency && (
                          <p><span className="text-muted-foreground">Frecuencia:</span> {m.dosage.frequency}</p>
                        )}
                        {m.dosage.duration && (
                          <p><span className="text-muted-foreground">Duración:</span> {m.dosage.duration}</p>
                        )}
                        {m.dosage.instructions && (
                          <p><span className="text-muted-foreground">Indicaciones:</span> {m.dosage.instructions}</p>
                        )}
                      </div>
                    </div>
                    {m.quantity && (
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-lg font-bold text-gray-900">{m.quantity}</p>
                        <p className="text-xs text-muted-foreground">{m.unit}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      {rx.instructions && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Instrucciones al paciente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-line">{rx.instructions}</p>
          </CardContent>
        </Card>
      )}

      {/* Verification + Actions */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Código de verificación</p>
              <p className="font-mono font-bold text-lg text-gray-900 tracking-widest">
                {rx.verification_code}
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              {rx.status === 'borrador' && (
                <EmitPrescriptionButton
                  prescriptionId={rx.id}
                />
              )}
              <Button variant="outline" disabled>
                Descargar PDF
                <span className="ml-2 text-xs text-muted-foreground">(Próximamente)</span>
              </Button>
              <SendByEmailButton
                type="prescription"
                id={rx.id}
                defaultEmail={patient?.cedula ? '' : ''}
                label="Enviar por email"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
