'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsultationFormProps {
  slug: string;
  tenantId: string;
  preselectedPatientId?: string;
  preselectedPatientName?: string;
}

interface PatientSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  cedula: string | null;
}

interface Diagnosis {
  cie10_code: string;
  description: string;
  type: 'definitivo' | 'presuntivo';
}

interface Cie10Result {
  code: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Sub-component: Cie10Autocomplete
// ---------------------------------------------------------------------------

interface Cie10AutocompleteProps {
  value: Diagnosis;
  onChange: (d: Diagnosis) => void;
  onRemove: () => void;
  canRemove: boolean;
  inputClass: string;
  selectClass: string;
}

function Cie10Autocomplete({ value, onChange, onRemove, canRemove, inputClass, selectClass }: Cie10AutocompleteProps) {
  const supabase = createClient();
  const [query, setQuery] = useState(
    value.cie10_code ? `${value.cie10_code} - ${value.description}` : ''
  );
  const [results, setResults] = useState<Cie10Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleInput(q: string) {
    setQuery(q);
    // Clear selection if user edits
    if (value.cie10_code) {
      onChange({ ...value, cie10_code: '', description: q });
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const term = q.trim().toUpperCase();
      const { data } = await supabase
        .from('cie10_codes')
        .select('code, description')
        .or(`code.ilike.${term}%,description.ilike.%${q.trim()}%`)
        .order('code')
        .limit(10);
      setResults(data ?? []);
      setOpen(true);
      setLoading(false);
    }, 300);
  }

  function select(r: Cie10Result) {
    onChange({ ...value, cie10_code: r.code, description: r.description });
    setQuery(`${r.code} - ${r.description}`);
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="grid grid-cols-12 gap-2 items-center p-3 rounded-lg border border-gray-100 bg-gray-50/50">
      {/* Search input */}
      <div className="col-span-8 relative" ref={containerRef}>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Buscar por código (J06) o descripción..."
          className={`${inputClass} w-full font-normal`}
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">...</span>
        )}
        {open && results.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.code}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); select(r); }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex gap-2 items-baseline"
              >
                <span className="font-mono font-bold text-primary shrink-0">{r.code}</span>
                <span className="text-gray-700 truncate">{r.description}</span>
              </button>
            ))}
          </div>
        )}
        {open && !loading && results.length === 0 && query.length >= 2 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-muted-foreground">
            Sin resultados para &quot;{query}&quot;
          </div>
        )}
      </div>
      {/* Type */}
      <div className="col-span-3">
        <select
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value as Diagnosis['type'] })}
          className={selectClass}
        >
          <option value="presuntivo">Presuntivo</option>
          <option value="definitivo">Definitivo</option>
        </select>
      </div>
      {/* Remove */}
      <div className="col-span-1 flex justify-center">
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Eliminar diagnóstico"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowLocalDatetime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

function parseNum(value: string): number | null {
  if (value.trim() === '') return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

function parseIntVal(value: string): number | null {
  if (value.trim() === '') return null;
  const n = globalThis.parseInt(value, 10);
  return isNaN(n) ? null : n;
}

function calcBmi(weightStr: string, heightStr: string): string {
  const weight = parseNum(weightStr);
  const height = parseNum(heightStr);
  if (!weight || !height || height <= 0) return '';
  const heightM = height / 100;
  return (weight / (heightM * heightM)).toFixed(1);
}

// ---------------------------------------------------------------------------
// Style constants (consistent with rest of app)
// ---------------------------------------------------------------------------

const sectionClass = 'bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden';
const sectionHeaderClass =
  'px-6 py-4 bg-gradient-to-r from-blue-50 to-teal-50 border-b border-gray-100 flex items-center space-x-2';
const sectionTitleClass = 'font-semibold text-gray-800 text-sm tracking-wide';
const sectionBodyClass = 'p-6';
const fieldClass = 'space-y-1.5';
const labelClass = 'text-sm font-medium text-gray-700';
const inputClass =
  'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';
const selectClass =
  'flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors';
const textareaClass =
  'w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors resize-none placeholder:text-muted-foreground';

function RequiredMark() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConsultationForm({
  slug,
  tenantId,
  preselectedPatientId,
  preselectedPatientName,
}: ConsultationFormProps) {
  const router = useRouter();
  const supabase = createClient();

  // --- Patient selection ---
  const [patientId, setPatientId] = useState<string>(preselectedPatientId ?? '');
  const [patientDisplayName, setPatientDisplayName] = useState<string>(
    preselectedPatientName ?? ''
  );
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // --- Consultation basics ---
  const [consultationDate, setConsultationDate] = useState(nowLocalDatetime());
  const [consultationType, setConsultationType] = useState('primera_vez');

  // --- Vitals ---
  const [bpSystolic, setBpSystolic] = useState('');
  const [bpDiastolic, setBpDiastolic] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [temperature, setTemperature] = useState('');
  const [o2Sat, setO2Sat] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');

  // --- Clinical text ---
  const [reason, setReason] = useState('');
  const [currentIllness, setCurrentIllness] = useState('');

  // --- Diagnoses ---
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([
    { cie10_code: '', description: '', type: 'presuntivo' },
  ]);

  // --- Treatment ---
  const [treatmentPlan, setTreatmentPlan] = useState('');

  // --- UI state ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Patient search
  // ---------------------------------------------------------------------------

  const searchPatients = useCallback(
    async (query: string) => {
      if (query.trim().length < 3) {
        setPatientResults([]);
        setShowDropdown(false);
        return;
      }
      setSearchLoading(true);
      // Crear client aquí para evitar stale closure + escapar filtro ilike
      const client = createClient();
      const safe = query.trim().replace(/[%_,]/g, '\\$&');
      const { data } = await client
        .from('patients')
        .select('id, first_name, last_name, cedula')
        .eq('tenant_id', tenantId)
        .or(
          `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,cedula.ilike.%${safe}%`
        )
        .limit(8);
      setPatientResults(data ?? []);
      setShowDropdown(true);
      setSearchLoading(false);
    },
    [tenantId]
  );

  useEffect(() => {
    if (preselectedPatientId) return; // no search needed when preselected
    const timer = setTimeout(() => {
      searchPatients(patientSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearchQuery, searchPatients, preselectedPatientId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  function selectPatient(p: PatientSearchResult) {
    setPatientId(p.id);
    setPatientDisplayName(`${p.first_name} ${p.last_name}`);
    setPatientSearchQuery('');
    setShowDropdown(false);
    setPatientResults([]);
  }

  function clearPatient() {
    setPatientId('');
    setPatientDisplayName('');
    setPatientSearchQuery('');
  }

  // ---------------------------------------------------------------------------
  // Diagnoses helpers
  // ---------------------------------------------------------------------------

  function addDiagnosis() {
    setDiagnoses((prev) => [
      ...prev,
      { cie10_code: '', description: '', type: 'presuntivo' },
    ]);
  }

  function removeDiagnosis(index: number) {
    setDiagnoses((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDiagnosis(index: number, field: keyof Diagnosis, value: string) {
    setDiagnoses((prev) =>
      prev.map((d, i) =>
        i === index ? { ...d, [field]: value } : d
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!patientId) {
      setError('Debe seleccionar un paciente antes de guardar la consulta.');
      return;
    }
    if (!reason.trim()) {
      setError('El motivo de consulta es obligatorio.');
      return;
    }

    setLoading(true);

    // Get current user id for doctor_id (required NOT NULL)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('No autenticado.'); setLoading(false); return; }

    const filteredDiagnoses = diagnoses.filter(
      (d) => d.cie10_code.trim() || d.description.trim()
    );

    try {
      const { data: _insertedData, error: insertError } = await supabase
        .from('consultations')
        .insert({
          tenant_id: tenantId,
          patient_id: patientId,
          doctor_id: user.id,
          consultation_date: consultationDate,
          consultation_type: consultationType,
          reason: reason.trim(),
          current_illness: currentIllness.trim() || null,
          // Vitals as individual columns
          weight_kg: parseNum(weightKg),
          height_cm: parseNum(heightCm),
          bp_systolic: parseIntVal(bpSystolic),
          bp_diastolic: parseIntVal(bpDiastolic),
          heart_rate: parseIntVal(heartRate),
          temp_celsius: parseNum(temperature),
          o2_saturation: parseNum(o2Sat),
          diagnoses: filteredDiagnoses,
          treatment_plan: treatmentPlan.trim() || null,
          is_signed: false,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      if (patientId) {
        router.push(`/app/${slug}/patients/${patientId}`);
      } else {
        router.push(`/app/${slug}/clinical`);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);
      setError(message);
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // BMI computed display
  // ---------------------------------------------------------------------------

  const bmi = calcBmi(weightKg, heightCm);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* -------------------------------------------------------------------- */}
      {/* Section 1 — Paciente y fecha                                          */}
      {/* -------------------------------------------------------------------- */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <svg
            className="w-4 h-4 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <p className={sectionTitleClass}>Paciente y fecha</p>
        </div>
        <div className={`${sectionBodyClass} grid grid-cols-1 gap-5 sm:grid-cols-2`}>

          {/* Patient search / display */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label className={labelClass}>
              Paciente<RequiredMark />
            </Label>

            {patientId ? (
              // Patient already selected — show name with clear button
              <div className="flex items-center gap-3 h-10 px-3 rounded-md border border-gray-200 bg-gray-50">
                <svg
                  className="w-4 h-4 text-teal-600 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm font-medium text-gray-800 flex-1">
                  {patientDisplayName}
                </span>
                {!preselectedPatientId && (
                  <button
                    type="button"
                    onClick={clearPatient}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    Cambiar
                  </button>
                )}
              </div>
            ) : (
              // Search input with dropdown
              <div ref={dropdownRef} className="relative">
                <Input
                  type="text"
                  value={patientSearchQuery}
                  onChange={(e) => setPatientSearchQuery(e.target.value)}
                  placeholder="Buscar paciente por nombre o cédula (mín. 3 caracteres)..."
                  className={inputClass}
                  autoComplete="off"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="animate-spin text-gray-400 text-sm">⟳</span>
                  </div>
                )}
                {showDropdown && patientResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                    {patientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => selectPatient(p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                      >
                        <span className="font-medium text-gray-800">
                          {p.first_name} {p.last_name}
                        </span>
                        {p.cedula && (
                          <span className="text-xs text-gray-400 shrink-0">
                            CI: {p.cedula}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown &&
                  !searchLoading &&
                  patientResults.length === 0 &&
                  patientSearchQuery.trim().length >= 3 && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg px-4 py-3 text-sm text-muted-foreground">
                      No se encontraron pacientes con ese criterio.
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Date */}
          <div className={fieldClass}>
            <Label htmlFor="consultation_date" className={labelClass}>
              Fecha y hora de consulta<RequiredMark />
            </Label>
            <Input
              id="consultation_date"
              type="datetime-local"
              value={consultationDate}
              onChange={(e) => setConsultationDate(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          {/* Type */}
          <div className={fieldClass}>
            <Label htmlFor="consultation_type" className={labelClass}>
              Tipo de consulta<RequiredMark />
            </Label>
            <select
              id="consultation_type"
              value={consultationType}
              onChange={(e) => setConsultationType(e.target.value)}
              className={selectClass}
            >
              <option value="primera_vez">Primera vez</option>
              <option value="control">Control / Seguimiento</option>
              <option value="emergencia">Emergencia</option>
              <option value="procedimiento">Procedimiento</option>
            </select>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Section 2 — Signos Vitales                                            */}
      {/* -------------------------------------------------------------------- */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <svg
            className="w-4 h-4 text-teal-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <p className={sectionTitleClass}>Signos Vitales</p>
          <span className="text-xs text-gray-400 font-normal">(todos opcionales)</span>
        </div>
        <div className={`${sectionBodyClass} grid grid-cols-2 gap-4 sm:grid-cols-4`}>

          {/* BP Systolic */}
          <div className={fieldClass}>
            <Label htmlFor="bp_systolic" className={labelClass}>
              PA sistólica
            </Label>
            <div className="relative">
              <Input
                id="bp_systolic"
                type="number"
                min={0}
                value={bpSystolic}
                onChange={(e) => setBpSystolic(e.target.value)}
                placeholder="120"
                className={`${inputClass} pr-12`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                mmHg
              </span>
            </div>
          </div>

          {/* BP Diastolic */}
          <div className={fieldClass}>
            <Label htmlFor="bp_diastolic" className={labelClass}>
              PA diastólica
            </Label>
            <div className="relative">
              <Input
                id="bp_diastolic"
                type="number"
                min={0}
                value={bpDiastolic}
                onChange={(e) => setBpDiastolic(e.target.value)}
                placeholder="80"
                className={`${inputClass} pr-12`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                mmHg
              </span>
            </div>
          </div>

          {/* Heart rate */}
          <div className={fieldClass}>
            <Label htmlFor="heart_rate" className={labelClass}>
              Frec. cardíaca
            </Label>
            <div className="relative">
              <Input
                id="heart_rate"
                type="number"
                min={0}
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
                placeholder="72"
                className={`${inputClass} pr-10`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                lpm
              </span>
            </div>
          </div>

          {/* Temperature */}
          <div className={fieldClass}>
            <Label htmlFor="temperature" className={labelClass}>
              Temperatura
            </Label>
            <div className="relative">
              <Input
                id="temperature"
                type="number"
                min={0}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="36.5"
                className={`${inputClass} pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                °C
              </span>
            </div>
          </div>

          {/* O2 saturation */}
          <div className={fieldClass}>
            <Label htmlFor="o2_sat" className={labelClass}>
              Saturación O₂
            </Label>
            <div className="relative">
              <Input
                id="o2_sat"
                type="number"
                min={0}
                max={100}
                value={o2Sat}
                onChange={(e) => setO2Sat(e.target.value)}
                placeholder="98"
                className={`${inputClass} pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                %
              </span>
            </div>
          </div>

          {/* Weight */}
          <div className={fieldClass}>
            <Label htmlFor="weight_kg" className={labelClass}>
              Peso
            </Label>
            <div className="relative">
              <Input
                id="weight_kg"
                type="number"
                min={0}
                step={0.1}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="70"
                className={`${inputClass} pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                kg
              </span>
            </div>
          </div>

          {/* Height */}
          <div className={fieldClass}>
            <Label htmlFor="height_cm" className={labelClass}>
              Talla
            </Label>
            <div className="relative">
              <Input
                id="height_cm"
                type="number"
                min={0}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="170"
                className={`${inputClass} pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                cm
              </span>
            </div>
          </div>

          {/* BMI — read only */}
          <div className={fieldClass}>
            <Label className={labelClass}>IMC (calculado)</Label>
            <div
              className={`flex h-10 items-center px-3 rounded-md border border-gray-200 text-sm ${
                bmi
                  ? 'bg-teal-50 text-teal-800 font-semibold border-teal-200'
                  : 'bg-gray-50 text-gray-400'
              }`}
            >
              {bmi ? `${bmi} kg/m²` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Section 3 — Motivo de consulta                                        */}
      {/* -------------------------------------------------------------------- */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <svg
            className="w-4 h-4 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className={sectionTitleClass}>Motivo de consulta</p>
        </div>
        <div className={`${sectionBodyClass} space-y-5`}>
          <div className={fieldClass}>
            <Label htmlFor="reason" className={labelClass}>
              Motivo de consulta<RequiredMark />
            </Label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              placeholder="Describa el motivo principal por el que el paciente acude a consulta..."
              className={textareaClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="current_illness" className={labelClass}>
              Enfermedad actual
              <span className="ml-2 text-xs font-normal text-gray-400">
                (historia de la enfermedad presente)
              </span>
            </Label>
            <textarea
              id="current_illness"
              value={currentIllness}
              onChange={(e) => setCurrentIllness(e.target.value)}
              rows={6}
              placeholder="Describa la cronología de los síntomas, factores desencadenantes, evolución, tratamientos previos recibidos..."
              className={textareaClass}
            />
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Section 4 — Diagnósticos                                              */}
      {/* -------------------------------------------------------------------- */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <svg
            className="w-4 h-4 text-teal-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          <p className={sectionTitleClass}>Diagnósticos CIE-10</p>
          <span className="text-xs text-gray-400 font-normal">(opcional)</span>
        </div>
        <div className={sectionBodyClass}>
          <div className="space-y-3">
            {diagnoses.map((diag, index) => (
              <Cie10Autocomplete
                key={index}
                value={diag}
                onChange={(d) => setDiagnoses((prev) => prev.map((x, i) => i === index ? d : x))}
                onRemove={() => removeDiagnosis(index)}
                canRemove={diagnoses.length > 1}
                inputClass={inputClass}
                selectClass={selectClass}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addDiagnosis}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#1E40AF] hover:text-[#1e3a8a] font-medium transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            Agregar diagnóstico
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Section 5 — Plan de tratamiento                                       */}
      {/* -------------------------------------------------------------------- */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <svg
            className="w-4 h-4 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
          <p className={sectionTitleClass}>Plan de tratamiento</p>
          <span className="text-xs text-gray-400 font-normal">(opcional)</span>
        </div>
        <div className={sectionBodyClass}>
          <textarea
            id="treatment_plan"
            value={treatmentPlan}
            onChange={(e) => setTreatmentPlan(e.target.value)}
            rows={6}
            placeholder="Detalle el plan terapéutico: medicamentos, dosis, indicaciones, controles, derivaciones, exámenes solicitados..."
            className={textareaClass}
          />
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Error + Submit                                                         */}
      {/* -------------------------------------------------------------------- */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 pb-8">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(
              patientId
                ? `/app/${slug}/patients/${patientId}`
                : `/app/${slug}/clinical`
            )
          }
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="h-11 bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold px-8"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span>
              Guardando consulta...
            </span>
          ) : (
            'Guardar consulta'
          )}
        </Button>
      </div>
    </form>
  );
}
