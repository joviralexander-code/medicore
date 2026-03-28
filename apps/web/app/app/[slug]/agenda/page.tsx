import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Plus } from 'lucide-react';

export const metadata: Metadata = { title: 'Agenda' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(time: string): string {
  // "HH:MM:SS" → "HH:MM"
  return time.slice(0, 5);
}

function getWeekRange(dateStr: string): Date[] {
  const date = new Date(dateStr + 'T12:00:00'); // noon to avoid DST issues
  const day = date.getDay(); // 0=Sun, 1=Mon, …
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMon);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} de ${MONTH_NAMES[d.getMonth()] ?? ''} de ${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'secondary' }> = {
    confirmada: { label: 'Confirmada', variant: 'success' },
    pendiente:  { label: 'Pendiente',  variant: 'warning' },
    cancelada:  { label: 'Cancelada',  variant: 'error' },
    completada: { label: 'Completada', variant: 'secondary' },
  };
  const entry = map[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

function TypeLabel({ type }: { type: string }) {
  const map: Record<string, string> = {
    primera_vez:  'Primera vez',
    control:      'Control',
    emergencia:   'Emergencia',
    procedimiento: 'Procedimiento',
  };
  return <span className="text-xs text-muted-foreground">{map[type] ?? type}</span>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientJoin {
  first_name: string;
  last_name: string;
  phone: string | null;
}

interface Appointment {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  consultation_type: string;
  patients: PatientJoin | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AgendaPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { date } = await searchParams;

  const targetDate: string = date ?? new Date().toISOString().split('T')[0]!;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) {
    redirect('/onboarding');
  }

  const tenantId = tenant.id;

  // Fetch appointments for target date
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, appointment_date, start_time, end_time, status, consultation_type, patients(first_name, last_name, phone)')
    .eq('tenant_id', tenantId)
    .eq('appointment_date', targetDate)
    .order('start_time') as { data: Appointment[] | null };

  const appts = appointments ?? [];

  // Fetch week overview — appointments for Mon-Sun
  const weekDays = getWeekRange(targetDate);
  const weekStart = toISODate(weekDays[0]!);
  const weekEnd   = toISODate(weekDays[6]!);

  const { data: weekAppts } = await supabase
    .from('appointments')
    .select('appointment_date, status')
    .eq('tenant_id', tenantId)
    .gte('appointment_date', weekStart)
    .lte('appointment_date', weekEnd) as { data: { appointment_date: string; status: string }[] | null };

  // Group week counts by date
  const weekCounts: Record<string, number> = {};
  for (const a of weekAppts ?? []) {
    weekCounts[a.appointment_date] = (weekCounts[a.appointment_date] ?? 0) + 1;
  }

  // Quick stats
  const totalToday     = appts.length;
  const pendientes     = appts.filter((a) => a.status === 'pendiente').length;
  const confirmadas    = appts.filter((a) => a.status === 'confirmada').length;

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {formatDisplayDate(targetDate)}
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/${slug}/agenda/new?date=${targetDate}`}><Plus size={15} />Nueva cita</Link>
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Quick stats                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total hoy</p>
            <p className="text-3xl font-bold text-gray-900">{totalToday}</p>
            <p className="text-xs text-muted-foreground mt-0.5">citas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pendientes</p>
            <p className="text-3xl font-bold text-yellow-600">{pendientes}</p>
            <p className="text-xs text-muted-foreground mt-0.5">por confirmar</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Confirmadas</p>
            <p className="text-3xl font-bold text-green-600">{confirmadas}</p>
            <p className="text-xs text-muted-foreground mt-0.5">asistirán</p>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Week nav                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {weekDays.map((d, i) => {
              const iso       = toISODate(d);
              const isActive  = iso === targetDate;
              const isToday   = iso === today;
              const count     = weekCounts[iso] ?? 0;
              return (
                <Link
                  key={iso}
                  href={`?date=${iso}`}
                  className={[
                    'flex flex-col items-center min-w-[56px] rounded-xl px-3 py-2.5 text-center transition-colors select-none',
                    isActive
                      ? 'bg-primary text-white shadow-md'
                      : 'hover:bg-muted text-gray-700',
                  ].join(' ')}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                    {DAY_LABELS[i]}
                  </span>
                  <span className={`text-xl font-bold leading-tight mt-0.5 ${isToday && !isActive ? 'text-primary' : ''}`}>
                    {d.getDate()}
                  </span>
                  {count > 0 ? (
                    <span className={`mt-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${isActive ? 'bg-white/25 text-white' : 'bg-primary/10 text-primary'}`}>
                      {count}
                    </span>
                  ) : (
                    <span className="mt-1 text-[10px] opacity-0">0</span>
                  )}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Daily timeline                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Citas del{' '}
            <span className="text-primary">{formatDisplayDate(targetDate)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {appts.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <CalendarDays size={26} className="text-primary" />
              </div>
              <p className="font-medium text-foreground">Sin citas para este día</p>
              <p className="text-sm mt-1 mb-5">Agenda la primera cita del día</p>
              <Button asChild size="sm">
                <Link href={`/app/${slug}/agenda/new?date=${targetDate}`}><Plus size={14} />Nueva cita</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {appts.map((appt) => {
                const patientName = appt.patients
                  ? `${appt.patients.first_name} ${appt.patients.last_name}`
                  : 'Paciente no encontrado';
                const phone = appt.patients?.phone;
                return (
                  <div
                    key={appt.id}
                    className="flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    {/* Time column */}
                    <div className="flex-shrink-0 text-right w-20">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatTime(appt.start_time)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(appt.end_time)}
                      </p>
                    </div>

                    {/* Divider line */}
                    <div className="flex-shrink-0 flex flex-col items-center mt-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                      <div className="w-px flex-1 bg-gray-200 mt-1" style={{ minHeight: '28px' }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm text-gray-900">{patientName}</p>
                          <TypeLabel type={appt.consultation_type} />
                          {phone && (
                            <p className="text-xs text-muted-foreground mt-0.5">{phone}</p>
                          )}
                        </div>
                        <StatusBadge status={appt.status} />
                      </div>
                    </div>
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
