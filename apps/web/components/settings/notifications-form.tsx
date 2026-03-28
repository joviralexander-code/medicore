'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface NotificationValues {
  reminder24h: boolean;
  reminder1h: boolean;
  reminderChannel: string;
  newBookingAlert: boolean;
  prescriptionAlert: boolean;
  sriErrorAlert: boolean;
  tokenExpiryAlert: boolean;
}

interface Props {
  tenantId: string;
  slug: string;
  initialValues: NotificationValues;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:ring-offset-2 ${
        checked ? 'bg-[#1E40AF]' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function NotificationsForm({ tenantId, slug: _slug, initialValues }: Props) {
  const [values, setValues] = useState<NotificationValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof NotificationValues>(key: K, value: NotificationValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    // Fetch current settings to merge
    const { data: tenant } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {};
    await supabase
      .from('tenants')
      .update({ settings: { ...currentSettings, notifications: values } })
      .eq('id', tenantId);

    setSaving(false);
    setSaved(true);
  }

  const groups = [
    {
      title: 'Recordatorios de citas',
      description: 'Notificaciones automáticas enviadas a los pacientes',
      items: [
        {
          key: 'reminder24h' as const,
          label: 'Recordatorio 24 horas antes',
          description: 'Envía un recordatorio al paciente el día anterior',
        },
        {
          key: 'reminder1h' as const,
          label: 'Recordatorio 1 hora antes',
          description: 'Envía un recordatorio 1 hora antes de la cita',
        },
      ],
    },
    {
      title: 'Alertas del sistema',
      description: 'Notificaciones para el administrador del consultorio',
      items: [
        {
          key: 'newBookingAlert' as const,
          label: 'Nueva solicitud de cita (portal)',
          description: 'Alerta cuando un paciente agenda desde el portal',
        },
        {
          key: 'prescriptionAlert' as const,
          label: 'Receta verificada',
          description: 'Notificación cuando una farmacia verifica una receta',
        },
        {
          key: 'sriErrorAlert' as const,
          label: 'Error en transmisión SRI',
          description: 'Alerta cuando una factura es rechazada por el SRI',
        },
        {
          key: 'tokenExpiryAlert' as const,
          label: 'Token de redes sociales por expirar',
          description: 'Alerta 7 días antes de que expire un token de Meta/TikTok',
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Channel selector */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <p className="font-semibold text-white text-sm">📡 Canal de notificaciones</p>
        </div>
        <div className="p-6">
          <Label className="text-sm font-medium text-gray-700">
            Enviar recordatorios por
          </Label>
          <div className="flex gap-3 mt-2">
            {[
              { value: 'email', label: '📧 Email' },
              { value: 'whatsapp', label: '💬 WhatsApp' },
              { value: 'both', label: '📧+💬 Ambos' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set('reminderChannel', opt.value)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  values.reminderChannel === opt.value
                    ? 'border-[#1E40AF] bg-blue-50 text-[#1E40AF]'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            WhatsApp requiere tener la conexión activa en el módulo correspondiente.
          </p>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.title} className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <p className="font-semibold text-gray-900 text-sm">{group.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
          </div>
          <div className="divide-y">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <Toggle
                  checked={values[item.key] as boolean}
                  onChange={(v) => set(item.key, v)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
        {saved && (
          <p className="text-sm text-green-600">✓ Guardado correctamente</p>
        )}
      </div>
    </div>
  );
}
