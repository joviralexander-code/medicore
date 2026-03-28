'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  slug: string;
  tenantId: string;
}

const CONSULT_TYPES = [
  { value: 'primera_vez', label: 'Primera consulta' },
  { value: 'control',     label: 'Control / seguimiento' },
  { value: 'emergencia',  label: 'Urgencia' },
];

function RequiredMark() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

export function PortalBookingForm({ slug: _slug, tenantId }: Props) {
  const [firstName, setFirstName]       = useState('');
  const [lastName, setLastName]         = useState('');
  const [cedula, setCedula]             = useState('');
  const [phone, setPhone]               = useState('');
  const [email, setEmail]               = useState('');
  const [consultType, setConsultType]   = useState('primera_vez');
  const [preferredDate, setPreferredDate] = useState('');
  const [notes, setNotes]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [success, setSuccess]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const inputClass = 'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';
  const labelClass = 'text-sm font-medium text-gray-700';
  const selectClass = 'flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors';

  const today = new Date().toISOString().split('T')[0]!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError('Nombre, apellido y teléfono son obligatorios.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Find or create patient by cedula or phone
    let patientId: string | null = null;

    if (cedula.trim()) {
      const { data: existing } = await supabase
        .from('patients')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('cedula', cedula.trim())
        .maybeSingle();
      if (existing) patientId = existing.id;
    }

    if (!patientId) {
      // Try by phone
      const { data: byPhone } = await supabase
        .from('patients')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone', phone.trim())
        .maybeSingle();
      if (byPhone) patientId = byPhone.id;
    }

    if (!patientId) {
      // Create new patient record
      const { data: newPatient, error: patientError } = await supabase
        .from('patients')
        .insert({
          tenant_id: tenantId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          cedula: cedula.trim() || null,
          phone: phone.trim(),
          email: email.trim() || null,
          data_consent: true,
          data_consent_date: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (patientError) {
        setError('Error al procesar solicitud. Intente nuevamente.');
        setLoading(false);
        return;
      }
      patientId = (newPatient as { id: string }).id;
    }

    // Create appointment request (status = pendiente, source = portal)
    const { error: apptError } = await supabase
      .from('appointments')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        appointment_date: preferredDate || today,
        start_time: '09:00:00',
        end_time: '09:30:00',
        consultation_type: consultType,
        status: 'pendiente',
        source: 'portal',
        ...(notes.trim() ? { notes: `Solicitud portal: ${notes.trim()}` } : {}),
      });

    if (apptError) {
      setError('Error al enviar solicitud. Intente nuevamente.');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-5xl">✅</p>
        <h2 className="text-xl font-semibold text-gray-900">Solicitud enviada</h2>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Hemos recibido tu solicitud de cita. Nos pondremos en contacto contigo
          por teléfono para confirmar el horario.
        </p>
        <p className="text-sm text-muted-foreground">
          Si tienes WhatsApp, puede que te contactemos por ahí.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {/* Personal data */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <p className="font-semibold text-white text-sm">👤 Tus datos</p>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className={labelClass}>Nombres<RequiredMark /></Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Apellidos<RequiredMark /></Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Cédula</Label>
            <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="0912345678" maxLength={13} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Teléfono<RequiredMark /></Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+593 99 123 4567" required className={inputClass} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className={labelClass}>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" className={inputClass} />
          </div>
        </div>
      </div>

      {/* Appointment */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <p className="font-semibold text-white text-sm">📅 Detalle de la cita</p>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className={labelClass}>Tipo de consulta</Label>
            <select value={consultType} onChange={(e) => setConsultType(e.target.value)} className={selectClass}>
              {CONSULT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Fecha preferida</Label>
            <Input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} min={today} className={inputClass} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className={labelClass}>Motivo de consulta</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Describe brevemente el motivo de tu consulta..."
              className="flex w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors resize-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <p className="text-xs text-muted-foreground">
        Al enviar este formulario, acepta que sus datos sean utilizados para gestionar su cita.
        Sus datos serán tratados de acuerdo con la Ley Orgánica de Protección de Datos Personales del Ecuador.
      </p>

      <Button type="submit" disabled={loading} className="w-full bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold h-12">
        {loading ? '⟳ Enviando...' : 'Enviar solicitud de cita'}
      </Button>
    </form>
  );
}
