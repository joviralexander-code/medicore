import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VerifyPrescriptionForm } from '@/components/portal/verify-prescription-form';

export const metadata: Metadata = { title: 'Verificar receta' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string }>;
}

interface Medication {
  name: string;
  concentration: string | null;
  pharmaceutical_form: string | null;
  quantity: string;
  unit: string;
  dosage: { frequency: string; duration: string };
}

interface Prescription {
  prescription_number: string;
  issue_date: string;
  validity_days: number;
  status: string;
  medications: Medication[];
  diagnoses: { cie10_code: string; description: string }[];
  patients: { first_name: string; last_name: string } | null;
  doctor: { first_name: string; last_name: string; speciality: string | null } | null;
}

const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} de ${MONTH_NAMES[d.getMonth()] ?? ''} de ${d.getFullYear()}`;
}

export default async function VerifyPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { code } = await searchParams;
  const supabase = await createClient();

  let prescription: Prescription | null = null;
  let notFound = false;

  if (code) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single();

    if (tenant) {
      const { data } = await supabase
        .from('prescriptions')
        .select(`
          prescription_number, issue_date, validity_days, status,
          medications, diagnoses,
          patients(first_name, last_name),
          doctor:doctor_id(first_name, last_name, speciality)
        `)
        .eq('verification_code', code.toUpperCase())
        .eq('tenant_id', tenant.id)
        .single();

      if (data) {
        prescription = data as unknown as Prescription;
      } else {
        notFound = true;
      }
    }
  }

  if (prescription) {
    const meds = Array.isArray(prescription.medications) ? prescription.medications : [];
    const expiryDate = new Date(prescription.issue_date + 'T12:00:00');
    expiryDate.setDate(expiryDate.getDate() + prescription.validity_days);
    const isExpired  = expiryDate < new Date();
    const isAnulada  = prescription.status === 'anulada';
    const isValid    = !isExpired && !isAnulada && prescription.status !== 'borrador';

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Verificación de receta</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Código: {code?.toUpperCase()}</p>
        </div>

        {/* Validity banner */}
        <div className={`rounded-xl border px-5 py-4 ${
          isValid
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isValid ? '✅' : '❌'}</span>
            <div>
              <p className={`font-semibold ${isValid ? 'text-green-800' : 'text-red-800'}`}>
                {isValid ? 'Receta válida y auténtica' :
                  isAnulada ? 'Receta anulada' :
                  isExpired ? 'Receta vencida' : 'Receta no válida'}
              </p>
              <p className={`text-sm mt-0.5 ${isValid ? 'text-green-700' : 'text-red-700'}`}>
                {isValid
                  ? `Válida hasta ${formatDate(expiryDate.toISOString().split('T')[0]!)}`
                  : isExpired
                  ? `Venció el ${formatDate(expiryDate.toISOString().split('T')[0]!)}`
                  : 'Esta receta no puede ser dispensada'}
              </p>
            </div>
          </div>
        </div>

        {/* Prescription details */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-medium">Médico</CardTitle>
            </CardHeader>
            <CardContent>
              {prescription.doctor ? (
                <>
                  <p className="font-semibold text-gray-900">
                    Dr. {prescription.doctor.first_name} {prescription.doctor.last_name}
                  </p>
                  {prescription.doctor.speciality && (
                    <p className="text-sm text-muted-foreground">{prescription.doctor.speciality}</p>
                  )}
                </>
              ) : <p className="text-sm text-muted-foreground">—</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-medium">Paciente</CardTitle>
            </CardHeader>
            <CardContent>
              {prescription.patients ? (
                <p className="font-semibold text-gray-900">
                  {prescription.patients.first_name} {prescription.patients.last_name}
                </p>
              ) : <p className="text-sm text-muted-foreground">—</p>}
              <p className="text-sm text-muted-foreground mt-0.5">
                {prescription.prescription_number} · {formatDate(prescription.issue_date)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Medications */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Medicamentos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {meds.map((m, i) => (
                <div key={i} className="px-5 py-4">
                  <p className="font-semibold text-gray-900">{m.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[m.concentration, m.pharmaceutical_form].filter(Boolean).join(' · ')}
                    {' · '}{m.quantity} {m.unit}
                  </p>
                  <p className="text-sm text-gray-700 mt-1">
                    {m.dosage.frequency} · {m.dosage.duration}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Verificar receta médica</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Ingresa el código de verificación de la receta
        </p>
      </div>

      {notFound && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">❌</span>
          <div>
            <p className="font-semibold text-red-800">Receta no encontrada</p>
            <p className="text-sm text-red-700">
              El código <strong>{code}</strong> no corresponde a ninguna receta emitida por este consultorio.
            </p>
          </div>
        </div>
      )}

      <VerifyPrescriptionForm slug={slug} />
    </div>
  );
}
