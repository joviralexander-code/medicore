'use client';

import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  cedula: string | null;
  cedula_type: string | null;
  email: string | null;
  phone: string | null;
}

interface InvoiceItem {
  id: string; // local only (uuid)
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  iva_pct: number;
}

export interface InvoiceFormProps {
  slug: string;
  tenantId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateLocalId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function blankItem(): InvoiceItem {
  return {
    id: generateLocalId(),
    codigo: '',
    descripcion: '',
    cantidad: 1,
    precio_unitario: 0,
    descuento: 0,
    iva_pct: 12,
  };
}

function itemSubtotal(item: InvoiceItem): number {
  return item.cantidad * item.precio_unitario * (1 - item.descuento / 100);
}

interface Totals {
  subtotal0: number;
  subtotal12: number;
  subtotal15: number;
  iva12: number;
  iva15: number;
  total: number;
}

function calcTotals(items: InvoiceItem[]): Totals {
  const subtotal0  = items.filter((i) => i.iva_pct === 0).reduce((s, i) => s + itemSubtotal(i), 0);
  const subtotal12 = items.filter((i) => i.iva_pct === 12).reduce((s, i) => s + itemSubtotal(i), 0);
  const subtotal15 = items.filter((i) => i.iva_pct === 15).reduce((s, i) => s + itemSubtotal(i), 0);
  const iva12  = subtotal12 * 0.12;
  const iva15  = subtotal15 * 0.15;
  const total  = subtotal0 + subtotal12 + subtotal15 + iva12 + iva15;
  return { subtotal0, subtotal12, subtotal15, iva12, iva15, total };
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvoiceForm({ slug, tenantId }: InvoiceFormProps) {
  const router = useRouter();

  // --- Patient search ---
  const [patientQuery, setPatientQuery]     = useState('');
  const [patientResults, setPatientResults] = useState<PatientSearchResult[]>([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [showDropdown, setShowDropdown]     = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // --- Buyer fields ---
  const [buyerIdType, setBuyerIdType] = useState('cedula');
  const [buyerId, setBuyerId]         = useState('');
  const [buyerName, setBuyerName]     = useState('');
  const [buyerEmail, setBuyerEmail]   = useState('');

  // --- Items ---
  const [items, setItems] = useState<InvoiceItem[]>([blankItem()]);

  // --- Payment ---
  const [paymentMethod, setPaymentMethod] = useState('efectivo');

  // --- Notes ---
  const [notes, setNotes] = useState('');

  // --- UI ---
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Patient search
  const runSearch = useCallback(
    (query: string) => {
      if (query.length < 3) {
        setPatientResults([]);
        setShowDropdown(false);
        return;
      }
      const controller = new AbortController();
      setSearchLoading(true);

      async function doSearch() {
        const supabase = createClient();
        const { data } = await supabase
          .from('patients')
          .select('id, first_name, last_name, cedula, cedula_type, email, phone')
          .eq('tenant_id', tenantId)
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,cedula.ilike.%${query}%`)
          .limit(8);
        if (!controller.signal.aborted) {
          setPatientResults((data as PatientSearchResult[]) ?? []);
          setShowDropdown(true);
          setSearchLoading(false);
        }
      }
      void doSearch();
      return () => controller.abort();
    },
    [tenantId]
  );

  useEffect(() => {
    const timer = setTimeout(() => runSearch(patientQuery), 300);
    return () => clearTimeout(timer);
  }, [patientQuery, runSearch]);

  function handlePatientQueryChange(e: ChangeEvent<HTMLInputElement>) {
    setPatientQuery(e.target.value);
    // Clear auto-filled buyer fields when user starts typing again
    if (!e.target.value) {
      setBuyerId('');
      setBuyerName('');
      setBuyerEmail('');
      setBuyerIdType('cedula');
    }
  }

  function selectPatient(p: PatientSearchResult) {
    setPatientQuery(`${p.first_name} ${p.last_name}`);
    setBuyerName(`${p.first_name} ${p.last_name}`);
    setBuyerId(p.cedula ?? '');
    setBuyerIdType(
      p.cedula_type === 'RUC' ? 'ruc'
      : p.cedula_type === 'pasaporte' ? 'pasaporte'
      : 'cedula'
    );
    setBuyerEmail(p.email ?? '');
    setPatientResults([]);
    setShowDropdown(false);
  }

  // ---------------------------------------------------------------------------
  // Items management
  // ---------------------------------------------------------------------------

  function updateItem<K extends keyof InvoiceItem>(id: string, field: K, value: InvoiceItem[K]) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function addItem() {
    setItems((prev) => [...prev, blankItem()]);
  }

  // ---------------------------------------------------------------------------
  // Calculated totals (reactive)
  // ---------------------------------------------------------------------------
  const totals = calcTotals(items);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!buyerName.trim()) {
      setError('El nombre del comprador es obligatorio.');
      return;
    }
    if (!buyerId.trim()) {
      setError('El número de documento del comprador es obligatorio.');
      return;
    }
    if (items.length === 0) {
      setError('Debe agregar al menos un ítem.');
      return;
    }
    const invalidItem = items.find((i) => !i.descripcion.trim() || i.cantidad <= 0 || i.precio_unitario < 0);
    if (invalidItem) {
      setError('Todos los ítems deben tener descripción, cantidad y precio válidos.');
      return;
    }

    setLoading(true);

    const { subtotal0, subtotal12, subtotal15, iva12, iva15, total } = totals;

    // Strip local `id` from items before persisting
    const itemsPayload = items.map(({ id: _id, ...rest }) => rest);

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from('sri_documents')
      .insert({
        tenant_id:       tenantId,
        doc_type:        'factura',
        ambiente:        1, // pruebas
        serie:           '001-001',
        secuencial:      '000000001',
        buyer_id_type:   buyerIdType,
        buyer_id:        buyerId,
        buyer_name:      buyerName,
        buyer_email:     buyerEmail || null,
        subtotal_0:      subtotal0,
        subtotal_12:     subtotal12,
        subtotal_15:     subtotal15,
        iva_0:           0,
        iva_12:          iva12,
        iva_15:          iva15,
        total,
        items:           itemsPayload,
        payment_method:  paymentMethod,
        notes:           notes || null,
        status:          'borrador',
      })
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/app/${slug}/billing`);
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const sectionClass       = 'bg-white rounded-xl border shadow-sm overflow-hidden';
  const sectionHeaderClass = 'px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]';
  const sectionTitleClass  = 'font-semibold text-white text-sm tracking-wide';
  const labelClass         = 'text-sm font-medium text-gray-700';
  const inputClass         = 'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';
  const selectClass        = 'flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors';
  const compactInputClass  = 'h-8 border-gray-200 bg-gray-50 text-xs px-2 focus:border-[#1E40AF] focus:bg-white transition-colors';
  const compactSelectClass = 'h-8 rounded-md border border-gray-200 bg-gray-50 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring focus:border-[#1E40AF] focus:bg-white transition-colors w-full';

  function RequiredMark() {
    return <span className="text-red-500 ml-0.5">*</span>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Datos del comprador                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>👤 Datos del comprador</p>
        </div>
        <div className="p-6 space-y-5">
          {/* Patient search to auto-fill */}
          <div ref={searchRef} className="space-y-1.5">
            <Label htmlFor="patient_search" className={labelClass}>
              Buscar paciente (opcional — para auto-completar)
            </Label>
            <div className="relative">
              <Input
                id="patient_search"
                value={patientQuery}
                onChange={handlePatientQueryChange}
                onFocus={() => patientResults.length > 0 && setShowDropdown(true)}
                placeholder="Escriba nombre o cédula..."
                autoComplete="off"
                className={inputClass}
              />
              {searchLoading && (
                <span className="absolute right-3 top-2.5 text-muted-foreground text-xs">
                  Buscando…
                </span>
              )}
              {showDropdown && patientResults.length > 0 && (
                <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => selectPatient(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm transition-colors"
                      >
                        <span className="font-medium text-gray-900">
                          {p.first_name} {p.last_name}
                        </span>
                        {p.cedula && (
                          <span className="ml-2 text-xs text-muted-foreground">{p.cedula}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {showDropdown && !searchLoading && patientResults.length === 0 && patientQuery.length >= 3 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm text-muted-foreground">
                  No se encontraron pacientes.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="buyer_id_type" className={labelClass}>Tipo de documento<RequiredMark /></Label>
              <select
                id="buyer_id_type"
                value={buyerIdType}
                onChange={(e) => setBuyerIdType(e.target.value)}
                className={selectClass}
              >
                <option value="cedula">Cédula</option>
                <option value="ruc">RUC</option>
                <option value="pasaporte">Pasaporte</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="buyer_id" className={labelClass}>Número de documento<RequiredMark /></Label>
              <Input
                id="buyer_id"
                value={buyerId}
                onChange={(e) => setBuyerId(e.target.value)}
                placeholder="1712345678"
                className={inputClass}
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="buyer_name" className={labelClass}>Razón social / Nombre<RequiredMark /></Label>
              <Input
                id="buyer_name"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Juan Carlos García"
                className={inputClass}
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="buyer_email" className={labelClass}>Correo electrónico (para envío del comprobante)</Label>
              <Input
                id="buyer_email"
                type="email"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Items                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>📋 Ítems de la factura</p>
        </div>
        <div className="p-5 space-y-3">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[80px_1fr_64px_90px_72px_60px_72px_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span>Código</span>
            <span>Descripción *</span>
            <span className="text-center">Cant.*</span>
            <span className="text-center">Precio *</span>
            <span className="text-center">Dscto %</span>
            <span className="text-center">IVA %</span>
            <span className="text-right">Subtotal</span>
            <span />
          </div>

          {items.map((item) => {
            const sub = itemSubtotal(item);
            return (
              <div
                key={item.id}
                className="grid grid-cols-1 sm:grid-cols-[80px_1fr_64px_90px_72px_60px_72px_36px] gap-2 items-center border border-gray-100 rounded-lg p-2 sm:border-0 sm:rounded-none sm:p-0"
              >
                {/* Código */}
                <div>
                  <span className="sm:hidden text-xs text-muted-foreground">Código: </span>
                  <Input
                    value={item.codigo}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => updateItem(item.id, 'codigo', e.target.value)}
                    placeholder="001"
                    className={compactInputClass}
                    aria-label="Código"
                  />
                </div>

                {/* Descripción */}
                <div>
                  <span className="sm:hidden text-xs text-muted-foreground">Descripción: </span>
                  <Input
                    value={item.descripcion}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => updateItem(item.id, 'descripcion', e.target.value)}
                    placeholder="Consulta médica general"
                    className={compactInputClass}
                    aria-label="Descripción"
                    required
                  />
                </div>

                {/* Cantidad */}
                <div>
                  <span className="sm:hidden text-xs text-muted-foreground">Cantidad: </span>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={item.cantidad}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateItem(item.id, 'cantidad', parseFloat(e.target.value) || 0)
                    }
                    className={`${compactInputClass} text-center`}
                    aria-label="Cantidad"
                    required
                  />
                </div>

                {/* Precio unitario */}
                <div>
                  <span className="sm:hidden text-xs text-muted-foreground">Precio: </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.precio_unitario}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateItem(item.id, 'precio_unitario', parseFloat(e.target.value) || 0)
                    }
                    className={`${compactInputClass} text-right`}
                    aria-label="Precio unitario"
                    required
                  />
                </div>

                {/* Descuento */}
                <div>
                  <span className="sm:hidden text-xs text-muted-foreground">Descuento %: </span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={item.descuento}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateItem(item.id, 'descuento', parseFloat(e.target.value) || 0)
                    }
                    className={`${compactInputClass} text-center`}
                    aria-label="Descuento %"
                  />
                </div>

                {/* IVA % */}
                <div>
                  <span className="sm:hidden text-xs text-muted-foreground">IVA %: </span>
                  <select
                    value={item.iva_pct}
                    onChange={(e) => updateItem(item.id, 'iva_pct', parseInt(e.target.value, 10))}
                    className={compactSelectClass}
                    aria-label="IVA %"
                  >
                    <option value={0}>0%</option>
                    <option value={12}>12%</option>
                    <option value={15}>15%</option>
                  </select>
                </div>

                {/* Subtotal (read-only) */}
                <div className="text-right">
                  <span className="sm:hidden text-xs text-muted-foreground">Subtotal: </span>
                  <span className="text-xs font-semibold text-gray-900">{fmt(sub)}</span>
                </div>

                {/* Remove */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length === 1}
                    className="h-8 w-8 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm flex items-center justify-center"
                    aria-label="Eliminar ítem"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" onClick={addItem} className="mt-2">
            + Agregar ítem
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Forma de pago + Notas                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className={sectionClass}>
          <div className={sectionHeaderClass}>
            <p className={sectionTitleClass}>💳 Forma de pago</p>
          </div>
          <div className="p-6">
            <div className="space-y-1.5">
              <Label htmlFor="payment_method" className={labelClass}>Método de pago<RequiredMark /></Label>
              <select
                id="payment_method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={selectClass}
              >
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta de crédito / débito</option>
                <option value="transferencia">Transferencia bancaria</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>
        </div>

        <div className={sectionClass}>
          <div className={sectionHeaderClass}>
            <p className={sectionTitleClass}>📝 Notas</p>
          </div>
          <div className="p-6">
            <div className="space-y-1.5">
              <Label htmlFor="notes" className={labelClass}>Notas adicionales (opcional)</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Observaciones para el comprobante..."
                className="flex w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors placeholder:text-muted-foreground resize-none h-[82px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Totals                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>🧮 Resumen de totales</p>
        </div>
        <div className="p-6">
          <div className="max-w-xs ml-auto space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal (0%)</span>
              <span className="font-medium text-gray-900">{fmt(totals.subtotal0)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal (12%)</span>
              <span className="font-medium text-gray-900">{fmt(totals.subtotal12)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal (15%)</span>
              <span className="font-medium text-gray-900">{fmt(totals.subtotal15)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>IVA 12%</span>
              <span className="font-medium text-gray-900">{fmt(totals.iva12)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>IVA 15%</span>
              <span className="font-medium text-gray-900">{fmt(totals.iva15)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-2 mt-2 text-gray-900">
              <span>Total</span>
              <span className="text-[#1E40AF] text-lg">{fmt(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Error + Submit                                                      */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/app/${slug}/billing`)}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold px-8"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span>
              Guardando...
            </span>
          ) : 'Guardar borrador'}
        </Button>
      </div>
    </form>
  );
}
