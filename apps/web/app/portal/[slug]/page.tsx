import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Portal del Paciente' };

interface Props {
  params: Promise<{ slug: string }>;
}

interface Appointment {
  id: string;
  appointment_date: string;
  start_time: string;
  consultation_type: string;
  status: string;
}

interface Prescription {
  id: string;
  prescription_number: string;
  issue_date: string;
  status: string;
  validity_days: number;
}

const MONTH_NAMES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()] ?? ''} ${d.getFullYear()}`;
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  confirmada: { label: 'Confirmada', cls: 'bg-green-100 text-green-800' },
  pendiente:  { label: 'Pendiente',  cls: 'bg-yellow-100 text-yellow-800' },
  cancelada:  { label: 'Cancelada',  cls: 'bg-red-100 text-red-800' },
  completada: { label: 'Completada', cls: 'bg-gray-100 text-gray-600' },
  emitida:    { label: 'Emitida',    cls: 'bg-green-100 text-green-800' },
  borrador:   { label: 'Pendiente',  cls: 'bg-yellow-100 text-yellow-800' },
};

export default async function PortalHomePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Get tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/');

  // If not logged in, show public landing
  if (!user) {
    return (
      <div className="text-center space-y-8 py-12">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{tenant.name}</h1>
          <p className="text-muted-foreground mt-2">
            Accede a tu historial médico y gestiona tus citas
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 max-w-md mx-auto">
          <Card>
            <CardContent className="pt-6 pb-6 text-center space-y-4">
              <p className="text-4xl">👤</p>
              <div>
                <h2 className="font-semibold text-gray-900">Soy paciente</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Accede a tus citas, recetas y resultados
                </p>
              </div>
              <Button asChild className="w-full bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold">
                <Link href={`/portal/${slug}/login`}>Iniciar sesión</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 pb-6 text-center space-y-4">
              <p className="text-4xl">📅</p>
              <div>
                <h2 className="font-semibold text-gray-900">Agendar cita</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Solicita una cita sin necesidad de cuenta
                </p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/portal/${slug}/book`}>Solicitar cita</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 pb-6 text-center space-y-4">
              <p className="text-4xl">🔍</p>
              <div>
                <h2 className="font-semibold text-gray-900">Verificar receta</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Valida la autenticidad de una receta médica
                </p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/portal/${slug}/verify`}>Verificar receta</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Logged-in patient view — find their patient record
  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, birth_date')
    .eq('portal_user_id', user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (!patient) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-4xl">🏥</p>
        <h2 className="text-xl font-semibold text-gray-900">Sin historial en este consultorio</h2>
        <p className="text-muted-foreground text-sm">
          Tu cuenta no está vinculada a ningún paciente en {tenant.name}.
          <br />Contacta al consultorio para que vinculen tu cuenta.
        </p>
        <div className="flex justify-center gap-3 mt-4">
          <Button asChild variant="outline">
            <Link href={`/portal/${slug}/book`}>Solicitar cita</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/portal/${slug}/verify`}>Verificar receta</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Fetch upcoming appointments + recent prescriptions
  const today = new Date().toISOString().split('T')[0]!;
  const [apptResult, rxResult] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, appointment_date, start_time, consultation_type, status')
      .eq('patient_id', patient.id)
      .eq('tenant_id', tenant.id)
      .gte('appointment_date', today)
      .order('appointment_date')
      .limit(5),
    supabase
      .from('prescriptions')
      .select('id, prescription_number, issue_date, status, validity_days')
      .eq('patient_id', patient.id)
      .eq('tenant_id', tenant.id)
      .order('issue_date', { ascending: false })
      .limit(5),
  ]);

  const appointments  = (apptResult.data as unknown as Appointment[]) ?? [];
  const prescriptions = (rxResult.data as unknown as Prescription[]) ?? [];

  const CONSULT_LABELS: Record<string, string> = {
    primera_vez: 'Primera vez', control: 'Control',
    emergencia: 'Emergencia', procedimiento: 'Procedimiento',
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {patient.first_name}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Bienvenido al portal de {tenant.name}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild className="h-auto py-4 flex-col gap-2 bg-[#1E40AF] hover:bg-[#1e3a8a] text-white">
          <Link href={`/portal/${slug}/book`}>
            <span className="text-xl">📅</span>
            <span className="text-sm font-semibold">Agendar cita</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
          <Link href={`/portal/${slug}/verify`}>
            <span className="text-xl">🔍</span>
            <span className="text-sm font-semibold">Verificar receta</span>
          </Link>
        </Button>
      </div>

      {/* Upcoming appointments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Próximas citas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {appointments.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted-foreground">
              <p className="text-2xl mb-2">📅</p>
              <p className="text-sm">Sin citas próximas</p>
              <Link
                href={`/portal/${slug}/book`}
                className="text-xs text-[#1E40AF] hover:underline mt-1 block"
              >
                Agendar una cita →
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {appointments.map((a) => {
                const badge = STATUS_BADGE[a.status] ?? { label: a.status, cls: 'bg-gray-100 text-gray-600' };
                return (
                  <div key={a.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-shrink-0 text-center">
                      <p className="text-2xl font-bold text-[#1E40AF] leading-none">
                        {new Date(a.appointment_date + 'T12:00:00').getDate()}
                      </p>
                      <p className="text-xs text-muted-foreground uppercase">
                        {MONTH_NAMES_SHORT[new Date(a.appointment_date + 'T12:00:00').getMonth()] ?? ''}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">
                        {CONSULT_LABELS[a.consultation_type] ?? a.consultation_type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(a.start_time)}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent prescriptions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recetas recientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {prescriptions.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted-foreground">
              <p className="text-2xl mb-2">💊</p>
              <p className="text-sm">Sin recetas</p>
            </div>
          ) : (
            <div className="divide-y">
              {prescriptions.map((rx) => {
                const badge = STATUS_BADGE[rx.status] ?? { label: rx.status, cls: 'bg-gray-100 text-gray-600' };
                const expiryDate = new Date(rx.issue_date + 'T12:00:00');
                expiryDate.setDate(expiryDate.getDate() + rx.validity_days);
                const isExpired = expiryDate < new Date();

                return (
                  <div key={rx.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0 text-lg">
                      💊
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">{rx.prescription_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(rx.issue_date)}
                        {isExpired ? (
                          <span className="ml-2 text-red-600">· Vencida</span>
                        ) : (
                          <span className="ml-2">· Válida hasta {formatDate(expiryDate.toISOString().split('T')[0]!)}</span>
                        )}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
