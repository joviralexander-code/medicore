'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  slug: string;
  tenantId: string;
  planTier: string;
  tenantName: string;
}

// secretaria role is available on all plans; admin (multiple doctors) requires clinica+
export function InviteUserForm({ slug: _slug, tenantId, tenantName, planTier }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole]   = useState('secretaria');
  const [loading, setLoading] = useState(false);
  const [success,  setSuccess]  = useState<string | null>(null);
  const [warning,  setWarning]  = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const canInviteDoctor = ['clinica', 'enterprise'].includes(planTier);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setWarning(null);

    if (!email.trim()) { setError('El email es obligatorio.'); return; }

    setLoading(true);
    const supabase = createClient();

    // Generate token
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from('tenant_invitations')
      .insert({
        tenant_id: tenantId,
        email: email.trim().toLowerCase(),
        role,
        token,
        expires_at: expiresAt,
      });

    if (insertError) {
      if (insertError.code === '23505') {
        setError('Ya existe una invitación pendiente para este email.');
      } else {
        setError(insertError.message);
      }
      setLoading(false);
      return;
    }

    // Send invitation email via API route
    const emailRes = await fetch('/api/invitations/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email: email.trim().toLowerCase(), tenantName, role }),
    });

    if (!emailRes.ok) {
      setWarning('Invitación creada, pero no se pudo enviar el correo. Comparte el enlace manualmente.');
    } else {
      setSuccess(`Invitación enviada a ${email}. El enlace es válido por 7 días.`);
      setEmail('');
    }

    setLoading(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Invitar miembro del equipo</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="secretaria@clinica.com"
                required
                className="h-10 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#1E40AF] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Rol</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors"
              >
                <option value="secretaria">Secretaria</option>
                {canInviteDoctor && <option value="admin">Médico / Admin</option>}
              </select>
            </div>
          </div>

          {!canInviteDoctor && (
            <p className="text-xs text-muted-foreground">
              Para agregar más médicos al consultorio, actualiza al plan Clínica.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {warning && (
            <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">{warning}</p>
          )}
          {success && (
            <p className="text-sm text-green-600">{success}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold"
          >
            {loading ? '⟳ Enviando...' : 'Enviar invitación'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
