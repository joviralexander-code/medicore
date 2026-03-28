import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pill, Plus, ChevronRight } from 'lucide-react';

export const metadata: Metadata = { title: 'Recetas' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ patient?: string }>;
}

interface PatientJoin {
  first_name: string;
  last_name: string;
}

interface Prescription {
  id: string;
  prescription_number: string;
  issue_date: string;
  validity_days: number;
  status: string;
  medications: { name: string }[];
  patients: PatientJoin | null;
}

const MONTH_NAMES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()] ?? ''} ${d.getFullYear()}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'secondary' | 'success' | 'info' | 'error' }> = {
    borrador:   { label: 'Borrador',   variant: 'secondary' },
    emitida:    { label: 'Emitida',    variant: 'success' },
    dispensada: { label: 'Dispensada', variant: 'info' },
    anulada:    { label: 'Anulada',    variant: 'error' },
  };
  const entry = map[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export default async function PrescriptionsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { patient: patientFilter } = await searchParams;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  let query = supabase
    .from('prescriptions')
    .select('id, prescription_number, issue_date, validity_days, status, medications, patients(first_name, last_name)')
    .eq('tenant_id', tenant.id)
    .order('issue_date', { ascending: false })
    .limit(100);

  if (patientFilter) {
    query = query.eq('patient_id', patientFilter);
  }

  const { data: prescriptions } = await query as { data: Prescription[] | null };
  const list = prescriptions ?? [];

  // Stats
  const borradores = list.filter((p) => p.status === 'borrador').length;
  const emitidas   = list.filter((p) => p.status === 'emitida').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recetas Médicas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Historial de prescripciones emitidas
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/${slug}/prescriptions/new`}><Plus size={15} />Nueva receta</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total</p>
            <p className="text-3xl font-bold text-gray-900">{list.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">recetas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Borradores</p>
            <p className="text-3xl font-bold text-yellow-600">{borradores}</p>
            <p className="text-xs text-muted-foreground mt-0.5">sin emitir</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Emitidas</p>
            <p className="text-3xl font-bold text-green-600">{emitidas}</p>
            <p className="text-xs text-muted-foreground mt-0.5">activas</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recetas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Pill size={26} className="text-primary" />
              </div>
              <p className="font-medium text-foreground">Sin recetas registradas</p>
              <p className="text-sm mt-1 mb-5">Emite la primera receta médica</p>
              <Button asChild size="sm">
                <Link href={`/app/${slug}/prescriptions/new`}><Plus size={14} />Nueva receta</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {list.map((rx) => {
                const patientName = rx.patients
                  ? `${rx.patients.first_name} ${rx.patients.last_name}`
                  : 'Paciente no encontrado';
                const medCount = Array.isArray(rx.medications) ? rx.medications.length : 0;
                const medNames = Array.isArray(rx.medications)
                  ? rx.medications.slice(0, 2).map((m) => m.name).filter(Boolean).join(', ')
                  : '';

                return (
                  <Link
                    key={rx.id}
                    href={`/app/${slug}/prescriptions/${rx.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    {/* Icon */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Pill size={18} className="text-primary" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-gray-900">{patientName}</p>
                        <StatusBadge status={rx.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {rx.prescription_number} · {formatDate(rx.issue_date)} · Válida {rx.validity_days} días
                      </p>
                      {medNames && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {medNames}{medCount > 2 ? ` +${medCount - 2} más` : ''}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
