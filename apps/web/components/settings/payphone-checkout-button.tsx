'use client';

import { useState } from 'react';

interface Props {
  tier: string;
  tenantId: string;
  slug: string;
  label?: string;
}

export function PayphoneCheckoutButton({ tier, tenantId, slug, label = 'Pagar con PayPhone' }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/payphone-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, tenantId, slug }),
      });
      const data = (await res.json()) as { paymentUrl?: string; error?: string };
      if (!res.ok || !data.paymentUrl) {
        setError(data.error ?? 'Error iniciando pago');
        return;
      }
      window.location.href = data.paymentUrl;
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full text-sm font-medium py-2 px-4 rounded-lg bg-[#00B4D8] hover:bg-[#0096C7] text-white transition-colors disabled:opacity-60"
      >
        {loading ? 'Redirigiendo...' : label}
      </button>
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  );
}
