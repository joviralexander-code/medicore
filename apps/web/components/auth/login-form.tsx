'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock } from 'lucide-react';

export function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect  = searchParams.get('redirect') ?? '';
  const redirect     = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect : '/onboarding';
  const tenant       = searchParams.get('tenant');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({ title: 'Error al iniciar sesión', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    window.location.href = redirect;
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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Contraseña</Label>
          <Link href="/forgot-password" className="text-xs text-primary hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <div className="relative">
          <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            id="password" type="password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            required autoComplete="current-password"
            className="pl-9 h-11"
          />
        </div>
      </div>

      <Button
        type="submit"
        className="w-full h-11 font-semibold mt-1"
        disabled={loading}
        aria-busy={loading}
      >
        {loading
          ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />Ingresando…</>
          : 'Ingresar'}
      </Button>
    </form>
  );
}
