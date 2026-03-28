import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">

      {/* ── Left: brand panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between bg-primary px-12 py-10">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 w-fit">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
            <span className="text-white font-bold text-base">M</span>
          </div>
          <span className="text-white font-bold text-xl tracking-tight">MediCore</span>
        </Link>

        {/* Tagline */}
        <blockquote className="space-y-3">
          <p className="text-blue-100 text-2xl font-semibold leading-snug">
            "Simplifica tu consultorio,<br/>enfócate en tus pacientes."
          </p>
          <footer className="text-blue-200/70 text-sm">
            Facturación SRI · Recetas digitales · Agenda
          </footer>
        </blockquote>

        {/* Features */}
        <ul className="space-y-2 text-blue-100/80 text-sm">
          {[
            'Facturación electrónica SRI Ecuador',
            'Historial clínico y recetas digitales',
            'Agenda con recordatorios WhatsApp',
            'Módulo financiero y reportes',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-300 flex-shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Right: form area ──────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center px-6 py-12 bg-slate-50 dark:bg-background">
        {/* Mobile logo */}
        <Link href="/" className="lg:hidden flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <span className="font-bold text-xl text-primary">MediCore</span>
        </Link>

        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
