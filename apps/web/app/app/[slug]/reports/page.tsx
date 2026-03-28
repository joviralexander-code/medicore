import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DownloadReportButton } from '@/components/reports/download-report-button';

export const metadata: Metadata = { title: 'Reportes' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(monthStr: string): { start: string; end: string } {
  const [yearStr, monStr] = monthStr.split('-');
  const year = parseInt(yearStr ?? '', 10);
  const mon  = parseInt(monStr ?? '', 10) - 1;
  const start = new Date(year, mon, 1).toISOString().split('T')[0]!;
  const end   = new Date(year, mon + 1, 0).toISOString().split('T')[0]!;
  return { start, end };
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatCurrency(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

interface ConsultationTypeRow {
  consultation_type: string;
}

interface DiagnosisRow {
  diagnoses: { cie10_code: string; description: string }[];
}

interface InvoiceRow {
  total: number;
  status: string;
}

export default async function ReportsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { month } = await searchParams;
  const supabase = await createClient();

  // Admin check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect(`/app/${slug}/dashboard`);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  const selectedMonth = month ?? getCurrentMonth();
  const { start, end } = getMonthRange(selectedMonth);
  const [yearPart, monPart] = selectedMonth.split('-');
  const year = parseInt(yearPart ?? '', 10);
  const mon  = parseInt(monPart ?? '', 10) - 1;

  // Parallel queries
  const [
    patientsResult,
    consultationsResult,
    appointmentsResult,
    prescriptionsResult,
    invoicesResult,
    financesResult,
  ] = await Promise.all([
    // Total patients
    supabase.from('patients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
    // Consultations this month
    supabase
      .from('consultations')
      .select('consultation_type, diagnoses')
      .eq('tenant_id', tenant.id)
      .gte('consultation_date', start)
      .lte('consultation_date', end),
    // Appointments this month
    supabase
      .from('appointments')
      .select('status', { count: 'exact', head: false })
      .eq('tenant_id', tenant.id)
      .gte('appointment_date', start)
      .lte('appointment_date', end),
    // Prescriptions this month
    supabase
      .from('prescriptions')
      .select('status', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('issue_date', start)
      .lte('issue_date', end),
    // Invoices this month
    supabase
      .from('sri_documents')
      .select('total, status')
      .eq('tenant_id', tenant.id)
      .gte('created_at', start)
      .lte('created_at', end + 'T23:59:59'),
    // Financial transactions this month (admin only)
    supabase
      .from('financial_transactions')
      .select('type, amount')
      .eq('tenant_id', tenant.id)
      .gte('transaction_date', start)
      .lte('transaction_date', end),
  ]);

  const consultations = (consultationsResult.data ?? []) as ConsultationTypeRow[];
  const appointments  = appointmentsResult.data ?? [];
  const invoices      = (invoicesResult.data ?? []) as InvoiceRow[];
  const finances      = financesResult.data ?? [];

  // Consultation type breakdown
  const consultationTypes = consultations.reduce<Record<string, number>>((acc, c) => {
    acc[c.consultation_type] = (acc[c.consultation_type] ?? 0) + 1;
    return acc;
  }, {});

  // Appointment status breakdown
  const apptStatuses = appointments.reduce<Record<string, number>>((acc, a) => {
    const s = (a as { status: string }).status;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  // Top diagnoses
  const diagCounts: Record<string, { code: string; description: string; count: number }> = {};
  for (const c of consultationsResult.data ?? []) {
    const diagnoses = (c as DiagnosisRow).diagnoses ?? [];
    for (const d of diagnoses) {
      if (!d.cie10_code) continue;
      if (!diagCounts[d.cie10_code]) {
        diagCounts[d.cie10_code] = { code: d.cie10_code, description: d.description, count: 0 };
      }
      diagCounts[d.cie10_code]!.count++;
    }
  }
  const topDiagnoses = Object.values(diagCounts).sort((a, b) => b.count - a.count).slice(0, 10);

  // Financial summary
  const totalIngresos  = finances.filter((f) => (f as { type: string }).type === 'ingreso').reduce((s, f) => s + (f as { amount: number }).amount, 0);
  const totalEgresos   = finances.filter((f) => (f as { type: string }).type === 'egreso').reduce((s, f) => s + (f as { amount: number }).amount, 0);
  const invoiceRevenue = invoices.filter((i) => i.status === 'autorizado').reduce((s, i) => s + i.total, 0);

  const CONSULT_LABELS: Record<string, string> = {
    primera_vez: 'Primera vez', control: 'Control',
    emergencia: 'Emergencia', procedimiento: 'Procedimiento',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {MONTH_NAMES[mon] ?? ''} {year}
          </p>
        </div>
        <div className="flex items-center gap-3">
        <DownloadReportButton month={selectedMonth} />
        {/* Month picker */}
        <form method="GET" className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            defaultValue={selectedMonth}
            max={getCurrentMonth()}
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-[#1E40AF]"
          />
          <button
            type="submit"
            className="h-10 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Ver
          </button>
        </form>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Pacientes totales', value: patientsResult.count ?? 0, icon: '👥', color: 'text-gray-900' },
          { label: 'Consultas', value: consultations.length, icon: '🩺', color: 'text-primary' },
          { label: 'Citas', value: appointments.length, icon: '📅', color: 'text-primary' },
          { label: 'Recetas', value: prescriptionsResult.count ?? 0, icon: '💊', color: 'text-teal-600' },
          { label: 'Facturas autorizadas', value: `${formatCurrency(invoiceRevenue)}`, icon: '🧾', color: 'text-green-600' },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                <span>{kpi.icon}</span>
              </div>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Consultation types */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tipo de consultas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {Object.keys(consultationTypes).length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Sin consultas este mes</p>
            ) : (
              <div className="divide-y">
                {Object.entries(consultationTypes)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => {
                    const total = consultations.length;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={type} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-700">{CONSULT_LABELS[type] ?? type}</span>
                          <span className="text-sm font-semibold text-gray-900">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Appointment statuses */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Estado de citas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {Object.keys(apptStatuses).length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Sin citas este mes</p>
            ) : (
              <div className="divide-y">
                {Object.entries(apptStatuses)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => {
                    const LABELS: Record<string, { label: string; color: string }> = {
                      confirmada: { label: 'Confirmadas', color: 'bg-green-500' },
                      pendiente:  { label: 'Pendientes',  color: 'bg-yellow-400' },
                      cancelada:  { label: 'Canceladas',  color: 'bg-red-500' },
                      completada: { label: 'Completadas', color: 'bg-gray-400' },
                    };
                    const entry = LABELS[status] ?? { label: status, color: 'bg-gray-400' };
                    const total = appointments.length;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={status} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-700">{entry.label}</span>
                          <span className="text-sm font-semibold text-gray-900">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className={`${entry.color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top diagnoses */}
        <Card className="col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Diagnósticos más frecuentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topDiagnoses.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Sin diagnósticos registrados este mes</p>
            ) : (
              <div className="divide-y">
                {topDiagnoses.map((d, i) => {
                  const maxCount = topDiagnoses[0]?.count ?? 1;
                  const pct = Math.round((d.count / maxCount) * 100);
                  return (
                    <div key={d.code} className="flex items-center gap-4 px-5 py-3">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-right flex-shrink-0">
                        {i + 1}.
                      </span>
                      <span className="font-mono text-xs font-bold text-primary bg-blue-50 px-2 py-0.5 rounded flex-shrink-0">
                        {d.code}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{d.description}</p>
                        <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                          <div className="bg-primary h-1 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 flex-shrink-0 ml-2">
                        {d.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financial summary */}
        <Card className="col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumen financiero del mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-1">Ingresos</p>
                <p className="text-2xl font-bold text-green-800">{formatCurrency(totalIngresos)}</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-xl">
                <p className="text-xs text-red-700 font-semibold uppercase tracking-wide mb-1">Egresos</p>
                <p className="text-2xl font-bold text-red-800">{formatCurrency(totalEgresos)}</p>
              </div>
              <div className={`text-center p-4 rounded-xl ${totalIngresos - totalEgresos >= 0 ? 'bg-gray-50' : 'bg-orange-50'}`}>
                <p className="text-xs text-gray-600 font-semibold uppercase tracking-wide mb-1">Balance neto</p>
                <p className={`text-2xl font-bold ${totalIngresos - totalEgresos >= 0 ? 'text-gray-800' : 'text-orange-700'}`}>
                  {formatCurrency(totalIngresos - totalEgresos)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
