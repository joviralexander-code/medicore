import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Recupera tu contraseña</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Te enviaremos un enlace para restablecer tu contraseña
        </p>
      </div>

      <ForgotPasswordForm />

      <p className="text-center text-sm text-muted-foreground mt-8">
        <Link href="/login" className="font-semibold text-primary hover:underline">
          ← Volver al inicio de sesión
        </Link>
      </p>
    </>
  );
}
