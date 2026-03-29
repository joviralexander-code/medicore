'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SriCertUploadProps {
  slug: string;
  tenantId: string;
  hasCert: boolean;
  certExpiry?: string;
}

interface CertValidationResult {
  subject?: string;
  validFrom?: string;
  validTo?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const labelClass = 'text-sm font-medium text-gray-700';
const inputClass =
  'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SriCertUpload({ slug: _slug, tenantId: _tenantId, hasCert, certExpiry }: SriCertUploadProps) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const [showReplaceForm, setShowReplaceForm] = useState(!hasCert);
  const [p12Base64, setP12Base64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<CertValidationResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setValidation(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = fileToBase64(buffer);
      setP12Base64(base64);
    } catch {
      setError('No se pudo leer el archivo. Intente de nuevo.');
      setP12Base64(null);
      setFileName(null);
    }
  }

  async function handleSubmit() {
    if (!p12Base64) {
      setError('Seleccione un archivo .p12 o .pfx.');
      return;
    }
    if (!password.trim()) {
      setError('La contraseña del certificado es obligatoria.');
      return;
    }

    setLoading(true);
    setError(null);
    setValidation(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError('Sesión expirada. Por favor recarga la página.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/sri/cert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ p12Base64, password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `Error ${res.status}: no se pudo subir el certificado.`);
        setLoading(false);
        return;
      }

      const body = (await res.json().catch(() => ({}))) as CertValidationResult;
      setValidation(body);
      setPassword('');
      setP12Base64(null);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowReplaceForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Status badge */}
      <div className="flex items-center gap-3">
        {hasCert || validation ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Certificado activo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
            Sin certificado
          </span>
        )}

        {certExpiry && !validation && (
          <span className="text-xs text-muted-foreground">
            Vence: {formatDate(certExpiry)}
          </span>
        )}

        {hasCert && !showReplaceForm && (
          <button
            type="button"
            onClick={() => setShowReplaceForm(true)}
            className="ml-auto text-xs text-[#1E40AF] hover:underline"
          >
            Reemplazar
          </button>
        )}
      </div>

      {/* Validation result after successful upload */}
      {validation && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 space-y-1">
          <p className="font-semibold">Certificado cargado correctamente</p>
          {validation.subject && (
            <p>
              <span className="font-medium">Sujeto:</span> {validation.subject}
            </p>
          )}
          {validation.validFrom && (
            <p>
              <span className="font-medium">Válido desde:</span> {formatDate(validation.validFrom)}
            </p>
          )}
          {validation.validTo && (
            <p>
              <span className="font-medium">Válido hasta:</span> {formatDate(validation.validTo)}
            </p>
          )}
        </div>
      )}

      {/* Upload form */}
      {showReplaceForm && (
        <div className="space-y-4 border border-gray-100 rounded-xl p-5 bg-gray-50">
          <p className="text-sm text-muted-foreground">
            Sube el certificado electrónico (.p12 o .pfx) emitido por el Banco Central del Ecuador o una
            entidad certificadora autorizada.
          </p>

          {/* File input */}
          <div className="space-y-1.5">
            <Label htmlFor="cert_file" className={labelClass}>
              Archivo de certificado (.p12 / .pfx)
            </Label>
            <input
              ref={fileInputRef}
              id="cert_file"
              type="file"
              accept=".p12,.pfx"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#1E40AF] file:text-white hover:file:bg-[#1e3a8a] cursor-pointer"
            />
            {fileName && (
              <p className="text-xs text-muted-foreground">
                Archivo seleccionado: <span className="font-medium">{fileName}</span>
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="cert_password" className={labelClass}>
              Contraseña del certificado
            </Label>
            <Input
              id="cert_password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña del archivo .p12"
              className={inputClass}
              autoComplete="new-password"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !p12Base64}
              className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin inline-block">⟳</span>
                  Subiendo...
                </span>
              ) : (
                'Subir certificado'
              )}
            </Button>

            {hasCert && (
              <button
                type="button"
                onClick={() => {
                  setShowReplaceForm(false);
                  setError(null);
                  setP12Base64(null);
                  setFileName(null);
                  setPassword('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
