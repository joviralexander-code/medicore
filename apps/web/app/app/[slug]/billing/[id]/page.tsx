import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TransmitButton } from '@/components/billing/transmit-button';
import { SendByEmailButton } from '@/components/shared/send-by-email-button';

export const metadata: Metadata = { title: 'Detalle del documento' };

interface Props {
  params: Promise<{ slug: string; id: string }>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoiceItem {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento?: number;
  iva_pct: number;
}

interface SriDocument {
  id: string;
  tenant_id: string;
  doc_type: string;
  serie: string | null;
  secuencial: string | null;
  clave_acceso: string | null;
  buyer_id_type: string | null;
  buyer_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  total: number | null;
  items: InvoiceItem[] | null;
  status: string;
  authorization_number: string | null;
  authorization_date: string | null;
  ride_url: string | null;
  created_at: string;
  // computed totals stored alongside items
  subtotal_0?: number | null;
  subtotal_12?: number | null;
  subtotal_15?: number | null;
  iva_12?: number | null;
  iva_15?: number | null;
}

interface SriTransmission {
  id: string;
  document_id: string;
  transmitted_at: string;
  status: string;
  duration_ms: number | null;
  response?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function itemSubtotal(item: InvoiceItem): number {
  return item.cantidad * item.precio_unitario * (1 - (item.descuento ?? 0) / 100);
}

function docNumber(serie: string | null, sec: string | null, status: string): string {
  if (!serie && !sec) return status === 'borrador' ? 'Borrador' : '—';
  return `${serie ?? ''}${sec ? `-${sec}` : ''}`;
}

function idTypeLabel(type: string | null): string {
  const map: Record<string, string> = {
    cedula: 'Cédula',
    ruc: 'RUC',
    pasaporte: 'Pasaporte',
  };
  return map[type ?? ''] ?? (type ?? '—');
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  type Info = { label: string; cls: string };
  const map: Record<string, Info> = {
    borrador:   { label: 'Borrador',   cls: 'bg-gray-100 text-gray-600' },
    autorizado: { label: 'Autorizado', cls: 'bg-green-100 text-green-800' },
    enviado:    { label: 'Enviado',    cls: 'bg-blue-100 text-blue-800' },
    rechazado:  { label: 'Rechazado',  cls: 'bg-red-100 text-red-800' },
    anulado:    { label: 'Anulado',    cls: 'bg-gray-100 text-gray-400' },
  };
  const entry = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${entry.cls} ${status === 'anulado' ? 'line-through' : ''}`}
    >
      {entry.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status description
// ---------------------------------------------------------------------------

const STATUS_DESCRIPTIONS: Record<string, string> = {
  borrador:
    'El documento ha sido guardado pero aún no se ha enviado al SRI. Puede editarlo o firmarlo y enviarlo.',
  enviado:
    'El documento fue enviado al SRI y está pendiente de autorización. El proceso puede tardar unos segundos.',
  autorizado:
    'El documento ha sido autorizado por el SRI. Ya tiene validez tributaria.',
  rechazado:
    'El SRI rechazó el documento. Revise los errores en el historial de transmisiones y corrija el problema.',
  anulado:
    'El documento ha sido anulado y ya no tiene validez tributaria.',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BillingDetailPage({ params }: Props) {
  const { slug, id } = await params;
  const supabase = await createClient();

  // Resolve tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  // Fetch document — verify it belongs to this tenant
  const { data: doc } = await supabase
    .from('sri_documents')
    .select(
      'id, tenant_id, doc_type, serie, secuencial, clave_acceso, buyer_id_type, buyer_id, buyer_name, buyer_email, total, items, status, authorization_number, authorization_date, ride_url, created_at, subtotal_0, subtotal_12, subtotal_15, iva_12, iva_15'
    )
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .single() as { data: SriDocument | null };

  if (!doc) redirect(`/app/${slug}/billing`);

  // Fetch transmission history
  const { data: transmissions } = await supabase
    .from('sri_transmissions')
    .select('*')
    .eq('document_id', id)
    .order('transmitted_at', { ascending: false })
    .limit(10) as { data: SriTransmission[] | null };

  const history = transmissions ?? [];
  const items = doc.items ?? [];

  // Compute totals from items if stored fields are null
  const subtotal0  = doc.subtotal_0  ?? items.filter((i) => i.iva_pct === 0).reduce((s, i) => s + itemSubtotal(i), 0);
  const subtotal12 = doc.subtotal_12 ?? items.filter((i) => i.iva_pct === 12).reduce((s, i) => s + itemSubtotal(i), 0);
  const subtotal15 = doc.subtotal_15 ?? items.filter((i) => i.iva_pct === 15).reduce((s, i) => s + itemSubtotal(i), 0);
  const iva12      = doc.iva_12 ?? subtotal12 * 0.12;
  const iva15      = doc.iva_15 ?? subtotal15 * 0.15;
  const total      = doc.total ?? subtotal0 + subtotal12 + subtotal15 + iva12 + iva15;

  const number = docNumber(doc.serie, doc.secuencial, doc.status);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div>
            <Link
              href={`/app/${slug}/billing`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Facturación
            </Link>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-bold tracking-tight font-mono">
              {number}
            </h1>
            <StatusBadge status={doc.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {doc.doc_type === 'factura' ? 'Factura electrónica' : doc.doc_type} — creada el{' '}
            {formatDate(doc.created_at)}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Two-column layout                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ============================================================== */}
        {/* Left — Invoice detail (2/3)                                     */}
        {/* ============================================================== */}
        <div className="lg:col-span-2 space-y-5">

          {/* Buyer */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
              <p className="font-semibold text-white text-sm tracking-wide">Datos del comprador</p>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Nombre</p>
                <p className="font-medium text-gray-900">{doc.buyer_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                  {idTypeLabel(doc.buyer_id_type)}
                </p>
                <p className="font-mono text-gray-900">{doc.buyer_id ?? '—'}</p>
              </div>
              {doc.buyer_email && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Correo</p>
                  <p className="text-gray-900">{doc.buyer_email}</p>
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
              <p className="font-semibold text-white text-sm tracking-wide">Ítems</p>
            </div>
            <div className="overflow-x-auto">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground p-5">Sin ítems registrados.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="text-left p-4 font-medium text-gray-700">Descripción</th>
                      <th className="text-right p-4 font-medium text-gray-700">Cant.</th>
                      <th className="text-right p-4 font-medium text-gray-700">Precio</th>
                      <th className="text-right p-4 font-medium text-gray-700">IVA%</th>
                      <th className="text-right p-4 font-medium text-gray-700">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="p-4 text-gray-900">{item.descripcion}</td>
                        <td className="p-4 text-right text-gray-700">{item.cantidad}</td>
                        <td className="p-4 text-right text-gray-700">{fmt(item.precio_unitario)}</td>
                        <td className="p-4 text-right text-gray-500">{item.iva_pct}%</td>
                        <td className="p-4 text-right font-semibold text-gray-900">
                          {fmt(itemSubtotal(item))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Totals */}
            <div className="border-t p-5">
              <div className="max-w-xs ml-auto space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal (0%)</span>
                  <span className="font-medium text-gray-900">{fmt(subtotal0)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal (12%)</span>
                  <span className="font-medium text-gray-900">{fmt(subtotal12)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal (15%)</span>
                  <span className="font-medium text-gray-900">{fmt(subtotal15)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>IVA 12%</span>
                  <span className="font-medium text-gray-900">{fmt(iva12)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>IVA 15%</span>
                  <span className="font-medium text-gray-900">{fmt(iva15)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-2 mt-2 text-gray-900">
                  <span>Total</span>
                  <span className="text-primary text-lg">{fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Clave de acceso */}
          {doc.clave_acceso && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Clave de acceso
              </p>
              <p className="font-mono text-xs text-gray-700 break-all">{doc.clave_acceso}</p>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* Right — Actions + Status (1/3)                                  */}
        {/* ============================================================== */}
        <div className="space-y-5">

          {/* Status card */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b">
              <p className="font-semibold text-sm text-gray-800">Estado del documento</p>
            </div>
            <div className="p-5 space-y-3">
              <StatusBadge status={doc.status} />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {STATUS_DESCRIPTIONS[doc.status] ?? 'Estado desconocido.'}
              </p>
            </div>
          </div>

          {/* Actions by status */}
          {doc.status === 'borrador' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b">
                <p className="font-semibold text-sm text-gray-800">Acciones</p>
              </div>
              <div className="p-5">
                <TransmitButton documentId={doc.id} slug={slug} />
              </div>
            </div>
          )}

          {doc.status === 'autorizado' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b">
                <p className="font-semibold text-sm text-gray-800">Autorización SRI</p>
              </div>
              <div className="p-5 space-y-3 text-sm">
                {doc.authorization_number && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                      Número de autorización
                    </p>
                    <p className="font-mono text-xs text-gray-800 break-all">
                      {doc.authorization_number}
                    </p>
                  </div>
                )}
                {doc.authorization_date && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                      Fecha de autorización
                    </p>
                    <p className="text-gray-800">{formatDate(doc.authorization_date)}</p>
                  </div>
                )}
                {doc.ride_url ? (
                  <a
                    href={doc.ride_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/90 px-4 py-2.5 text-sm font-medium text-white transition-colors"
                  >
                    Descargar RIDE (PDF)
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    El RIDE se genera automáticamente tras la autorización del SRI.
                  </p>
                )}
                <SendByEmailButton
                  type="invoice"
                  id={doc.id}
                  defaultEmail={doc.buyer_email ?? ''}
                  label="Enviar factura por email"
                  variant="outline"
                />
              </div>
            </div>
          )}

          {doc.status === 'enviado' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b">
                <p className="font-semibold text-sm text-gray-800">Acciones</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <span className="animate-spin inline-block text-base">⟳</span>
                  <span>En proceso — consultando SRI</span>
                </div>
                <Link
                  href={`/app/${slug}/billing/${id}`}
                  className="block w-full text-center rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 px-4 py-2 text-sm font-medium text-blue-700 transition-colors"
                >
                  Actualizar estado
                </Link>
              </div>
            </div>
          )}

          {doc.status === 'rechazado' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b">
                <p className="font-semibold text-sm text-gray-800">Acciones</p>
              </div>
              <div className="p-5">
                <p className="text-xs text-muted-foreground">
                  Revisa el historial de transmisiones para ver el detalle del error del SRI.
                </p>
              </div>
            </div>
          )}

          {/* Transmission history */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b">
              <p className="font-semibold text-sm text-gray-800">Historial de transmisiones</p>
            </div>
            <div className="divide-y">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground p-5">Sin intentos de transmisión.</p>
              ) : (
                history.map((tx) => (
                  <div key={tx.id} className="p-4 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={tx.status} />
                      {tx.duration_ms != null && (
                        <span className="text-xs text-muted-foreground">{tx.duration_ms}ms</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(tx.transmitted_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
