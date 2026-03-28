'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

interface Props {
  code?: string;
}

export function ResetPasswordForm({ code }: Props) {
  const router           = useRouter();
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
  }, []);

  const [ready,    setReady]    = useState(false);
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Exchange PKCE code or verify recovery session on mount
  useEffect(() => {
    const supabase = createClient();

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
        if (err) setError('Este enlace es inválido o ya expiró. Solicita uno nuevo.');
        else setReady(true);
      });
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setReady(true);
        else setError('No se encontró una sesión de recuperación válida. Usa el enlace del correo.');
      });
    }
  }, [code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // Guard contra double-submit
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
        redirectTimerRef.current = setTimeout(() => router.push('/login'), 2500);
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-[#1E40AF] to-[#0D9488]" />
        <div className="p-8 text-center space-y-3">
          <p className="text-4xl" aria-hidden="true">✅</p>
          <h2 className="text-xl font-bold text-gray-800">Contraseña actualizada</h2>
          <p className="text-sm text-gray-500">
            Tu contraseña fue cambiada exitosamente. Redirigiendo al inicio de sesión...
          </p>
        </div>
      </div>
    );
  }

  if (!ready && !error) {
    return (
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-[#1E40AF] to-[#0D9488]" />
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">Verificando enlace...</p>
        </div>
      </div>
    );
  }

  if (error && !ready) {
    return (
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
        <div className="h-1.5 bg-red-500" />
        <div className="p-8 text-center space-y-4">
          <p className="text-4xl" aria-hidden="true">❌</p>
          <p className="text-sm text-red-600" role="alert">{error}</p>
          <a
            href="/forgot-password"
            className="inline-flex items-center justify-center rounded-lg bg-[#1E40AF] text-white text-sm font-medium h-10 px-6 hover:bg-[#1e3a8a] transition-colors"
          >
            Solicitar nuevo enlace
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-[#1E40AF] to-[#0D9488]" />
      <div className="p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Nueva contraseña</h2>
        <p className="text-sm text-gray-400 mb-7">Elige una contraseña segura para tu cuenta.</p>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-gray-600 font-medium">
              Nueva contraseña
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="h-11 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-gray-600 font-medium">
              Confirmar contraseña
            </Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="h-11 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors"
            />
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="w-full h-12 bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold text-base shadow-md shadow-blue-100 transition-all mt-2"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <span className="animate-spin" aria-hidden="true">⟳</span>
                <span>Guardando...</span>
              </span>
            ) : (
              'Guardar nueva contraseña'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
