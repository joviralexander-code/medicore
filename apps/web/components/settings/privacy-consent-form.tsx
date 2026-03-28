'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

interface Props {
  tenantId: string;
  initialConsented: boolean;
  consentedAt: string | null;
}

export function PrivacyConsentForm({ tenantId, initialConsented, consentedAt }: Props) {
  const [consented, setConsented] = useState(initialConsented);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState<string | null>(consentedAt);

  async function handleToggle() {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const newValue = !consented;
    const now = new Date().toISOString();

    await supabase.from('data_business_consent').upsert({
      tenant_id: tenantId,
      consented: newValue,
      consented_at: newValue ? now : null,
      consented_by: user?.id,
    });

    setConsented(newValue);
    setDate(newValue ? now : null);
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-lg border p-4 ${
          consented ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0 ${
              consented ? 'bg-green-600' : 'bg-gray-300'
            }`}
          >
            {consented ? '✓' : ''}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {consented
                ? 'Participación activa en el programa de datos'
                : 'No participando en el programa de datos'}
            </p>
            {date && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Consentimiento registrado el{' '}
                {new Date(date).toLocaleDateString('es-EC', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {!consented && (
        <div className="text-sm text-gray-700 space-y-2">
          <p className="font-medium">Al participar, confirmas que:</p>
          <ul className="space-y-1 text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-[#1E40AF] mt-0.5">•</span>
              Los datos exportados serán completamente anónimos (k ≥ 5)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#1E40AF] mt-0.5">•</span>
              No se incluirán nombres, cédulas, teléfonos ni emails
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#1E40AF] mt-0.5">•</span>
              Las edades se generalizarán a grupos etarios (ej. 30-39)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#1E40AF] mt-0.5">•</span>
              Cumple con LOPDP y obtuviste consentimiento de tus pacientes
            </li>
          </ul>
        </div>
      )}

      <Button
        onClick={handleToggle}
        disabled={saving}
        variant={consented ? 'outline' : 'default'}
        className={
          consented
            ? 'border-red-300 text-red-600 hover:bg-red-50'
            : 'bg-[#1E40AF] hover:bg-[#1e3a8a] text-white'
        }
      >
        {saving
          ? 'Guardando...'
          : consented
          ? 'Retirar consentimiento'
          : 'Activar programa de datos'}
      </Button>
    </div>
  );
}
