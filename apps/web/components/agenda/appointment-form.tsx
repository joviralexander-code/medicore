'use client';

import { useState, useRef, useEffect, type ChangeEvent } from 'react';
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
  phone: string | null;
}

export interface AppointmentFormProps {
  slug: string;
  tenantId: string;
  preselectedPatientId?: string;
  preselectedPatientName?: string;
  preselectedDate?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().split('T')[0]!;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppointmentForm({
  slug,
  tenantId,
  preselectedPatientId,
  preselectedPatientName,
  preselectedDate,
}: AppointmentFormProps) {
  const router = useRouter();

  // --- Patient search ---
  const [patientQuery, setPatientQuery]       = useState(preselectedPatientName ?? '');
  const [patientId, setPatientId]             = useState(preselectedPatientId ?? '');
  const [patientResults, setPatientResults]   = useState<PatientSearchResult[]>([]);
  const [searchLoading, setSearchLoading]     = useState(false);
  const [showDropdown, setShowDropdown]       = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // --- Form fields ---
  const [appointmentDate, setAppointmentDate] = useState(preselectedDate ?? todayISO());
  const [startTime, setStartTime]             = useState('');
  const [endTime, setEndTime]                 = useState('');
  const [consultationType, setConsultationType] = useState('primera_vez');
  const [status, setStatus]                   = useState('pendiente');
  const [notes, setNotes]                     = useState('');

  // --- UI state ---
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

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

  // Patient search — trigger when >= 3 chars and no patient selected yet
  useEffect(() => {
    if (patientId) return; // already selected
    if (patientQuery.length < 3) {
      setPatientResults([]);
      setShowDropdown(false);
      return;
    }

    const controller = new AbortController();

    async function search() {
      setSearchLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('patients')
        .select('id, first_name, last_name, cedula, phone')
        .eq('tenant_id', tenantId)
        .or(`first_name.ilike.%${patientQuery}%,last_name.ilike.%${patientQuery}%,cedula.ilike.%${patientQuery}%`)
        .limit(8);
      if (!controller.signal.aborted) {
        setPatientResults((data as PatientSearchResult[]) ?? []);
        setShowDropdown(true);
        setSearchLoading(false);
      }
    }

    const timer = setTimeout(() => { void search(); }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [patientQuery, patientId, tenantId]);

  function handlePatientQueryChange(e: ChangeEvent<HTMLInputElement>) {
    setPatientQuery(e.target.value);
    setPatientId(''); // clear selection when typing
  }

  function selectPatient(p: PatientSearchResult) {
    setPatientId(p.id);
    setPatientQuery(`${p.first_name} ${p.last_name}`);
    setPatientResults([]);
    setShowDropdown(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!patientId) {
      setError('Debe seleccionar un paciente de la lista.');
      return;
    }
    if (!startTime || !endTime) {
      setError('Los horarios de inicio y fin son obligatorios.');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from('appointments')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        appointment_date: appointmentDate,
        start_time: startTime,
        end_time: endTime,
        consultation_type: consultationType,
        status,
        notes: notes || null,
        source: 'manual',
      })
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/app/${slug}/agenda?date=${appointmentDate}`);
  }

  // ---------------------------------------------------------------------------
  // Styles (consistent with rest of app)
  // ---------------------------------------------------------------------------

  const sectionClass       = 'bg-white rounded-xl border shadow-sm overflow-hidden';
  const sectionHeaderClass = 'px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]';
  const sectionTitleClass  = 'font-semibold text-white text-sm tracking-wide';
  const sectionBodyClass   = 'p-6 grid grid-cols-1 gap-5 sm:grid-cols-2';
  const fieldClass         = 'space-y-1.5';
  const labelClass         = 'text-sm font-medium text-gray-700';
  const inputClass         = 'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';
  const selectClass        = 'flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors';

  function RequiredMark() {
    return <span className="text-red-500 ml-0.5">*</span>;
  }

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
          <div className={fieldClass} ref={searchRef}>
            <Label htmlFor="patient_search" className={labelClass}>
              Buscar paciente<RequiredMark />
            </Label>
            <div className="relative">
              <Input
                id="patient_search"
                value={patientQuery}
                onChange={handlePatientQueryChange}
                onFocus={() => patientResults.length > 0 && setShowDropdown(true)}
                placeholder="Escriba nombre o cédula (mínimo 3 caracteres)..."
                autoComplete="off"
                className={inputClass}
              />
              {searchLoading && (
                <span className="absolute right-3 top-2.5 text-muted-foreground text-xs">
                  Buscando…
                </span>
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
                        <span className="font-medium text-gray-900">
                          {p.first_name} {p.last_name}
                        </span>
                        {p.cedula && (
                          <span className="ml-2 text-xs text-muted-foreground">{p.cedula}</span>
                        )}
                        {p.phone && (
                          <span className="ml-2 text-xs text-muted-foreground">{p.phone}</span>
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
            {patientId && (
              <p className="text-xs text-green-600 font-medium mt-1">
                ✓ Paciente seleccionado
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Fecha y hora                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>📅 Fecha y hora</p>
        </div>
        <div className={sectionBodyClass}>
          <div className={fieldClass}>
            <Label htmlFor="appointment_date" className={labelClass}>
              Fecha<RequiredMark />
            </Label>
            <Input
              id="appointment_date"
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          <div className="hidden sm:block" /> {/* spacer */}

          <div className={fieldClass}>
            <Label htmlFor="start_time" className={labelClass}>
              Hora inicio<RequiredMark />
            </Label>
            <Input
              id="start_time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="end_time" className={labelClass}>
              Hora fin<RequiredMark />
            </Label>
            <Input
              id="end_time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tipo y estado                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>🩺 Tipo de consulta</p>
        </div>
        <div className={sectionBodyClass}>
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
              <option value="control">Control</option>
              <option value="emergencia">Emergencia</option>
              <option value="procedimiento">Procedimiento</option>
            </select>
          </div>

          <div className={fieldClass}>
            <Label htmlFor="status" className={labelClass}>Estado</Label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
            >
              <option value="pendiente">Pendiente</option>
              <option value="confirmada">Confirmada</option>
            </select>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="notes" className={labelClass}>Notas (opcional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Observaciones o indicaciones previas a la cita..."
              className="flex w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors placeholder:text-muted-foreground resize-none"
            />
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
          onClick={() => router.push(`/app/${slug}/agenda${appointmentDate ? `?date=${appointmentDate}` : ''}`)}
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
          ) : 'Crear cita'}
        </Button>
      </div>
    </form>
  );
}
