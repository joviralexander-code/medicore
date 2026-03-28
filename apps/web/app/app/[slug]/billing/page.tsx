import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Receipt, Plus } from 'lucide-react';

export const metadata: Metadata = { title: 'Facturación SRI' };

interface Props {
  params: Promise<{ slug: string }>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SriDocument {
  id: string;
  doc_type: string;
  serie: string | null;
  secuencial: string | null;
  buyer_name: string | null;
  total: number | null;
  status: string;
  created_at: string;
  authorization_date: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number | null): string {
  if (amount == null) return '—';
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDocNumber(serie: string | null, sec: string | null): string {
  if (!serie && !sec) return '—';
  return `${serie ?? ''}${sec ? `-${sec}` : ''}`;
}

function DocTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    factura:         'Factura',
    nota_credito:    'Nota de Crédito',
    nota_debito:     'Nota de Débito',
    liquidacion:     'Liquidación',
    retencion:       'Retención',
  };
  return <span className="text-xs text-gray-600">{map[type] ?? type}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'secondary' | 'success' | 'info' | 'error' }> = {
    borrador:   { label: 'Borrador',   variant: 'secondary' },
    autorizado: { label: 'Autorizado', variant: 'success' },
    enviado:    { label: 'Enviado',    variant: 'info' },
    rechazado:  { label: 'Rechazado',  variant: 'error' },
    anulado:    { label: 'Anulado',    variant: 'error' },
  };
  const entry = map[status] ?? { label: status, variant: 'secondary' as const };
  return (
    <Badge variant={entry.variant} className={status === 'anulado' ? 'line-through' : ''}>
      {entry.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BillingPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) {
    redirect('/onboarding');
  }

  const { data: invoices } = await supabase
    .from('sri_documents')
    .select('id, doc_type, serie, secuencial, buyer_name, total, status, created_at, authorization_date')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(50) as { data: SriDocument[] | null };

  const docs = invoices ?? [];

  // Stats
  const totalAutorizados = docs.filter((d) => d.status === 'autorizado').length;
  const totalBorradores  = docs.filter((d) => d.status === 'borrador').length;
  const montoTotal       = docs
    .filter((d) => d.status === 'autorizado' && d.total != null)
    .reduce((sum, d) => sum + (d.total ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturación SRI</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {docs.length} documento{docs.length !== 1 ? 's' : ''} — últimos 50
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/${slug}/billing/new`}><Plus size={15} />Nueva factura</Link>
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Quick stats                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Autorizados</p>
            <p className="text-3xl font-bold text-green-600">{totalAutorizados}</p>
            <p className="text-xs text-muted-foreground mt-0.5">documentos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Borradores</p>
            <p className="text-3xl font-bold text-gray-600">{totalBorradores}</p>
            <p className="text-xs text-muted-foreground mt-0.5">sin enviar</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Monto autorizado</p>
            <p className="text-3xl font-bold text-foreground">{formatCurrency(montoTotal)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">total</p>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Table                                                               */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos electrónicos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Receipt size={26} className="text-primary" />
              </div>
              <p className="font-medium text-foreground">No hay documentos aún</p>
              <p className="text-sm mt-1 mb-5">Genera la primera factura electrónica</p>
              <Button asChild size="sm">
                <Link href={`/app/${slug}/billing/new`}><Plus size={14} />Nueva factura</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">Número</th>
                    <th className="text-left p-4 font-medium">Tipo</th>
                    <th className="text-left p-4 font-medium">Cliente</th>
                    <th className="text-right p-4 font-medium">Total</th>
                    <th className="text-left p-4 font-medium">Estado</th>
                    <th className="text-left p-4 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-mono text-xs text-gray-700">
                        {formatDocNumber(doc.serie, doc.secuencial)}
                      </td>
                      <td className="p-4">
                        <DocTypeBadge type={doc.doc_type} />
                      </td>
                      <td className="p-4 text-gray-900 font-medium">
                        {doc.buyer_name ?? '—'}
                      </td>
                      <td className="p-4 text-right font-semibold text-gray-900">
                        {formatCurrency(doc.total)}
                      </td>
                      <td className="p-4">
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="p-4 text-muted-foreground text-xs">
                        {formatDate(doc.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
