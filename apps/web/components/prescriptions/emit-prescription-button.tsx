'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

interface Props {
  prescriptionId: string;
}

export function EmitPrescriptionButton({ prescriptionId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmit() {
    if (!confirm('¿Emitir esta receta? El estado cambiará a "Emitida" y quedará lista para el paciente.')) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('prescriptions')
      .update({
        status: 'emitida',
        doctor_signed_at: new Date().toISOString(),
      })
      .eq('id', prescriptionId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={handleEmit}
        disabled={loading}
        className="bg-[#0D9488] hover:bg-[#0f766e] text-white font-semibold"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin">⟳</span>
            Emitiendo...
          </span>
        ) : '✓ Emitir receta'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
