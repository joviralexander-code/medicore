import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, Plus, CircleDot } from 'lucide-react';

export const metadata: Metadata = { title: 'Finanzas' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}

interface Transaction {
  id: string;
  type: 'ingreso' | 'egreso';
  category: string;
  amount: number;
  description: string;
  transaction_date: string;
  payment_method: string | null;
  reference: string | null;
  is_reconciled: boolean;
  tax_deductible: boolean;
  patients: { first_name: string; last_name: string } | null;
}

interface CashSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  closing_balance: number | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  consulta: 'Consulta', procedimiento: 'Procedimiento', laboratorio: 'Laboratorio',
  farmacia: 'Farmacia', certificado: 'Certificado',
  alquiler: 'Alquiler', servicios_basicos: 'Servicios básicos', sueldos: 'Sueldos',
  insumos_medicos: 'Insumos médicos', equipos: 'Equipos', impuestos: 'Impuestos',
  marketing: 'Marketing', capacitacion: 'Capacitación', seguros: 'Seguros', otros: 'Otros',
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]?.slice(0, 3) ?? ''} ${d.getFullYear()}`;
}

function getMonthRange(monthStr: string): { start: string; end: string } {
  const [yearStr, monStr] = monthStr.split('-');
  const year = parseInt(yearStr ?? '', 10);
  const mon  = parseInt(monStr ?? '', 10) - 1;
  const start = new Date(year, mon, 1);
  const end   = new Date(year, mon + 1, 0);
  return {
    start: start.toISOString().split('T')[0]!,
    end:   end.toISOString().split('T')[0]!,
  };
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function FinancesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { month } = await searchParams;
  const supabase = await createClient();

  // Auth check — must be admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login`);

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect(`/app/${slug}/dashboard`);
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  const selectedMonth = month ?? getCurrentMonth();
  const { start, end } = getMonthRange(selectedMonth);

  // Fetch transactions for month
  const { data: transactions } = await supabase
    .from('financial_transactions')
    .select('id, type, category, amount, description, transaction_date, payment_method, reference, is_reconciled, tax_deductible, patients(first_name, last_name)')
    .eq('tenant_id', tenant.id)
    .gte('transaction_date', start)
    .lte('transaction_date', end)
    .order('transaction_date', { ascending: false }) as { data: Transaction[] | null };

  const txList = transactions ?? [];

  // Fetch open cash session
  const { data: openSession } = await supabase
    .from('cash_register_sessions')
    .select('id, opened_at, closed_at, opening_balance, closing_balance')
    .eq('tenant_id', tenant.id)
    .is('closed_at', null)
    .maybeSingle() as { data: CashSession | null };

  // Stats
  const totalIngresos = txList
    .filter((t) => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalEgresos = txList
    .filter((t) => t.type === 'egreso')
    .reduce((sum, t) => sum + t.amount, 0);
  const balance = totalIngresos - totalEgresos;

  // Month navigation
  const [yearPart, monPart] = selectedMonth.split('-');
  const year = parseInt(yearPart ?? '', 10);
  const mon  = parseInt(monPart ?? '', 10) - 1;
  const prevDate = new Date(year, mon - 1, 1);
  const nextDate = new Date(year, mon + 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
  const currentMonth = getCurrentMonth();
  const isCurrentMonth = selectedMonth === currentMonth;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Ingresos y egresos del consultorio</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/${slug}/finances/caja`}>
              <CircleDot size={14} className={openSession ? 'text-green-600' : 'text-red-500'} />
              {openSession ? 'Caja abierta' : 'Abrir caja'}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/app/${slug}/finances/new`}><Plus size={15} />Nuevo movimiento</Link>
          </Button>
        </div>
      </div>

      {/* Open session banner */}
      {openSession && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-green-800">Caja abierta</p>
            <p className="text-xs text-green-700 mt-0.5">
              Desde {new Date(openSession.opened_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
              {' · '}Saldo inicial: {formatCurrency(openSession.opening_balance)}
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="border-green-300 text-green-800 hover:bg-green-100">
            <Link href={`/app/${slug}/finances/caja`}>Ver caja →</Link>
          </Button>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-center gap-4">
        <Link
          href={`?month=${prevMonth}`}
          className="text-sm text-primary hover:underline font-medium"
        >
          ← {MONTH_NAMES[(prevDate.getMonth())] ?? ''}
        </Link>
        <h2 className="text-lg font-bold">
          {MONTH_NAMES[mon] ?? ''} {year}
        </h2>
        <Link
          href={isCurrentMonth ? '#' : `?month=${nextMonth}`}
          className={`text-sm font-medium ${isCurrentMonth ? 'text-muted-foreground/40 cursor-default' : 'text-primary hover:underline'}`}
        >
          {MONTH_NAMES[(nextDate.getMonth())] ?? ''} →
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ingresos</p>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(totalIngresos)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {txList.filter((t) => t.type === 'ingreso').length} movimientos
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Egresos</p>
            <p className="text-3xl font-bold text-red-600">{formatCurrency(totalEgresos)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {txList.filter((t) => t.type === 'egreso').length} movimientos
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Balance</p>
            <p className={`text-3xl font-bold ${balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
              {formatCurrency(balance)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">neto del mes</p>
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      {txList.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {/* Ingresos breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-green-700">Ingresos por categoría</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {Object.entries(
                txList.filter((t) => t.type === 'ingreso').reduce<Record<string, number>>((acc, t) => {
                  acc[t.category] = (acc[t.category] ?? 0) + t.amount;
                  return acc;
                }, {})
              )
                .sort(([, a], [, b]) => b - a)
                .map(([cat, total]) => (
                  <div key={cat} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-gray-700">{CATEGORY_LABELS[cat] ?? cat}</span>
                    <span className="font-semibold text-green-700">{formatCurrency(total)}</span>
                  </div>
                ))}
              {txList.filter((t) => t.type === 'ingreso').length === 0 && (
                <p className="px-4 py-4 text-sm text-muted-foreground">Sin ingresos</p>
              )}
            </CardContent>
          </Card>

          {/* Egresos breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-700">Egresos por categoría</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {Object.entries(
                txList.filter((t) => t.type === 'egreso').reduce<Record<string, number>>((acc, t) => {
                  acc[t.category] = (acc[t.category] ?? 0) + t.amount;
                  return acc;
                }, {})
              )
                .sort(([, a], [, b]) => b - a)
                .map(([cat, total]) => (
                  <div key={cat} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-gray-700">{CATEGORY_LABELS[cat] ?? cat}</span>
                    <span className="font-semibold text-red-700">{formatCurrency(total)}</span>
                  </div>
                ))}
              {txList.filter((t) => t.type === 'egreso').length === 0 && (
                <p className="px-4 py-4 text-sm text-muted-foreground">Sin egresos</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transactions list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Movimientos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {txList.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Wallet size={26} className="text-primary" />
              </div>
              <p className="font-medium text-foreground">Sin movimientos en {MONTH_NAMES[mon] ?? ''}</p>
              <p className="text-sm mt-1 mb-5">Registra el primer ingreso o egreso</p>
              <Button asChild size="sm">
                <Link href={`/app/${slug}/finances/new`}><Plus size={14} />Nuevo movimiento</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {txList.map((tx) => (
                <div key={tx.id} className="flex items-start gap-4 px-5 py-4">
                  {/* Type indicator */}
                  <div
                    className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                      tx.type === 'ingreso'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {tx.type === 'ingreso'
                      ? <TrendingUp size={16} />
                      : <TrendingDown size={16} />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {CATEGORY_LABELS[tx.category] ?? tx.category}
                      {tx.patients && ` · ${tx.patients.first_name} ${tx.patients.last_name}`}
                      {tx.payment_method && ` · ${tx.payment_method}`}
                      {tx.reference && ` · Ref: ${tx.reference}`}
                    </p>
                    <div className="flex gap-1.5 mt-1">
                      {tx.is_reconciled && (
                        <Badge variant="secondary">Conciliado</Badge>
                      )}
                      {tx.tax_deductible && (
                        <Badge variant="info">Deducible SRI</Badge>
                      )}
                    </div>
                  </div>

                  {/* Amount + date */}
                  <div className="flex-shrink-0 text-right">
                    <p
                      className={`font-bold text-sm ${
                        tx.type === 'ingreso' ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {tx.type === 'ingreso' ? '+' : '−'}{formatCurrency(tx.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(tx.transaction_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
