import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  CalendarDays,
  Receipt,
  TrendingUp,
  Stethoscope,
  UserPlus,
  FileText,
  Pill,
  ArrowRight,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Dashboard' };

interface Props {
  params: Promise<{ slug: string }>;
}

/* ── KPI card config ────────────────────────────────────────────────────── */
const KPI_CONFIG = [
  {
    key: 'patients',
    title: 'Pacientes',
    sub: 'Total registrados',
    icon: Users,
    color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    href: (slug: string) => `/app/${slug}/patients`,
  },
  {
    key: 'appointments',
    title: 'Citas hoy',
    sub: 'Programadas',
    icon: CalendarDays,
    color: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
    href: (slug: string) => `/app/${slug}/agenda`,
  },
  {
    key: 'invoices',
    title: 'Facturas',
    sub: 'Este mes · SRI',
    icon: Receipt,
    color: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    href: (slug: string) => `/app/${slug}/billing`,
  },
  {
    key: 'revenue',
    title: 'Ingresos',
    sub: 'Mes en curso',
    icon: TrendingUp,
    color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    href: (slug: string) => `/app/${slug}/finances`,
  },
] as const;

const STATUS_BADGE: Record<string, React.ComponentProps<typeof Badge>['variant']> = {
  confirmada:  'success',
  pendiente:   'warning',
  en_curso:    'info',
  completada:  'secondary',
};

const STATUS_LABEL: Record<string, string> = {
  confirmada: 'Confirmada',
  pendiente:  'Pendiente',
  en_curso:   'En curso',
  completada: 'Completada',
};

const QUICK_ACTIONS = [
  { label: 'Nueva consulta',     icon: Stethoscope, href: (s: string) => `/app/${s}/clinical/new`,      color: 'bg-blue-50   hover:bg-blue-100   text-blue-700'   },
  { label: 'Nuevo paciente',     icon: UserPlus,    href: (s: string) => `/app/${s}/patients/new`,      color: 'bg-teal-50   hover:bg-teal-100   text-teal-700'   },
  { label: 'Nueva factura',      icon: FileText,    href: (s: string) => `/app/${s}/billing/new`,       color: 'bg-violet-50 hover:bg-violet-100 text-violet-700' },
  { label: 'Emitir receta',      icon: Pill,        href: (s: string) => `/app/${s}/prescriptions/new`, color: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700' },
];

export default async function DashboardPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, plan_tier, status')
    .eq('slug', slug)
    .single();

  if (!tenant) return null;

  const tenantId   = tenant.id;
  const today      = new Date().toISOString().split('T')[0]!;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    patientsRes,
    appointmentsTodayRes,
    invoicesRes,
    recentAppointmentsRes,
    topDiagnosesRes,
    socialTokenRes,
  ] = await Promise.all([
    supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),

    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('appointment_date', today)
      .not('status', 'eq', 'cancelled'),

    supabase
      .from('sri_documents')
      .select('total')
      .eq('tenant_id', tenantId)
      .eq('status', 'autorizado')
      .gte('created_at', monthStart),

    supabase
      .from('appointments')
      .select('id, start_time, consultation_type, status, patients(first_name, last_name)')
      .eq('tenant_id', tenantId)
      .eq('appointment_date', today)
      .not('status', 'eq', 'cancelled')
      .order('start_time')
      .limit(6),

    supabase
      .from('consultations')
      .select('diagnoses')
      .eq('tenant_id', tenantId)
      .eq('is_signed', true)
      .gte('consultation_date', monthStart)
      .limit(200),

    supabase
      .from('social_accounts')
      .select('platform, account_name, token_expires_at')
      .eq('tenant_id', tenantId)
      .in('platform', ['facebook', 'instagram'])
      .lte('token_expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
      .gt('token_expires_at', new Date().toISOString()),
  ]);

  const monthlyRevenue = (invoicesRes.data ?? []).reduce(
    (sum, doc) => sum + ((doc.total as number) ?? 0),
    0
  );

  const diagnosisCount: Record<string, number> = {};
  for (const row of (topDiagnosesRes.data ?? []) as Array<{ diagnoses: unknown }>) {
    const diags = Array.isArray(row.diagnoses) ? row.diagnoses : [];
    for (const d of diags as Array<{ cie10_code?: string; description?: string }>) {
      const key = d.description ?? d.cie10_code ?? 'Desconocido';
      diagnosisCount[key] = (diagnosisCount[key] ?? 0) + 1;
    }
  }
  const topDiagnoses = Object.entries(diagnosisCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const recentAppointments = (recentAppointmentsRes.data ?? []) as unknown as Array<{
    id: string;
    start_time: string;
    consultation_type: string;
    status: string;
    patients: { first_name: string; last_name: string } | null;
  }>;

  const expiringTokens = (socialTokenRes.data ?? []) as Array<{
    platform: string;
    account_name: string;
    token_expires_at: string;
  }>;

  const kpiValues: Record<string, string | number> = {
    patients:     patientsRes.count ?? 0,
    appointments: appointmentsTodayRes.count ?? 0,
    invoices:     invoicesRes.data?.length ?? 0,
    revenue:      `$${monthlyRevenue.toFixed(2)}`,
  };

  const dateLabel = new Date().toLocaleDateString('es-EC', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="space-y-6 max-w-7xl">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5 capitalize">{dateLabel}</p>
      </div>

      {/* ── Alert: expiring social tokens ─────────────────────────────── */}
      {expiringTokens.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800/40 dark:bg-amber-900/20">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
              Token de red social por vencer
            </p>
            {expiringTokens.map((t) => {
              const days = Math.floor(
                (new Date(t.token_expires_at).getTime() - Date.now()) / 86_400_000
              );
              return (
                <p key={t.platform} className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {t.platform} ({t.account_name}) — vence en {days} día{days !== 1 ? 's' : ''}{' '}
                  <Link href={`/app/${slug}/social`} className="underline font-medium">
                    Reconectar →
                  </Link>
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_CONFIG.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.key} href={kpi.href(slug)}>
              <Card variant="interactive">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted-foreground font-medium">{kpi.title}</p>
                      <p className="text-2xl font-bold text-foreground mt-1 tracking-tight">
                        {kpiValues[kpi.key]}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${kpi.color}`}>
                      <Icon size={18} strokeWidth={2} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* ── Main content grid ─────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Citas de hoy */}
        <Card>
          <CardHeader className="px-5 py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Citas de hoy</CardTitle>
              <Link
                href={`/app/${slug}/agenda`}
                className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                Ver agenda <ArrowRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <CalendarDays size={32} strokeWidth={1.5} className="mb-2 opacity-30" />
                <p className="text-sm">Sin citas para hoy</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentAppointments.map((appt) => {
                  const badgeVariant = STATUS_BADGE[appt.status] ?? 'secondary';
                  const badgeLabel  = STATUS_LABEL[appt.status] ?? appt.status;
                  return (
                    <div key={appt.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {appt.patients
                            ? `${appt.patients.first_name} ${appt.patients.last_name}`
                            : 'Paciente'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {appt.start_time.slice(0, 5)} · {appt.consultation_type.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <Badge variant={badgeVariant} className="ml-3 flex-shrink-0">
                        {badgeLabel}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnósticos frecuentes */}
        <Card>
          <CardHeader className="px-5 py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Diagnósticos frecuentes</CardTitle>
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                Este mes
              </span>
            </div>
          </CardHeader>
          <CardContent className="pb-5">
            {topDiagnoses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <Stethoscope size={32} strokeWidth={1.5} className="mb-2 opacity-30" />
                <p className="text-sm">Sin consultas firmadas este mes</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topDiagnoses.map(([diagnosis, count], i) => {
                  const maxCount = topDiagnoses[0]?.[1] ?? 1;
                  const pct      = Math.round((count / maxCount) * 100);
                  const colors   = [
                    'bg-primary',
                    'bg-teal-500',
                    'bg-violet-500',
                    'bg-emerald-500',
                    'bg-amber-500',
                  ];
                  const barColor = colors[i] ?? 'bg-primary';
                  return (
                    <div key={diagnosis}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs text-foreground truncate max-w-[78%]">
                          <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                          {diagnosis}
                        </p>
                        <span className="text-xs font-semibold text-foreground tabular-nums">{count}</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
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
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <Card variant="flat">
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm font-semibold">Acciones rápidas</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href(slug)}
                  className={`flex flex-col items-center justify-center gap-2.5 p-4 rounded-xl border border-transparent transition-all duration-150 text-center ${action.color}`}
                >
                  <Icon size={22} strokeWidth={1.75} />
                  <span className="text-xs font-medium leading-snug">{action.label}</span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Free plan upgrade nudge ───────────────────────────────────── */}
      {tenant.plan_tier === 'free' && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-teal-50 px-5 py-4 dark:border-blue-900/40 dark:from-blue-950/30 dark:to-teal-950/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">Estás en el plan gratuito</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Desbloquea facturación ilimitada, recetas digitales y módulo financiero
              </p>
            </div>
          </div>
          <Link
            href={`/app/${slug}/settings/billing`}
            className="shrink-0 ml-4 flex items-center gap-1.5 text-sm font-medium py-2 px-4 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            Ver planes <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
