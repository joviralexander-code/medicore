'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

// NOTE: finalizeInvitation uses service-role via API route because:
// - signUp with email confirmation enabled yields no active session
// - upsert on user_profiles from anon client would fail RLS without auth.uid()

interface Props {
  token: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: string;
  invitationId: string;
}

type Mode = 'signup' | 'signin';

export function AcceptInvitationForm({
  email,
  tenantId,
  tenantSlug,
  role,
  invitationId,
}: Props) {
  const router = useRouter();

  const [mode,      setMode]      = useState<Mode>('signup');
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function finalizeInvitation(userId: string, accessToken: string) {
    // Use service-role API route so this works even before email confirmation
    const res = await fetch('/api/invitations/finalize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        userId,
        invitationId,
        tenantId,
        role,
        ...(mode === 'signup'
          ? { firstName: firstName.trim(), lastName: lastName.trim() }
          : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error((detail as { error?: string }).error ?? 'Error al unirte al consultorio.');
    }

    router.push(`/app/${tenantSlug}/dashboard`);
    router.refresh();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError('Nombre y apellido son obligatorios.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    // With email confirmation on, session may be null — we still have userId
    const accessToken = data.session?.access_token ?? '';
    if (!userId) {
      setError('No se pudo crear la cuenta. Intenta de nuevo.');
      setLoading(false);
      return;
    }

    try {
      await finalizeInvitation(userId, accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
      setLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError('Contraseña incorrecta. Verifica tus credenciales.');
      setLoading(false);
      return;
    }

    const userId      = data.user?.id;
    const accessToken = data.session?.access_token ?? '';
    if (!userId) {
      setError('Error de autenticación. Intenta de nuevo.');
      setLoading(false);
      return;
    }

    try {
      await finalizeInvitation(userId, accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-[#1E40AF] to-[#0D9488]" />
      <div className="p-8">
        {/* Mode toggle */}
        <div className="flex rounded-lg border border-gray-200 p-1 mb-7">
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); setPassword(''); }}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
              mode === 'signup'
                ? 'bg-[#1E40AF] text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Crear cuenta
          </button>
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null); setPassword(''); }}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
              mode === 'signin'
                ? 'bg-[#1E40AF] text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Ya tengo cuenta
          </button>
        </div>

        {/* Email (always read-only — locked to invitation) */}
        <div className="space-y-1.5 mb-5">
          <Label className="text-gray-600 font-medium">Correo electrónico</Label>
          <Input
            type="email"
            value={email}
            disabled
            className="h-11 border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed"
          />
        </div>

        {mode === 'signup' ? (
          <form onSubmit={handleSignUp} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-gray-600 font-medium">
                  Nombre
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                  className="h-11 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-gray-600 font-medium">
                  Apellido
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                  className="h-11 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-new" className="text-gray-600 font-medium">
                Crear contraseña
              </Label>
              <Input
                id="password-new"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                className="h-11 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full h-12 bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold text-base shadow-md shadow-blue-100 transition-all"
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <span className="animate-spin" aria-hidden="true">⟳</span>
                  <span>Creando cuenta...</span>
                </span>
              ) : (
                'Crear cuenta y unirme'
              )}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSignIn} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="password-existing" className="text-gray-600 font-medium">
                Contraseña
              </Label>
              <Input
                id="password-existing"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-11 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full h-12 bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold text-base shadow-md shadow-blue-100 transition-all"
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <span className="animate-spin" aria-hidden="true">⟳</span>
                  <span>Ingresando...</span>
                </span>
              ) : (
                'Ingresar y unirme'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
