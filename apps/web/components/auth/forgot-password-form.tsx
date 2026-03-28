'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Mail, MailCheck } from 'lucide-react';

export function ForgotPasswordForm() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    const supabase   = createClient();
    const redirectTo = (process.env['NEXT_PUBLIC_APP_URL'] ?? window.location.origin) + '/reset-password';

    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo }
    );

    setLoading(false);
    if (authError) { setError(authError.message); } else { setSent(true); }
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <MailCheck size={26} className="text-green-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-foreground">Revisa tu correo</p>
          <p className="text-sm text-muted-foreground mt-1.5">
            Si existe una cuenta con <strong className="text-foreground">{email}</strong>, recibirás
            el enlace de recuperación en breve.
          </p>
          <p className="text-xs text-muted-foreground mt-2">Revisa también tu carpeta de spam.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Correo electrónico</Label>
        <div className="relative">
          <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            id="email" type="email"
            placeholder="dr.garcia@clinica.ec"
            value={email} onChange={(e) => setEmail(e.target.value)}
            required autoComplete="email"
            className="pl-9 h-11"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <Button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="w-full h-11 font-semibold"
      >
        {loading
          ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />Enviando…</>
          : 'Enviar enlace de recuperación'}
      </Button>
    </form>
  );
}
