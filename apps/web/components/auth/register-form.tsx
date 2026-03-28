'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '', firstName: '', lastName: '',
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (form.password !== form.confirmPassword) {
      toast({ title: 'Las contraseñas no coinciden', variant: 'destructive' });
      return;
    }
    if (form.password.length < 8) {
      toast({ title: 'La contraseña debe tener al menos 8 caracteres', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { first_name: form.firstName, last_name: form.lastName } },
    });

    if (error) {
      toast({ title: 'Error al crear cuenta', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    router.push('/onboarding');
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">Nombre</Label>
          <Input
            id="firstName" name="firstName" placeholder="Juan"
            value={form.firstName} onChange={handleChange}
            required className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Apellido</Label>
          <Input
            id="lastName" name="lastName" placeholder="García"
            value={form.lastName} onChange={handleChange}
            required className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email" name="email" type="email"
          placeholder="dr.garcia@clinica.ec"
          value={form.email} onChange={handleChange}
          required autoComplete="email" className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password" name="password" type="password"
          placeholder="Mínimo 8 caracteres"
          value={form.password} onChange={handleChange}
          required autoComplete="new-password" className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
        <Input
          id="confirmPassword" name="confirmPassword" type="password"
          value={form.confirmPassword} onChange={handleChange}
          required autoComplete="new-password" className="h-11"
        />
      </div>

      <Button
        type="submit"
        className="w-full h-11 font-semibold mt-1"
        disabled={loading}
        aria-busy={loading}
      >
        {loading
          ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />Creando cuenta…</>
          : 'Crear cuenta gratis'}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Al registrarte aceptas nuestros{' '}
        <Link href="/terms" className="text-primary hover:underline">Términos</Link>{' '}y{' '}
        <Link href="/privacy" className="text-primary hover:underline">Política de privacidad</Link>
      </p>
    </form>
  );
}
