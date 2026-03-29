import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Accede a tu cuenta PlexoMed',
};

export default function LoginPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Bienvenido de nuevo</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Ingresa tus credenciales para acceder
        </p>
      </div>

      <Suspense>
        <LoginForm />
      </Suspense>

      <p className="text-center text-sm text-muted-foreground mt-8">
        ¿No tienes cuenta?{' '}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Regístrate gratis
        </Link>
      </p>
    </>
  );
}
