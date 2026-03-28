'use client';

import { useState, useRef, useEffect } from 'react';
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
}

interface Diagnosis {
  cie10_code: string;
  description: string;
}

interface Dosage {
  amount: string;
  unit: string;
  frequency: string;
  duration: string;
  instructions: string;
}

interface Medication {
  name: string;
  active_ingredient: string;
  concentration: string;
  pharmaceutical_form: string;
  quantity: string;
  unit: string;
  dosage: Dosage;
  is_controlled: boolean;
}

interface Cie10Result {
  code: string;
  description: string;
}

export interface PrescriptionFormProps {
  slug: string;
  tenantId: string;
  doctorId: string;
  preselectedPatientId?: string;
  preselectedPatientName?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHARMA_FORMS = [
  'Tableta', 'Cápsula', 'Jarabe', 'Suspensión', 'Solución', 'Inyectable',
  'Crema', 'Ungüento', 'Gel', 'Colirio', 'Gotas', 'Parche', 'Supositorio', 'Otro',
];

const QUANTITY_UNITS = ['tabletas', 'cápsulas', 'frascos', 'ampollas', 'tubos', 'cajas', 'unidades'];

const FREQUENCY_OPTIONS = [
  'Cada 4 horas', 'Cada 6 horas', 'Cada 8 horas', 'Cada 12 horas',
  'Una vez al día', 'Dos veces al día', 'Tres veces al día',
  'Con cada comida', 'Según necesidad', 'Dosis única',
];

const DURATION_OPTIONS = [
  '3 días', '5 días', '7 días', '10 días', '14 días', '21 días',
  '1 mes', '2 meses', '3 meses', 'Indefinido',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyMedication(): Medication {
  return {
    name: '',
    active_ingredient: '',
    concentration: '',
    pharmaceutical_form: 'Tableta',
    quantity: '',
    unit: 'tabletas',
    dosage: { amount: '', unit: 'mg', frequency: 'Cada 8 horas', duration: '7 días', instructions: '' },
    is_controlled: false,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RequiredMark() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

function DiagnosisRow({
  diag,
  onChange,
  onRemove,
  tenantId,
}: {
  diag: Diagnosis;
  onChange: (d: Diagnosis) => void;
  onRemove: () => void;
  tenantId: string;
}) {
  const [query, setQuery] = useState(diag.cie10_code ? `${diag.cie10_code} – ${diag.description}` : '');
  const [results, setResults] = useState<Cie10Result[]>([]);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (diag.cie10_code || query.length < 3) { setResults([]); setShow(false); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('cie10_codes')
        .select('code, description')
        .or(`code.ilike.${query}%,description.ilike.%${query}%`)
        .limit(8);
      if (!ctrl.signal.aborted) {
        setResults((data as Cie10Result[]) ?? []);
        setShow(true);
      }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, diag.cie10_code, tenantId]);

  function select(r: Cie10Result) {
    onChange({ cie10_code: r.code, description: r.description });
    setQuery(`${r.code} – ${r.description}`);
    setShow(false);
    setResults([]);
  }

  function clear() {
    onChange({ cie10_code: '', description: '' });
    setQuery('');
  }

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1 relative" ref={ref}>
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (diag.cie10_code) clear(); }}
          placeholder="Buscar código CIE-10 o descripción..."
          className="h-9 text-sm border-gray-200 bg-gray-50 focus:bg-white focus:border-[#1E40AF]"
        />
        {show && results.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {results.map((r) => (
              <li key={r.code}>
                <button
                  type="button"
                  onClick={() => select(r)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs transition-colors"
                >
                  <span className="font-mono font-semibold text-[#1E40AF]">{r.code}</span>
                  <span className="ml-2 text-gray-700">{r.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
        title="Eliminar diagnóstico"
      >
        ✕
      </button>
    </div>
  );
}

function MedicationCard({
  med,
  index,
  onChange,
  onRemove,
}: {
  med: Medication;
  index: number;
  onChange: (m: Medication) => void;
  onRemove: () => void;
}) {
  function update(field: keyof Medication, value: string | boolean) {
    onChange({ ...med, [field]: value });
  }
  function updateDosage(field: keyof Dosage, value: string) {
    onChange({ ...med, dosage: { ...med.dosage, [field]: value } });
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Medicamento #{index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-md transition-colors"
        >
          Eliminar
        </button>
      </div>

      {/* Row 1: name + active ingredient */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Nombre comercial<RequiredMark /></Label>
          <Input
            value={med.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Ej: Amoxidal"
            className="h-9 text-sm border-gray-200 bg-white focus:border-[#1E40AF]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Principio activo</Label>
          <Input
            value={med.active_ingredient}
            onChange={(e) => update('active_ingredient', e.target.value)}
            placeholder="Ej: Amoxicilina"
            className="h-9 text-sm border-gray-200 bg-white focus:border-[#1E40AF]"
          />
        </div>
      </div>

      {/* Row 2: concentration + form + quantity + unit */}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Concentración</Label>
          <Input
            value={med.concentration}
            onChange={(e) => update('concentration', e.target.value)}
            placeholder="500mg"
            className="h-9 text-sm border-gray-200 bg-white focus:border-[#1E40AF]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Forma farmac.</Label>
          <select
            value={med.pharmaceutical_form}
            onChange={(e) => update('pharmaceutical_form', e.target.value)}
            className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF]"
          >
            {PHARMA_FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Cantidad<RequiredMark /></Label>
          <Input
            type="number"
            min="1"
            value={med.quantity}
            onChange={(e) => update('quantity', e.target.value)}
            placeholder="30"
            className="h-9 text-sm border-gray-200 bg-white focus:border-[#1E40AF]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Unidad</Label>
          <select
            value={med.unit}
            onChange={(e) => update('unit', e.target.value)}
            className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF]"
          >
            {QUANTITY_UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* Dosage */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Posología</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">Frecuencia</Label>
            <select
              value={med.dosage.frequency}
              onChange={(e) => updateDosage('frequency', e.target.value)}
              className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF]"
            >
              {FREQUENCY_OPTIONS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">Duración</Label>
            <select
              value={med.dosage.duration}
              onChange={(e) => updateDosage('duration', e.target.value)}
              className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF]"
            >
              {DURATION_OPTIONS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">Indicaciones</Label>
            <Input
              value={med.dosage.instructions}
              onChange={(e) => updateDosage('instructions', e.target.value)}
              placeholder="Con alimentos, en ayunas..."
              className="h-9 text-sm border-gray-200 bg-white focus:border-[#1E40AF]"
            />
          </div>
        </div>
      </div>

      {/* Controlled */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={med.is_controlled}
          onChange={(e) => update('is_controlled', e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-[#1E40AF] focus:ring-[#1E40AF]"
        />
        <span className="text-xs text-gray-700">Medicamento de control especial</span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PrescriptionForm({
  slug,
  tenantId,
  doctorId,
  preselectedPatientId,
  preselectedPatientName,
}: PrescriptionFormProps) {
  const router = useRouter();

  // Patient search
  const [patientQuery, setPatientQuery]     = useState(preselectedPatientName ?? '');
  const [patientId, setPatientId]           = useState(preselectedPatientId ?? '');
  const [patientResults, setPatientResults] = useState<PatientSearchResult[]>([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [showDropdown, setShowDropdown]     = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Core fields
  const [issueDate, setIssueDate]           = useState(new Date().toISOString().split('T')[0]!);
  const [validityDays, setValidityDays]     = useState('30');
  const [diagnoses, setDiagnoses]           = useState<Diagnosis[]>([{ cie10_code: '', description: '' }]);
  const [medications, setMedications]       = useState<Medication[]>([emptyMedication()]);
  const [instructions, setInstructions]     = useState('');

  // UI
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Patient search debounced
  useEffect(() => {
    if (patientId || patientQuery.length < 3) {
      setPatientResults([]); setShowDropdown(false); return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('patients')
        .select('id, first_name, last_name, cedula')
        .eq('tenant_id', tenantId)
        .or(`first_name.ilike.%${patientQuery}%,last_name.ilike.%${patientQuery}%,cedula.ilike.%${patientQuery}%`)
        .limit(8);
      if (!ctrl.signal.aborted) {
        setPatientResults((data as PatientSearchResult[]) ?? []);
        setShowDropdown(true);
        setSearchLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [patientQuery, patientId, tenantId]);

  function selectPatient(p: PatientSearchResult) {
    setPatientId(p.id);
    setPatientQuery(`${p.first_name} ${p.last_name}`);
    setPatientResults([]);
    setShowDropdown(false);
  }

  // Diagnoses handlers
  function addDiagnosis() {
    setDiagnoses((prev) => [...prev, { cie10_code: '', description: '' }]);
  }
  function updateDiagnosis(i: number, d: Diagnosis) {
    setDiagnoses((prev) => prev.map((x, idx) => (idx === i ? d : x)));
  }
  function removeDiagnosis(i: number) {
    setDiagnoses((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Medications handlers
  function addMedication() {
    setMedications((prev) => [...prev, emptyMedication()]);
  }
  function updateMedication(i: number, m: Medication) {
    setMedications((prev) => prev.map((x, idx) => (idx === i ? m : x)));
  }
  function removeMedication(i: number) {
    setMedications((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!patientId) {
      setError('Debe seleccionar un paciente de la lista.');
      return;
    }

    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) {
      setError('Debe agregar al menos un medicamento.');
      return;
    }

    // Validar validity_days antes de enviar
    const validityDaysNum = parseInt(validityDays, 10);
    if (isNaN(validityDaysNum) || validityDaysNum < 1 || validityDaysNum > 365) {
      setError('Días de validez debe ser un número entre 1 y 365.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Generate prescription number via RPC
    const { data: numData, error: rpcError } = await supabase.rpc('generate_prescription_number', {
      p_tenant_id: tenantId,
    });

    if (rpcError || typeof numData !== 'string' || !numData) {
      console.error('[PRESCRIPTION] RPC error', rpcError);
      setError('Error al generar número de receta. Intenta de nuevo.');
      setLoading(false);
      return;
    }

    const prescriptionNumber = numData;

    const validDiagnoses = diagnoses.filter((d) => d.cie10_code);

    const { data: inserted, error: insertError } = await supabase
      .from('prescriptions')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        doctor_id: doctorId,
        prescription_number: prescriptionNumber,
        issue_date: issueDate,
        validity_days: validityDaysNum,
        diagnoses: validDiagnoses,
        medications: validMeds,
        instructions: instructions.trim() || null,
        status: 'borrador',
      })
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/app/${slug}/prescriptions/${(inserted as { id: string }).id}`);
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const sectionClass       = 'bg-white rounded-xl border shadow-sm overflow-hidden';
  const sectionHeaderClass = 'px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]';
  const sectionTitleClass  = 'font-semibold text-white text-sm tracking-wide';
  const inputClass         = 'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';
  const labelClass         = 'text-sm font-medium text-gray-700';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ------------------------------------------------------------------ */}
      {/* Paciente                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>👤 Paciente</p>
        </div>
        <div className="p-6">
          <div className="space-y-1.5" ref={searchRef}>
            <Label htmlFor="patient_search" className={labelClass}>
              Buscar paciente<RequiredMark />
            </Label>
            <div className="relative">
              <Input
                id="patient_search"
                value={patientQuery}
                onChange={(e) => { setPatientQuery(e.target.value); setPatientId(''); }}
                onFocus={() => patientResults.length > 0 && setShowDropdown(true)}
                placeholder="Escriba nombre o cédula (mínimo 3 caracteres)..."
                autoComplete="off"
                className={inputClass}
              />
              {searchLoading && (
                <span className="absolute right-3 top-2.5 text-muted-foreground text-xs">Buscando…</span>
              )}
              {showDropdown && patientResults.length > 0 && (
                <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => selectPatient(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm transition-colors"
                      >
                        <span className="font-medium text-gray-900">{p.first_name} {p.last_name}</span>
                        {p.cedula && <span className="ml-2 text-xs text-muted-foreground">{p.cedula}</span>}
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
            {patientId && (
              <p className="text-xs text-green-600 font-medium mt-1">✓ Paciente seleccionado</p>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Datos generales                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>📋 Datos de la receta</p>
        </div>
        <div className="p-6 grid grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="issue_date" className={labelClass}>Fecha de emisión<RequiredMark /></Label>
            <Input
              id="issue_date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="validity_days" className={labelClass}>Validez (días)<RequiredMark /></Label>
            <select
              id="validity_days"
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
              className="flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors"
            >
              <option value="7">7 días</option>
              <option value="15">15 días</option>
              <option value="30">30 días</option>
              <option value="60">60 días</option>
              <option value="90">90 días</option>
            </select>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Diagnósticos                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>🔍 Diagnósticos CIE-10</p>
        </div>
        <div className="p-6 space-y-3">
          {diagnoses.map((d, i) => (
            <DiagnosisRow
              key={i}
              diag={d}
              onChange={(updated) => updateDiagnosis(i, updated)}
              onRemove={() => removeDiagnosis(i)}
              tenantId={tenantId}
            />
          ))}
          <button
            type="button"
            onClick={addDiagnosis}
            className="text-sm text-[#1E40AF] hover:text-[#1e3a8a] font-medium hover:underline"
          >
            + Agregar diagnóstico
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Medicamentos                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>💊 Medicamentos prescritos</p>
        </div>
        <div className="p-6 space-y-4">
          {medications.map((m, i) => (
            <MedicationCard
              key={i}
              med={m}
              index={i}
              onChange={(updated) => updateMedication(i, updated)}
              onRemove={() => removeMedication(i)}
            />
          ))}
          <button
            type="button"
            onClick={addMedication}
            className="text-sm text-[#1E40AF] hover:text-[#1e3a8a] font-medium hover:underline"
          >
            + Agregar medicamento
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Instrucciones generales                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>📝 Instrucciones al paciente</p>
        </div>
        <div className="p-6">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            placeholder="Reposo, dieta, cuidados especiales, cuándo regresar a control..."
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
          onClick={() => router.push(`/app/${slug}/prescriptions`)}
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
          ) : 'Crear receta'}
        </Button>
      </div>
    </form>
  );
}
