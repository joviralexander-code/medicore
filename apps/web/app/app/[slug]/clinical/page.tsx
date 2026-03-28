import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Plus } from 'lucide-react';

export const metadata: Metadata = { title: 'Consultas' };

interface ClinicalPageProps {
  params: Promise<{ slug: string }>;
}

const CONSULTATION_TYPE_LABELS: Record<string, string> = {
  primera_vez: 'Primera vez',
  control: 'Control',
  emergencia: 'Emergencia',
  procedimiento: 'Procedimiento',
};

type BadgeVariant = 'info' | 'teal' | 'error' | 'secondary';
const CONSULTATION_TYPE_VARIANTS: Record<string, BadgeVariant> = {
  primera_vez: 'info',
  control: 'teal',
  emergencia: 'error',
  procedimiento: 'secondary',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ConsultationRow = {
  id: string;
  consultation_date: string;
  consultation_type: string;
  reason: string | null;
  diagnoses: unknown[] | null;
  patient_id: string | null;
  patients: { first_name: string; last_name: string } | null;
};

export default async function ClinicalPage({ params }: ClinicalPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  const { data: consultations } = (await supabase
    .from('consultations')
    .select(
      'id, consultation_date, consultation_type, reason, diagnoses, patient_id, patients(first_name, last_name)'
    )
    .eq('tenant_id', tenant?.id ?? '')
    .order('consultation_date', { ascending: false })
    .limit(20)) as { data: ConsultationRow[] | null };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consultas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Últimas {consultations?.length ?? 0} consulta
            {(consultations?.length ?? 0) !== 1 ? 's' : ''} registrada
            {(consultations?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/${slug}/clinical/new`}><Plus size={15} />Nueva consulta</Link>
        </Button>
      </div>

      {/* Consultations list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            Historial de consultas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!consultations || consultations.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <FileText size={26} className="text-primary" />
              </div>
              <p className="font-medium text-foreground">Aún no hay consultas registradas</p>
              <p className="text-sm mt-1 mb-5">Comience registrando la primera consulta médica</p>
              <Button asChild size="sm">
                <Link href={`/app/${slug}/clinical/new`}><Plus size={14} />Nueva consulta</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {consultations.map((c) => {
                const patientName = c.patients
                  ? `${c.patients.first_name} ${c.patients.last_name}`
                  : 'Paciente desconocido';
                const typeLabel =
                  CONSULTATION_TYPE_LABELS[c.consultation_type] ?? c.consultation_type;
                const typeVariant: BadgeVariant =
                  CONSULTATION_TYPE_VARIANTS[c.consultation_type] ?? 'secondary';
                const diagCount = Array.isArray(c.diagnoses) ? c.diagnoses.length : 0;

                return (
                  <div
                    key={c.id}
                    className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors"
                  >
                    {/* Date column */}
                    <div className="shrink-0 text-right min-w-[90px]">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {formatDate(c.consultation_date)}
                      </p>
                    </div>

                    {/* Divider dot */}
                    <div className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-blue-200 ring-2 ring-blue-50" />

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.patient_id ? (
                          <Link
                            href={`/app/${slug}/patients/${c.patient_id}`}
                            className="font-semibold text-sm text-gray-800 hover:text-primary hover:underline transition-colors"
                          >
                            {patientName}
                          </Link>
                        ) : (
                          <span className="font-semibold text-sm text-gray-800">
                            {patientName}
                          </span>
                        )}
                        <Badge variant={typeVariant}>{typeLabel}</Badge>
                        {diagCount > 0 && (
                          <Badge variant="secondary">
                            {diagCount} diagnóstico{diagCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      {c.reason && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {c.reason}
                        </p>
                      )}
                    </div>

                    {/* Action link */}
                    {c.patient_id && (
                      <Link
                        href={`/app/${slug}/patients/${c.patient_id}`}
                        className="shrink-0 text-xs text-primary hover:underline transition-colors mt-0.5"
                      >
                        Ver paciente
                      </Link>
                    )}
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
