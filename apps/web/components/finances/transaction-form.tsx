'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransactionFormProps {
  slug: string;
  tenantId: string;
  createdBy: string;
  cashSessionId?: string;
  defaultType?: 'ingreso' | 'egreso';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INCOME_CATEGORIES = [
  { value: 'consulta',      label: 'Consulta médica' },
  { value: 'procedimiento', label: 'Procedimiento' },
  { value: 'laboratorio',   label: 'Laboratorio' },
  { value: 'farmacia',      label: 'Farmacia' },
  { value: 'certificado',   label: 'Certificado médico' },
];

const EXPENSE_CATEGORIES = [
  { value: 'alquiler',          label: 'Alquiler' },
  { value: 'servicios_basicos', label: 'Servicios básicos' },
  { value: 'sueldos',           label: 'Sueldos / honorarios' },
  { value: 'insumos_medicos',   label: 'Insumos médicos' },
  { value: 'equipos',           label: 'Equipos / mantenimiento' },
  { value: 'impuestos',         label: 'Impuestos' },
  { value: 'marketing',         label: 'Marketing' },
  { value: 'capacitacion',      label: 'Capacitación' },
  { value: 'seguros',           label: 'Seguros' },
  { value: 'otros',             label: 'Otros' },
];

const PAYMENT_METHODS = [
  { value: 'efectivo',       label: 'Efectivo' },
  { value: 'transferencia',  label: 'Transferencia bancaria' },
  { value: 'tarjeta',        label: 'Tarjeta' },
  { value: 'seguro_medico',  label: 'Seguro médico' },
  { value: 'otro',           label: 'Otro' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function RequiredMark() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

export function TransactionForm({
  slug,
  tenantId,
  createdBy,
  cashSessionId,
  defaultType = 'ingreso',
}: TransactionFormProps) {
  const router = useRouter();

  const [type, setType]               = useState<'ingreso' | 'egreso'>(defaultType);
  const [category, setCategory]       = useState('consulta');
  const [amount, setAmount]           = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate]               = useState(new Date().toISOString().split('T')[0]!);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [reference, setReference]     = useState('');
  const [taxDeductible, setTaxDeductible] = useState(false);
  const [notes, setNotes]             = useState('');

  // Insurance fields
  const [insuranceCompany, setInsuranceCompany]     = useState('');
  const [insuranceAuthNumber, setInsuranceAuthNumber] = useState('');
  const [insuranceCoveragePct, setInsuranceCoveragePct] = useState('');
  const [insuranceAmount, setInsuranceAmount]       = useState('');
  const [patientAmount, setPatientAmount]           = useState('');

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Sync category when type changes
  function handleTypeChange(newType: 'ingreso' | 'egreso') {
    setType(newType);
    setCategory(newType === 'ingreso' ? 'consulta' : 'alquiler');
  }

  const categories = type === 'ingreso' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const showInsurance = paymentMethod === 'seguro_medico';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('El monto debe ser mayor a 0.');
      return;
    }
    if (!description.trim()) {
      setError('La descripción es obligatoria.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      type,
      category,
      amount: amountNum,
      description: description.trim(),
      transaction_date: date,
      payment_method: paymentMethod,
      reference: reference.trim() || null,
      tax_deductible: taxDeductible,
      notes: notes.trim() || null,
      created_by: createdBy,
      ...(cashSessionId ? { cash_session_id: cashSessionId } : {}),
    };

    if (showInsurance) {
      if (insuranceCompany) payload['insurance_company'] = insuranceCompany;
      if (insuranceAuthNumber) payload['insurance_auth_number'] = insuranceAuthNumber;
      if (insuranceCoveragePct) payload['insurance_coverage_pct'] = parseFloat(insuranceCoveragePct);
      if (insuranceAmount) payload['insurance_amount'] = parseFloat(insuranceAmount);
      if (patientAmount) payload['patient_amount'] = parseFloat(patientAmount);
    }

    const { error: insertError } = await supabase
      .from('financial_transactions')
      .insert(payload);

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/app/${slug}/finances`);
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const sectionClass       = 'bg-white rounded-xl border shadow-sm overflow-hidden';
  const sectionHeaderClass = 'px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]';
  const sectionTitleClass  = 'font-semibold text-white text-sm tracking-wide';
  const inputClass         = 'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';
  const labelClass         = 'text-sm font-medium text-gray-700';
  const selectClass        = 'flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Type toggle */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>💸 Tipo de movimiento</p>
        </div>
        <div className="p-6">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => handleTypeChange('ingreso')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                type === 'ingreso'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-green-50'
              }`}
            >
              ↑ Ingreso
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('egreso')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                type === 'egreso'
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-red-50'
              }`}
            >
              ↓ Egreso
            </button>
          </div>
        </div>
      </div>

      {/* Main data */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>📋 Datos del movimiento</p>
        </div>
        <div className="p-6 grid grid-cols-2 gap-5">
          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="category" className={labelClass}>Categoría<RequiredMark /></Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={selectClass}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="amount" className={labelClass}>Monto (USD)<RequiredMark /></Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500 text-sm">$</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>

          {/* Description */}
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="description" className={labelClass}>Descripción<RequiredMark /></Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Consulta médica - paciente Juan Pérez"
              required
              className={inputClass}
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="date" className={labelClass}>Fecha<RequiredMark /></Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <Label htmlFor="payment_method" className={labelClass}>Forma de pago</Label>
            <select
              id="payment_method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className={selectClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label htmlFor="reference" className={labelClass}>Referencia</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nº transacción, autorización..."
              className={inputClass}
            />
          </div>

          {/* Tax deductible */}
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={taxDeductible}
                onChange={(e) => setTaxDeductible(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#1E40AF] focus:ring-[#1E40AF]"
              />
              <span className="text-sm text-gray-700">Deducible SRI</span>
            </label>
          </div>
        </div>
      </div>

      {/* Insurance fields */}
      {showInsurance && (
        <div className={sectionClass}>
          <div className={sectionHeaderClass}>
            <p className={sectionTitleClass}>🏥 Datos del seguro médico</p>
          </div>
          <div className="p-6 grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="insurance_company" className={labelClass}>Aseguradora</Label>
              <Input
                id="insurance_company"
                value={insuranceCompany}
                onChange={(e) => setInsuranceCompany(e.target.value)}
                placeholder="Ej: Seguros Equinoccial"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurance_auth" className={labelClass}>Nº autorización</Label>
              <Input
                id="insurance_auth"
                value={insuranceAuthNumber}
                onChange={(e) => setInsuranceAuthNumber(e.target.value)}
                placeholder="Nº de autorización del seguro"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coverage_pct" className={labelClass}>Cobertura (%)</Label>
              <Input
                id="coverage_pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={insuranceCoveragePct}
                onChange={(e) => setInsuranceCoveragePct(e.target.value)}
                placeholder="80"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 col-span-1">
              <div className="space-y-1.5">
                <Label htmlFor="insurance_amount" className={labelClass}>Valor seguro ($)</Label>
                <Input
                  id="insurance_amount"
                  type="number"
                  step="0.01"
                  value={insuranceAmount}
                  onChange={(e) => setInsuranceAmount(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient_amount" className={labelClass}>Valor paciente ($)</Label>
                <Input
                  id="patient_amount"
                  type="number"
                  step="0.01"
                  value={patientAmount}
                  onChange={(e) => setPatientAmount(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>📝 Notas adicionales</p>
        </div>
        <div className="p-6">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Observaciones opcionales..."
            className="flex w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors placeholder:text-muted-foreground resize-none"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/app/${slug}/finances`)}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className={`font-semibold px-8 text-white ${
            type === 'ingreso'
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span>
              Guardando...
            </span>
          ) : `Registrar ${type}`}
        </Button>
      </div>
    </form>
  );
}
