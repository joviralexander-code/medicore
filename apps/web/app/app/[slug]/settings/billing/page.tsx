import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ManageBillingButton } from '@/components/settings/manage-billing-button';
import { PayphoneCheckoutButton } from '@/components/settings/payphone-checkout-button';

export const metadata: Metadata = { title: 'Plan y facturación' };

interface Props {
  params: Promise<{ slug: string }>;
}

const PLANS = [
  {
    tier: 'free',
    name: 'Gratis',
    price: '$0',
    period: '',
    description: 'Para probar la plataforma',
    features: [
      '1 médico',
      'Hasta 50 pacientes',
      'Agenda básica',
      'Portal del paciente',
      '10 facturas SRI / mes',
    ],
    highlight: false,
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/mes',
    description: 'Para consultorios independientes',
    features: [
      '1 médico',
      'Pacientes ilimitados',
      'Módulo financiero',
      'Recetas digitales con PDF',
      '200 facturas SRI / mes',
      'Portal + agendamiento online',
      'Precios de farmacias',
    ],
    highlight: true,
  },
  {
    tier: 'clinica',
    name: 'Clínica',
    price: '$129',
    period: '/mes',
    description: 'Para clínicas y grupos médicos',
    features: [
      'Hasta 10 médicos',
      'Todo lo de Pro',
      'Multi-médico en agenda',
      'Data business (ingresos extra)',
      'Reportes avanzados',
      'Facturas SRI ilimitadas',
      'Soporte prioritario',
    ],
    highlight: false,
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    price: 'A medida',
    period: '',
    description: 'Hospitales y redes de clínicas',
    features: [
      'Médicos ilimitados',
      'Todo lo de Clínica',
      'SLA garantizado',
      'Integraciones custom',
      'Facturación anual con descuento',
    ],
    highlight: false,
  },
];

export default async function BillingSettingsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect(`/app/${slug}/dashboard`);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, plan_tier, status, stripe_customer_id, stripe_subscription_id, invoices_this_month, invoices_reset_at')
    .eq('slug', slug)
    .single();

  const currentTier = tenant?.plan_tier ?? 'free';
  const isTrial = tenant?.status === 'trial';

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/app/${slug}/settings`} className="hover:text-gray-900 transition-colors">
          Configuración
        </Link>
        <span>›</span>
        <span className="text-gray-900">Plan y facturación</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plan y facturación</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gestiona tu suscripción a MediCore Ecuador
        </p>
      </div>

      {/* Current plan summary */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <p className="font-semibold text-white text-sm">📋 Tu plan actual</p>
        </div>
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold capitalize text-gray-900">{currentTier}</span>
                {isTrial && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    Periodo de prueba
                  </span>
                )}
                {tenant?.status === 'active' && currentTier !== 'free' && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Activo
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Facturas SRI este mes: <strong>{tenant?.invoices_this_month ?? 0}</strong>
              </p>
            </div>
            {tenant?.stripe_subscription_id && (
              <ManageBillingButton tenantId={tenant.id} />
            )}
          </div>
        </div>
      </div>

      {/* Plans grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Planes disponibles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            return (
              <div
                key={plan.tier}
                className={`relative rounded-xl border p-5 flex flex-col space-y-4 ${
                  plan.highlight
                    ? 'border-[#1E40AF] shadow-md ring-1 ring-[#1E40AF]/20'
                    : 'border-gray-200'
                } ${isCurrent ? 'bg-blue-50/50' : 'bg-white'}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-xs px-3 py-1 rounded-full font-medium">
                      Más popular
                    </span>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 right-4">
                    <span className="bg-green-600 text-white text-xs px-3 py-1 rounded-full font-medium">
                      Plan actual
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-bold text-gray-900">{plan.name}</p>
                  <div className="flex items-baseline gap-0.5 mt-1">
                    <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
                    {plan.period && (
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                </div>

                <ul className="space-y-1.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-700">
                      <span className="text-green-600 mt-0.5">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.tier === 'enterprise' ? (
                  <a
                    href="mailto:ventas@medicore.ec"
                    className="block text-center text-sm font-medium py-2 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    Contactar ventas
                  </a>
                ) : isCurrent ? (
                  <div className="text-center text-sm text-muted-foreground py-2">
                    Plan actual
                  </div>
                ) : (
                  <div className="space-y-2">
                    <UpgradeButton
                      slug={slug}
                      tier={plan.tier}
                      currentTier={currentTier}
                      tenantId={tenant?.id ?? ''}
                    />
                    {(plan.tier === 'pro' || plan.tier === 'clinica') && (
                      <PayphoneCheckoutButton
                        tier={plan.tier}
                        tenantId={tenant?.id ?? ''}
                        slug={slug}
                        label="Pagar con PayPhone (Ecuador)"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PayPhone note */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm text-amber-800">
          <strong>Pago en Ecuador:</strong> Los botones azules usan PayPhone — acepta tarjetas
          Visa/Mastercard, Dinners y billeteras electrónicas emitidas en Ecuador. Los botones
          oscuros usan Stripe para tarjetas internacionales.
        </p>
      </div>
    </div>
  );
}

function UpgradeButton({
  slug,
  tier,
  currentTier,
  tenantId,
}: {
  slug: string;
  tier: string;
  currentTier: string;
  tenantId: string;
}) {
  const tierOrder = ['free', 'pro', 'clinica', 'enterprise'];
  const isUpgrade = tierOrder.indexOf(tier) > tierOrder.indexOf(currentTier);
  const label = isUpgrade ? 'Actualizar' : 'Cambiar plan';

  return (
    <form action={`/api/billing/checkout`} method="POST">
      <input type="hidden" name="tier" value={tier} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        className={`w-full text-sm font-medium py-2 px-4 rounded-lg transition-colors ${
          isUpgrade
            ? 'bg-primary hover:bg-primary/90 text-white'
            : 'border border-gray-300 hover:bg-gray-50 text-gray-700'
        }`}
      >
        {label}
      </button>
    </form>
  );
}
