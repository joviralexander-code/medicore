import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = {
  title: 'Crear cuenta',
  description: 'Crea tu cuenta MediCore y empieza gratis',
};

export default function RegisterPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Crea tu cuenta</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Empieza gratis, sin tarjeta de crédito
        </p>
      </div>

      <RegisterForm />

      <p className="text-center text-sm text-muted-foreground mt-8">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
