import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = { title: 'Nueva contraseña' };

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { code } = await searchParams;

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Nueva contraseña</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Crea una contraseña segura para tu cuenta
        </p>
      </div>

      <ResetPasswordForm code={code} />

      <p className="text-center text-sm text-muted-foreground mt-8">
        <Link href="/login" className="font-semibold text-primary hover:underline">
          ← Volver al inicio de sesión
        </Link>
      </p>
    </>
  );
}
