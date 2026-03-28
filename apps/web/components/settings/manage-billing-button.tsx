'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  tenantId: string;
}

export function ManageBillingButton({ tenantId }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const { url } = await res.json() as { url: string };
      if (url) window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className="text-xs"
    >
      {loading ? 'Cargando...' : 'Gestionar suscripción'}
    </Button>
  );
}
