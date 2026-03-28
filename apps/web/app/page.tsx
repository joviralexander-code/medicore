import Link from 'next/link';
import type { Metadata } from 'next';
import {
  FileText, Calendar, Receipt, Pill, TrendingUp,
  MessageCircle, Shield, CheckCircle, ArrowRight, Stethoscope,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'MediCore — Software Médico para Ecuador',
  description:
    'Historia clínica electrónica, facturación SRI, agenda y más. La plataforma médica integral para Ecuador.',
};

const features = [
  {
    icon: Receipt,
    title: 'Facturación SRI',
    description: 'Genera y transmite facturas electrónicas directamente al SRI. Compatible con ambiente pruebas y producción.',
    color: 'bg-blue-100 text-blue-600',
  },
  {
    icon: FileText,
    title: 'Historia Clínica',
    description: 'Registro digital de consultas con signos vitales, diagnósticos CIE-10 y sugerencias con IA.',
    color: 'bg-teal-100 text-teal-600',
  },
  {
    icon: Calendar,
    title: 'Agenda Inteligente',
    description: 'Portal de autoagendamiento para pacientes vía web y WhatsApp. Recordatorios automáticos.',
    color: 'bg-violet-100 text-violet-600',
  },
  {
    icon: Pill,
    title: 'Recetas Electrónicas',
    description: 'Recetas profesionales con firma digital, verificación QR y alerta de interacciones medicamentosas.',
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: TrendingUp,
    title: 'Módulo Financiero',
    description: 'Control de ingresos, egresos, caja diaria y reportes P&L para tu consultorio.',
    color: 'bg-amber-100 text-amber-600',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp Integrado',
    description: 'Chatbot para citas, recordatorios y atención al paciente desde un panel unificado.',
    color: 'bg-green-100 text-green-600',
  },
];

const plans = [
  {
    name: 'Gratis',
    price: '$0',
    period: '/mes',
    description: 'Para empezar sin riesgo',
    features: ['1 médico', 'Hasta 30 pacientes', 'Historia clínica básica', 'Agenda'],
    cta: 'Empezar gratis',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mes',
    description: 'Para médicos independientes',
    features: ['1 médico', 'Pacientes ilimitados', 'Facturación SRI', 'Recetas digitales', 'WhatsApp', 'Soporte prioritario'],
    cta: 'Prueba 14 días gratis',
    href: '/register',
    highlight: true,
  },
  {
    name: 'Clínica',
    price: '$79',
    period: '/mes',
    description: 'Para clínicas y centros médicos',
    features: ['Hasta 5 médicos', 'Todo lo de Pro', 'Múltiples sucursales', 'Reportes avanzados', 'Redes sociales', 'API acceso'],
    cta: 'Contactar ventas',
    href: '/register',
    highlight: false,
  },
];

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <Stethoscope size={16} className="text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">MediCore</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Funcionalidades</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Precios</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Ingresar
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-white text-sm font-semibold h-9 px-4 hover:bg-primary/90 transition-colors shadow-sm"
            >
              Empezar gratis <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto text-center px-6 pt-20 pb-24">
        <div className="inline-flex items-center gap-2 bg-primary/8 text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-8 border border-primary/20">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Diseñado para médicos ecuatorianos
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold text-foreground leading-tight mb-6 tracking-tight">
          Software médico completo
          <br />
          <span className="text-primary">para Ecuador</span>
        </h1>
        <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          Historia clínica electrónica, facturación SRI, agenda inteligente,
          recetas digitales y más. Todo en una plataforma segura que cumple
          con la normativa ecuatoriana.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-white font-semibold h-12 px-8 text-sm hover:bg-primary/90 transition-colors shadow-md shadow-primary/25"
          >
            Empezar gratis — sin tarjeta <ArrowRight size={16} />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-white text-foreground font-medium h-12 px-8 text-sm hover:bg-muted/50 transition-colors"
          >
            Ver funcionalidades
          </a>
        </div>

        {/* Social proof */}
        <div className="mt-12 flex items-center justify-center gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle size={14} className="text-green-500" />
            Sin tarjeta de crédito
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle size={14} className="text-green-500" />
            Listo en 3 minutos
          </div>
          <div className="flex items-center gap-1.5">
            <Shield size={14} className="text-green-500" />
            Cumple LOPDP Ecuador
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="bg-slate-50 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-foreground mb-3">
              Todo lo que necesitas en un solo lugar
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Desarrollado específicamente para la realidad del sistema médico ecuatoriano.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="p-6 rounded-xl border border-border bg-white hover:shadow-card hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                  <f.icon size={20} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-foreground mb-3">Precios simples y transparentes</h2>
            <p className="text-muted-foreground">Empieza gratis, crece cuando lo necesites.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-7 flex flex-col ${
                  plan.highlight
                    ? 'border-primary bg-primary text-white shadow-elevated relative'
                    : 'border-border bg-white'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-teal-400 text-teal-900 text-xs font-bold px-3 py-1 rounded-full">
                      MÁS POPULAR
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <p className={`text-sm font-semibold mb-1 ${plan.highlight ? 'text-blue-200' : 'text-muted-foreground'}`}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold">{plan.price}</span>
                    <span className={`text-sm mb-1 ${plan.highlight ? 'text-blue-200' : 'text-muted-foreground'}`}>
                      {plan.period}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${plan.highlight ? 'text-blue-100' : 'text-muted-foreground'}`}>
                    {plan.description}
                  </p>
                </div>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle
                        size={15}
                        className={plan.highlight ? 'text-teal-300 flex-shrink-0' : 'text-green-500 flex-shrink-0'}
                      />
                      <span className={plan.highlight ? 'text-blue-50' : 'text-foreground'}>
                        {feat}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`w-full inline-flex items-center justify-center rounded-lg font-semibold h-11 text-sm transition-colors ${
                    plan.highlight
                      ? 'bg-white text-primary hover:bg-blue-50'
                      : 'bg-primary text-white hover:bg-primary/90'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="bg-primary py-20 px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          Empieza gratis hoy mismo
        </h2>
        <p className="text-blue-200 mb-8 max-w-lg mx-auto">
          Sin tarjeta de crédito. Tu consultorio listo en 3 minutos.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-lg bg-white text-primary font-semibold h-12 px-8 text-sm hover:bg-blue-50 transition-colors shadow-lg"
        >
          Crear cuenta gratis <ArrowRight size={16} />
        </Link>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Stethoscope size={12} className="text-white" />
            </div>
            <span className="font-semibold text-foreground">MediCore</span>
            <span>© 2024 Ecuador. Todos los derechos reservados.</span>
          </div>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-foreground transition-colors">Términos</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
