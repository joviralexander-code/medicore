import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CashRegisterControls } from '@/components/finances/cash-register-controls';

export const metadata: Metadata = { title: 'Caja' };

interface Props {
  params: Promise<{ slug: string }>;
}

interface CashSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  difference: number | null;
  notes: string | null;
  opened_by_profile: { first_name: string; last_name: string } | null;
}

interface Transaction {
  type: 'ingreso' | 'egreso';
  amount: number;
  description: string;
  transaction_date: string;
  category: string;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
}

export default async function CajaPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

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

  // Current open session
  const { data: openSession } = await supabase
    .from('cash_register_sessions')
    .select(`
      id, opened_at, closed_at, opening_balance, closing_balance,
      expected_balance, difference, notes,
      opened_by_profile:opened_by(first_name, last_name)
    `)
    .eq('tenant_id', tenant.id)
    .is('closed_at', null)
    .maybeSingle() as { data: CashSession | null };

  // Today's transactions (linked to open session or today's date)
  const today = new Date().toISOString().split('T')[0]!;
  const { data: todayTx } = await supabase
    .from('financial_transactions')
    .select('type, amount, description, transaction_date, category')
    .eq('tenant_id', tenant.id)
    .eq('transaction_date', today)
    .order('created_at', { ascending: false }) as { data: Transaction[] | null };

  const txList = todayTx ?? [];
  const ingresos = txList.filter((t) => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const egresos  = txList.filter((t) => t.type === 'egreso').reduce((s, t) => s + t.amount, 0);
  const saldoEsperado = (openSession?.opening_balance ?? 0) + ingresos - egresos;

  // Last 5 closed sessions
  const { data: recentSessions } = await supabase
    .from('cash_register_sessions')
    .select('id, opened_at, closed_at, opening_balance, closing_balance, difference')
    .eq('tenant_id', tenant.id)
    .not('closed_at', 'is', null)
    .order('opened_at', { ascending: false })
    .limit(5) as { data: Omit<CashSession, 'expected_balance' | 'notes' | 'opened_by_profile'>[] | null };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href={`/app/${slug}/finances`} className="hover:text-gray-900 transition-colors">
            Finanzas
          </Link>
          <span>›</span>
          <span className="text-gray-900">Caja</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Control de Caja</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {openSession ? '🟢 Caja abierta' : '🔴 Caja cerrada'}
        </p>
      </div>

      {/* Open session card or open button */}
      {openSession ? (
        <>
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-green-800">Sesión activa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-green-700 font-medium">Apertura</p>
                  <p className="text-lg font-bold text-green-900">{formatCurrency(openSession.opening_balance)}</p>
                  <p className="text-xs text-green-700 mt-0.5">{formatTime(openSession.opened_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-green-700 font-medium">Ingresos hoy</p>
                  <p className="text-lg font-bold text-green-900">+{formatCurrency(ingresos)}</p>
                  <p className="text-xs text-green-700 mt-0.5">{txList.filter((t) => t.type === 'ingreso').length} movimientos</p>
                </div>
                <div>
                  <p className="text-xs text-green-700 font-medium">Saldo esperado</p>
                  <p className="text-2xl font-bold text-green-900">{formatCurrency(saldoEsperado)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <CashRegisterControls
            tenantId={tenant.id}
            sessionId={openSession.id}
            openedBy={user.id}
            openSession={openSession}
            expectedBalance={saldoEsperado}
            mode="close"
          />
        </>
      ) : (
        <CashRegisterControls
          tenantId={tenant.id}
          sessionId={null}
          openedBy={user.id}
          openSession={null}
          expectedBalance={0}
          mode="open"
        />
      )}

      {/* Today's movements */}
      {txList.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Movimientos de hoy</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {txList.map((tx, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 truncate max-w-xs">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{tx.category}</p>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ml-4 ${
                    tx.type === 'ingreso' ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {tx.type === 'ingreso' ? '+' : '−'}{formatCurrency(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">Balance del día</p>
              <p className={`text-sm font-bold ${ingresos - egresos >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(ingresos - egresos)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent closed sessions */}
      {(recentSessions ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cierres recientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(recentSessions ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(s.opened_at).toLocaleDateString('es-EC', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Apertura: {formatCurrency(s.opening_balance)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">
                      {s.closing_balance !== null ? formatCurrency(s.closing_balance) : '—'}
                    </p>
                    {s.difference !== null && (
                      <p className={`text-xs font-medium ${
                        s.difference === 0 ? 'text-green-600' :
                        s.difference > 0 ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {s.difference > 0 ? '+' : ''}{formatCurrency(s.difference)} diferencia
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
