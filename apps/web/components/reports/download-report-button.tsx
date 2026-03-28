'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

interface Props {
  month: string;  // e.g. "2026-03"
}

export function DownloadReportButton({ month }: Props) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleDownload() {
    if (loading) return;
    setError(null);
    setLoading(true);

    // Validar formato antes de usarlo en nombre de archivo o request
    if (!MONTH_REGEX.test(month)) {
      setError('Mes inválido.');
      setLoading(false);
      return;
    }

    const [year, mon] = month.split('-') as [string, string];
    const monNum = parseInt(mon, 10);
    if (monNum < 1 || monNum > 12) {
      setError('Mes fuera de rango.');
      setLoading(false);
      return;
    }

    const API_URL = process.env['NEXT_PUBLIC_API_URL'];
    if (!API_URL) {
      setError('API no configurada.');
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError('Sesión expirada. Recarga la página.');
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/v1/finances/report-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ month: mon, year }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setError((detail as { error?: string }).error ?? 'Error al generar PDF');
        setLoading(false);
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `reporte-financiero-${year}-${mon.padStart(2, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }

    setLoading(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDownload}
        disabled={loading}
        aria-busy={loading}
        aria-label={loading ? 'Generando PDF, por favor espera' : 'Descargar reporte en PDF'}
        className="h-10 px-4 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {loading ? (
          <>
            <span className="animate-spin text-xs" aria-hidden="true">⟳</span>
            Generando...
          </>
        ) : (
          <>
            <span aria-hidden="true">⬇</span>
            Descargar PDF
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
