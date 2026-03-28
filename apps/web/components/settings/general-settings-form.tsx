'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TenantData {
  name: string;
  timezone: string;
  currency: string;
}

interface ProfileData {
  first_name: string;
  last_name: string;
  speciality: string;
  senescyt_registration: string;
  cedula: string;
  phone: string;
}

export interface GeneralSettingsFormProps {
  slug: string;
  tenantId: string;
  userId: string;
  initialTenant: TenantData;
  initialProfile: ProfileData;
}

const TIMEZONES = [
  'America/Guayaquil',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Mexico_City',
];

export function GeneralSettingsForm({
  slug: _slug,
  tenantId,
  userId,
  initialTenant,
  initialProfile,
}: GeneralSettingsFormProps) {
  const [tenant, setTenant] = useState<TenantData>(initialTenant);
  const [profile, setProfile] = useState<ProfileData>(initialProfile);
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const inputClass = 'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';
  const labelClass = 'text-sm font-medium text-gray-700';
  const selectClass = 'flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors';
  const sectionClass = 'bg-white rounded-xl border shadow-sm overflow-hidden';
  const sectionHeaderClass = 'px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]';
  const sectionTitleClass = 'font-semibold text-white text-sm tracking-wide';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const supabase = createClient();

    const [tenantResult, profileResult] = await Promise.all([
      supabase
        .from('tenants')
        .update({
          name: tenant.name.trim(),
          timezone: tenant.timezone,
          currency: tenant.currency,
        })
        .eq('id', tenantId),
      supabase
        .from('user_profiles')
        .update({
          first_name: profile.first_name.trim(),
          last_name: profile.last_name.trim(),
          speciality: profile.speciality.trim() || null,
          senescyt_registration: profile.senescyt_registration.trim() || null,
          cedula: profile.cedula.trim() || null,
          phone: profile.phone.trim() || null,
        })
        .eq('id', userId),
    ]);

    if (tenantResult.error || profileResult.error) {
      setError(tenantResult.error?.message ?? profileResult.error?.message ?? 'Error al guardar');
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Consultorio */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>🏥 Datos del consultorio</p>
        </div>
        <div className="p-6 grid grid-cols-2 gap-5">
          <div className="col-span-2 space-y-1.5">
            <Label className={labelClass}>Nombre del consultorio</Label>
            <Input
              value={tenant.name}
              onChange={(e) => setTenant((t) => ({ ...t, name: e.target.value }))}
              placeholder="Consultorio Dr. Pérez"
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Zona horaria</Label>
            <select
              value={tenant.timezone}
              onChange={(e) => setTenant((t) => ({ ...t, timezone: e.target.value }))}
              className={selectClass}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Moneda</Label>
            <select
              value={tenant.currency}
              onChange={(e) => setTenant((t) => ({ ...t, currency: e.target.value }))}
              className={selectClass}
            >
              <option value="USD">USD — Dólar americano</option>
              <option value="COP">COP — Peso colombiano</option>
              <option value="PEN">PEN — Sol peruano</option>
            </select>
          </div>
        </div>
      </div>

      {/* Médico */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>👨‍⚕️ Datos del médico titular</p>
        </div>
        <div className="p-6 grid grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label className={labelClass}>Nombres</Label>
            <Input
              value={profile.first_name}
              onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Apellidos</Label>
            <Input
              value={profile.last_name}
              onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Especialidad</Label>
            <Input
              value={profile.speciality}
              onChange={(e) => setProfile((p) => ({ ...p, speciality: e.target.value }))}
              placeholder="Medicina General, Cardiología..."
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Registro SENESCYT</Label>
            <Input
              value={profile.senescyt_registration}
              onChange={(e) => setProfile((p) => ({ ...p, senescyt_registration: e.target.value }))}
              placeholder="1234567890"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Cédula</Label>
            <Input
              value={profile.cedula}
              onChange={(e) => setProfile((p) => ({ ...p, cedula: e.target.value }))}
              placeholder="0912345678"
              maxLength={13}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Teléfono</Label>
            <Input
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              placeholder="+593 99 123 4567"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          ✓ Cambios guardados correctamente
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={loading}
          className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold px-8"
        >
          {loading ? '⟳ Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
