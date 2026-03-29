'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SriConfigFormProps {
  slug: string;
  tenantId: string;
  current: {
    sri_ruc: string | null;
    sri_razon_social: string | null;
    sri_nombre_comercial: string | null;
    sri_direccion: string | null;
    sri_telefono: string | null;
    sri_email: string | null;
    sri_serie: string | null;
    sri_ambiente: number | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUC_REGEX = /^\d{10}(\d{3})?$/;
const SERIE_REGEX = /^\d{3}-\d{3}$/;

const labelClass = 'text-sm font-medium text-gray-700';
const inputClass =
  'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';

function RequiredMark() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SriConfigForm({ slug: _slug, tenantId, current }: SriConfigFormProps) {
  const [ruc, setRuc] = useState(current.sri_ruc ?? '');
  const [razonSocial, setRazonSocial] = useState(current.sri_razon_social ?? '');
  const [nombreComercial, setNombreComercial] = useState(current.sri_nombre_comercial ?? '');
  const [direccion, setDireccion] = useState(current.sri_direccion ?? '');
  const [telefono, setTelefono] = useState(current.sri_telefono ?? '');
  const [email, setEmail] = useState(current.sri_email ?? '');
  const [serie, setSerie] = useState(current.sri_serie ?? '');
  const [ambiente, setAmbiente] = useState<number>(current.sri_ambiente ?? 1);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccess(null);
    setError(null);

    // Client-side validation
    if (!RUC_REGEX.test(ruc)) {
      setError('RUC inválido. Debe tener 10 o 13 dígitos numéricos.');
      return;
    }
    if (!razonSocial.trim()) {
      setError('La razón social es obligatoria.');
      return;
    }
    if (!SERIE_REGEX.test(serie)) {
      setError('Serie inválida. Formato requerido: 001-001');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { error: updateError } = await supabase
        .from('tenants')
        .update({
          sri_ruc: ruc,
          sri_razon_social: razonSocial,
          sri_nombre_comercial: nombreComercial || null,
          sri_direccion: direccion || null,
          sri_telefono: telefono || null,
          sri_email: email || null,
          sri_serie: serie,
          sri_ambiente: ambiente,
        })
        .eq('id', tenantId);

      if (updateError) {
        setError(updateError.message ?? 'No se pudo guardar la configuración.');
        setLoading(false);
        return;
      }

      setSuccess('Configuración SRI guardada correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* RUC */}
        <div className="space-y-1.5">
          <Label htmlFor="sri_ruc" className={labelClass}>
            RUC
            <RequiredMark />
          </Label>
          <Input
            id="sri_ruc"
            value={ruc}
            onChange={(e) => setRuc(e.target.value)}
            placeholder="0990012345001"
            maxLength={13}
            className={inputClass}
            required
          />
          <p className="text-xs text-muted-foreground">10 o 13 dígitos</p>
        </div>

        {/* Razón social */}
        <div className="space-y-1.5">
          <Label htmlFor="sri_razon_social" className={labelClass}>
            Razón social
            <RequiredMark />
          </Label>
          <Input
            id="sri_razon_social"
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            placeholder="Nombre del contribuyente tal como está en el SRI"
            className={inputClass}
            required
          />
        </div>

        {/* Nombre comercial */}
        <div className="space-y-1.5">
          <Label htmlFor="sri_nombre_comercial" className={labelClass}>
            Nombre comercial
          </Label>
          <Input
            id="sri_nombre_comercial"
            value={nombreComercial}
            onChange={(e) => setNombreComercial(e.target.value)}
            placeholder="Nombre que aparece en facturas (opcional)"
            className={inputClass}
          />
        </div>

        {/* Dirección */}
        <div className="space-y-1.5">
          <Label htmlFor="sri_direccion" className={labelClass}>
            Dirección
            <RequiredMark />
          </Label>
          <Input
            id="sri_direccion"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Av. Principal 123, Quito"
            className={inputClass}
            required
          />
        </div>

        {/* Teléfono */}
        <div className="space-y-1.5">
          <Label htmlFor="sri_telefono" className={labelClass}>
            Teléfono
          </Label>
          <Input
            id="sri_telefono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="0999999999"
            className={inputClass}
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="sri_email" className={labelClass}>
            Correo electrónico
          </Label>
          <Input
            id="sri_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="facturacion@miempresa.com"
            className={inputClass}
          />
        </div>

        {/* Serie */}
        <div className="space-y-1.5">
          <Label htmlFor="sri_serie" className={labelClass}>
            Serie
            <RequiredMark />
          </Label>
          <Input
            id="sri_serie"
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            placeholder="001-001"
            maxLength={7}
            className={inputClass}
            required
          />
          <p className="text-xs text-muted-foreground">Formato: XXX-XXX (ej. 001-001)</p>
        </div>

        {/* Ambiente */}
        <div className="space-y-1.5">
          <Label className={labelClass}>
            Ambiente
            <RequiredMark />
          </Label>
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="sri_ambiente"
                value={1}
                checked={ambiente === 1}
                onChange={() => setAmbiente(1)}
                className="accent-[#1E40AF]"
              />
              <span className="text-sm text-gray-700">
                <span className="font-medium">1 — Pruebas</span>{' '}
                <span className="text-muted-foreground">(Certificación)</span>
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="sri_ambiente"
                value={2}
                checked={ambiente === 2}
                onChange={() => setAmbiente(2)}
                className="accent-[#1E40AF]"
              />
              <span className="text-sm text-gray-700">
                <span className="font-medium">2 — Producción</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Inline feedback */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          disabled={loading}
          className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold px-8"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block">⟳</span>
              Guardando...
            </span>
          ) : (
            'Guardar configuración'
          )}
        </Button>
      </div>
    </form>
  );
}
