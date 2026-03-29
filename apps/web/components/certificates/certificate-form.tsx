'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { Cie10Autocomplete } from '@/components/shared/cie10-autocomplete';

type CertType = 'reposo' | 'salud' | 'atencion' | 'personalizado';

interface Props {
  tenantId: string;
  patientId: string;
  patientName: string;
  consultationId?: string;
  doctorId: string;
  onSuccess: (id: string) => void;
  onCancel: () => void;
}

export function CertificateForm({
  tenantId, patientId, patientName, consultationId, doctorId, onSuccess, onCancel,
}: Props) {
  const supabase = createClient();

  const [certType, setCertType] = useState<CertType>('reposo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── reposo ────────────────────────────────────────────────────────────────
  const [days, setDays] = useState('1');
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]!);
  const [toDate, setToDate] = useState('');
  const [diagnosisCode, setDiagnosisCode] = useState('');
  const [diagnosisDesc, setDiagnosisDesc] = useState('');
  const [resumenClinico, setResumenClinico] = useState('');
  const [actividadLaboral, setActividadLaboral] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [contingencia, setContingencia] = useState('ENFERMEDAD GENERAL');

  // ── salud ─────────────────────────────────────────────────────────────────
  const [purpose, setPurpose] = useState('trabajo');
  const [validUntilDate, setValidUntilDate] = useState('');

  // ── atención ──────────────────────────────────────────────────────────────
  const [procedimiento, setProcedimiento] = useState('');
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [ateDiagnosisCode, setAteDiagnosisCode] = useState('');
  const [ateDiagnosisDesc, setAteDiagnosisDesc] = useState('');
  const [treatment, setTreatment] = useState('');

  // ── shared ────────────────────────────────────────────────────────────────
  const [observations, setObservations] = useState('');

  // ── personalizado ─────────────────────────────────────────────────────────
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');

  const inputClass = 'h-10 border-gray-200 bg-gray-50 focus:bg-white text-sm';
  const labelClass = 'text-sm font-medium text-gray-700';
  const selectClass = 'flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

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
    if (certType === 'salud') {
      return { purpose, observations, valid_until_date: validUntilDate || null };
    }
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('No autenticado'); setLoading(false); return; }

    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const certNumber = `CERT-${year}-${rand}`;

    const { data, error: insertError } = await supabase
      .from('medical_certificates')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        doctor_id: doctorId,
        consultation_id: consultationId ?? null,
        certificate_type: certType,
        certificate_number: certNumber,
        content: buildContent(),
      })
      .select('id')
      .single();

    if (insertError) {
      setError(typeof insertError === 'object' && 'message' in insertError
        ? String(insertError.message) : JSON.stringify(insertError));
      setLoading(false);
      return;
    }

    onSuccess(data.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-lg">Nuevo certificado médico</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-gray-900">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Paciente */}
          <div className="text-sm text-muted-foreground bg-gray-50 rounded-lg px-4 py-2">
            Paciente: <span className="font-semibold text-gray-900">{patientName}</span>
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label className={labelClass}>Tipo de certificado</Label>
            <select value={certType} onChange={(e) => setCertType(e.target.value as CertType)} className={selectClass}>
              <option value="reposo">Reposo médico / Incapacidad</option>
              <option value="salud">Certificado de salud / Aptitud</option>
              <option value="atencion">Constancia de atención / Asistencia</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>

          {/* ── REPOSO ──────────────────────────────────────────────────────── */}
          {certType === 'reposo' && (
            <>
              {/* Fechas y días */}
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

              {/* Diagnóstico CIE-10 */}
              <div className="space-y-1.5">
                <Label className={labelClass}>Diagnóstico CIE-10 <span className="text-red-400">*</span></Label>
                <Cie10Autocomplete
                  value={diagnosisCode ? `${diagnosisCode} - ${diagnosisDesc}` : diagnosisDesc}
                  onChange={(code, desc) => { setDiagnosisCode(code); setDiagnosisDesc(desc); }}
                  inputClass={`${inputClass} w-full`}
                  placeholder="Buscar por código (J06) o descripción..."
                />
              </div>

              {/* Resumen clínico */}
              <div className="space-y-1.5">
                <Label className={labelClass}>Resumen clínico (síntomas)</Label>
                <Input value={resumenClinico} onChange={(e) => setResumenClinico(e.target.value)}
                  placeholder="Ej: TOS, ALZA TÉRMICA, MALESTAR GENERAL" className={inputClass} />
              </div>

              {/* Actividad laboral y empresa */}
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

              {/* Tipo de contingencia */}
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

          {/* ── SALUD ───────────────────────────────────────────────────────── */}
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

          {/* ── ATENCIÓN ────────────────────────────────────────────────────── */}
          {certType === 'atencion' && (
            <>
              {/* Procedimiento */}
              <div className="space-y-1.5">
                <Label className={labelClass}>Procedimiento / Motivo de atención <span className="text-red-400">*</span></Label>
                <Input value={procedimiento} onChange={(e) => setProcedimiento(e.target.value)}
                  placeholder="Ej: CONSULTA MÉDICA GENERAL, EXAMEN ECOGRÁFICO..." className={inputClass} required />
              </div>

              {/* Horario */}
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

              {/* Diagnóstico CIE-10 (opcional) */}
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

          {/* ── PERSONALIZADO ───────────────────────────────────────────────── */}
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
              <Label className={labelClass}>Observaciones adicionales (opcional)</Label>
              <Input value={observations} onChange={(e) => setObservations(e.target.value)}
                placeholder="Indicaciones adicionales..." className={inputClass} />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Generando...' : 'Generar certificado'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
