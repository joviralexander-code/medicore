import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'MediCore — Software Médico para Ecuador',
    template: '%s | MediCore',
  },
  description:
    'Plataforma médica integral para Ecuador: historia clínica, facturación SRI, agenda, recetas y más.',
  metadataBase: new URL(
    process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://plexomed.com'
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
