'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransmitButtonProps {
  documentId: string;
  slug: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransmitButton({ documentId, slug: _slug }: TransmitButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleTransmit() {
    setError(null);
    setInfo(null);
    setLoading(true);

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

      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${apiBase}/api/v1/billing/factura/${documentId}/transmitir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(
          body.message ??
            `Error ${res.status}: no se pudo transmitir. Verifica que el RUC y el certificado estén configurados.`
        );
        setLoading(false);
        return;
      }

      setInfo('Documento enviado al SRI. Actualizando estado...');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al transmitir.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={handleTransmit}
        disabled={loading}
        className="w-full bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold py-6 text-base"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin inline-block text-lg">⟳</span>
            Firmando y enviando...
          </span>
        ) : (
          'Firmar y Enviar al SRI'
        )}
      </Button>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {info && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {info}
        </div>
      )}
    </div>
  );
}
