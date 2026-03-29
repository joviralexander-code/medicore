'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Loader2 } from 'lucide-react';
import { Cie10Autocomplete } from '@/components/shared/cie10-autocomplete';

type CertType = 'reposo' | 'salud' | 'atencion' | 'personalizado';

interface PatientOption {
  id: string;
  first_name: string;
  last_name: string;
  cedula: string | null;
}

interface Props {
  tenantId: string;
  doctorId: string;
  slug: string;
  prePatient: { id: string; first_name: string; last_name: string } | null;
}

const inputClass = 'h-10 border-gray-200 bg-gray-50 focus:bg-white text-sm';
const labelClass = 'text-sm font-medium text-gray-700';
const selectClass = 'flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function NewCertificatePage({ tenantId, doctorId, slug, prePatient }: Props) {
  const router = useRouter();
  const supabase = createClient();

  // ── Patient selector ──────────────────────────────────────────────────────
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(
    prePatient ? { ...prePatient, cedula: null } : null
  );
  const [patientQuery, setPatientQuery] = useState(
    prePatient ? `${prePatient.first_name} ${prePatient.last_name}` : ''
  );
  const [patientResults, setPatientResults] = useState<PatientOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Certificate form ──────────────────────────────────────────────────────
  const [certType, setCertType] = useState<CertType>('reposo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // reposo
  const today = new Date().toISOString().split('T')[0]!;
  const [days, setDays] = useState('1');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [diagnosisCode, setDiagnosisCode] = useState('');
  const [diagnosisDesc, setDiagnosisDesc] = useState('');
  const [resumenClinico, setResumenClinico] = useState('');
  const [actividadLaboral, setActividadLaboral] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [contingencia, setContingencia] = useState('ENFERMEDAD GENERAL');

  // salud
  const [purpose, setPurpose] = useState('trabajo');
  const [validUntilDate, setValidUntilDate] = useState('');

  // atencion
  const [procedimiento, setProcedimiento] = useState('');
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [ateDiagnosisCode, setAteDiagnosisCode] = useState('');
  const [ateDiagnosisDesc, setAteDiagnosisDesc] = useState('');
  const [treatment, setTreatment] = useState('');

  // shared
  const [observations, setObservations] = useState('');

  // personalizado
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');

  // ── Patient search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (patientQuery.length < 2 || selectedPatient) {
      setPatientResults([]);
      setShowDropdown(false);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const q = patientQuery.trim();
      const { data } = await supabase
        .from('patients')
        .select('id, first_name, last_name, cedula')
        .eq('tenant_id', tenantId)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,cedula.ilike.%${q}%`)
        .limit(8);
      setPatientResults((data as PatientOption[]) ?? []);
      setShowDropdown(true);
      setSearching(false);
    }, 280);
  }, [patientQuery, selectedPatient, supabase, tenantId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function selectPatient(p: PatientOption) {
    setSelectedPatient(p);
    setPatientQuery(`${p.first_name} ${p.last_name}`);
    setShowDropdown(false);
    setPatientResults([]);
  }

  function clearPatient() {
    setSelectedPatient(null);
    setPatientQuery('');
  }

  function handleFromDateChange(val: string) {
    setFromDate(val);
    if (val && days) {
      const d = new Date(val);
      d.setDate(d.getDate() + Number(days) - 1);
      setToDate(d.toISOString().split('T')[0]!);
    }
  }

  function handleDaysChange(val: string) {
    setDays(val);
    if (fromDate && val) {
      const d = new Date(fromDate);
      d.setDate(d.getDate() + Number(val) - 1);
      setToDate(d.toISOString().split('T')[0]!);
    }
  }

  // ── Build content ─────────────────────────────────────────────────────────
  function buildContent(): Record<string, unknown> {
    if (certType === 'reposo') {
      return {
        days: Number(days),
        from_date: fromDate,
        to_date: toDate,
        diagnosis_code: diagnosisCode,
        diagnosis: diagnosisDesc,
        resumen_clinico: resumenClinico,
        actividad_laboral: actividadLaboral,
        empresa,
        contingencia,
        observations,
      };
    }
    if (certType === 'salud') return { purpose, observations, valid_until_date: validUntilDate || null };
    if (certType === 'atencion') {
      return {
        procedimiento,
        hora_desde: horaDesde,
        hora_hasta: horaHasta,
        diagnosis_code: ateDiagnosisCode,
        diagnosis: ateDiagnosisDesc,
        treatment,
        observations,
      };
    }
    return { title: customTitle, body: customBody };
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) { setError('Seleccione un paciente.'); return; }
    setError(null);
    setLoading(true);

    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const certNumber = `CERT-${year}-${rand}`;

    const { data, error: insertError } = await supabase
      .from('medical_certificates')
      .insert({
        tenant_id: tenantId,
        patient_id: selectedPatient.id,
        doctor_id: doctorId,
        consultation_id: null,
        certificate_type: certType,
        certificate_number: certNumber,
        content: buildContent(),
      })
      .select('id')
      .single();

    if (insertError) {
      setError(
        typeof insertError === 'object' && 'message' in insertError
          ? String(insertError.message)
          : JSON.stringify(insertError)
      );
      setLoading(false);
      return;
    }

    // Redirect back to certificates list
    router.push(`/app/${slug}/certificates`);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Patient selector ─────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className={labelClass}>Paciente</Label>
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value);
                    if (selectedPatient) setSelectedPatient(null);
                  }}
                  placeholder="Buscar por nombre o cédula..."
                  className="h-10 w-full rounded-md border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:bg-white"
                />
                {searching && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>

              {showDropdown && patientResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow-lg overflow-hidden">
                  {patientResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPatient(p)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-bold text-xs">
                          {p.first_name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {p.first_name} {p.last_name}
                        </p>
                        {p.cedula && (
                          <p className="text-xs text-muted-foreground">{p.cedula}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && !searching && patientResults.length === 0 && patientQuery.length >= 2 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow-lg px-4 py-3">
                  <p className="text-sm text-muted-foreground">No se encontraron pacientes.</p>
                </div>
              )}
            </div>

            {selectedPatient && (
              <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <span className="text-sm font-medium text-green-800">
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </span>
                <button
                  type="button"
                  onClick={clearPatient}
                  className="text-xs text-green-600 hover:text-green-800 underline"
                >
                  Cambiar
                </button>
              </div>
            )}
          </div>

          {/* ── Tipo ─────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className={labelClass}>Tipo de certificado</Label>
            <select value={certType} onChange={(e) => setCertType(e.target.value as CertType)} className={selectClass}>
              <option value="reposo">Reposo médico / Incapacidad</option>
              <option value="salud">Certificado de salud / Aptitud</option>
              <option value="atencion">Constancia de atención médica</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>

          {/* ── REPOSO ───────────────────────────────────────────────── */}
          {certType === 'reposo' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelClass}>Días de reposo</Label>
                  <Input type="number" min={1} max={365} value={days}
                    onChange={(e) => handleDaysChange(e.target.value)} className={inputClass} required />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelClass}>Desde</Label>
                  <Input type="date" value={fromDate}
                    onChange={(e) => handleFromDateChange(e.target.value)} className={inputClass} required />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelClass}>Hasta</Label>
                  <Input type="date" value={toDate}
                    onChange={(e) => setToDate(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Diagnóstico CIE-10 <span className="text-red-400">*</span></Label>
                <Cie10Autocomplete
                  value={diagnosisCode ? `${diagnosisCode} - ${diagnosisDesc}` : diagnosisDesc}
                  onChange={(code, desc) => { setDiagnosisCode(code); setDiagnosisDesc(desc); }}
                  inputClass={`${inputClass} w-full`}
                  placeholder="Buscar por código (J06) o descripción..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Resumen clínico (síntomas)</Label>
                <Input value={resumenClinico} onChange={(e) => setResumenClinico(e.target.value)}
                  placeholder="Ej: TOS, ALZA TÉRMICA, MALESTAR GENERAL" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelClass}>Actividad laboral</Label>
                  <Input value={actividadLaboral} onChange={(e) => setActividadLaboral(e.target.value)}
                    placeholder="Ej: Docente, Contador..." className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelClass}>Institución / Empresa</Label>
                  <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)}
                    placeholder="Nombre de la empresa" className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Tipo de contingencia</Label>
                <select value={contingencia} onChange={(e) => setContingencia(e.target.value)} className={selectClass}>
                  <option value="ENFERMEDAD GENERAL">Enfermedad general</option>
                  <option value="ACCIDENTE DE TRABAJO">Accidente de trabajo</option>
                  <option value="MATERNIDAD">Maternidad</option>
                  <option value="ACCIDENTE DE TRÁNSITO">Accidente de tránsito</option>
                </select>
              </div>
            </>
          )}

          {/* ── SALUD ────────────────────────────────────────────────── */}
          {certType === 'salud' && (
            <>
              <div className="space-y-1.5">
                <Label className={labelClass}>Apto/a para</Label>
                <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={selectClass}>
                  <option value="trabajo">Trabajo</option>
                  <option value="deporte">Práctica deportiva</option>
                  <option value="escuela">Actividades escolares</option>
                  <option value="viaje">Viaje</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Válido hasta (opcional)</Label>
                <Input type="date" value={validUntilDate}
                  onChange={(e) => setValidUntilDate(e.target.value)} className={inputClass} />
              </div>
            </>
          )}

          {/* ── ATENCIÓN ─────────────────────────────────────────────── */}
          {certType === 'atencion' && (
            <>
              <div className="space-y-1.5">
                <Label className={labelClass}>Procedimiento / Motivo de atención <span className="text-red-400">*</span></Label>
                <Input value={procedimiento} onChange={(e) => setProcedimiento(e.target.value)}
                  placeholder="Ej: CONSULTA MÉDICA GENERAL, EXAMEN ECOGRÁFICO..." className={inputClass} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelClass}>Hora de inicio</Label>
                  <Input type="time" value={horaDesde} onChange={(e) => setHoraDesde(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelClass}>Hora de fin</Label>
                  <Input type="time" value={horaHasta} onChange={(e) => setHoraHasta(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Diagnóstico CIE-10 (opcional)</Label>
                <Cie10Autocomplete
                  value={ateDiagnosisCode ? `${ateDiagnosisCode} - ${ateDiagnosisDesc}` : ateDiagnosisDesc}
                  onChange={(code, desc) => { setAteDiagnosisCode(code); setAteDiagnosisDesc(desc); }}
                  inputClass={`${inputClass} w-full`}
                  placeholder="Buscar por código (J06) o descripción..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Tratamiento indicado (opcional)</Label>
                <Input value={treatment} onChange={(e) => setTreatment(e.target.value)}
                  placeholder="Medicación, indicaciones, etc." className={inputClass} />
              </div>
            </>
          )}

          {/* ── PERSONALIZADO ────────────────────────────────────────── */}
          {certType === 'personalizado' && (
            <>
              <div className="space-y-1.5">
                <Label className={labelClass}>Título del certificado</Label>
                <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Ej: Certificado de aptitud física" className={inputClass} required />
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Contenido</Label>
                <textarea
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  rows={6}
                  placeholder="Redacte el contenido del certificado..."
                  className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  required
                />
              </div>
            </>
          )}

          {/* Observaciones */}
          {certType !== 'personalizado' && (
            <div className="space-y-1.5">
              <Label className={labelClass}>Observaciones (opcional)</Label>
              <Input value={observations} onChange={(e) => setObservations(e.target.value)}
                placeholder="Indicaciones adicionales..." className={inputClass} />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-1.5">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Generando...' : 'Generar certificado'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
