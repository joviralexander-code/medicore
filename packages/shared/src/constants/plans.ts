export const PLAN_TIERS = ['free', 'pro', 'clinica', 'enterprise'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PLAN_CONFIG = {
  free: {
    name: 'Free',
    priceUsd: 0,
    maxDoctors: 1,
    maxInvoicesPerMonth: 10,
    features: {
      customDomain: false,
      dataBusiness: false,
      apiAccess: false,
      whatsapp: false,
      socialMedia: false,
      multiDoctor: false,
    },
  },
  pro: {
    name: 'Pro',
    priceUsd: 29,
    maxDoctors: 1,
    maxInvoicesPerMonth: null, // unlimited
    features: {
      customDomain: false,
      dataBusiness: false,
      apiAccess: false,
      whatsapp: true,
      socialMedia: true,
      multiDoctor: false,
    },
  },
  clinica: {
    name: 'Clínica',
    priceUsd: 79,
    maxDoctors: 10,
    maxInvoicesPerMonth: null,
    features: {
      customDomain: true,
      dataBusiness: true,
      apiAccess: false,
      whatsapp: true,
      socialMedia: true,
      multiDoctor: true,
    },
  },
  enterprise: {
    name: 'Enterprise',
    priceUsd: 199,
    maxDoctors: null, // unlimited
    maxInvoicesPerMonth: null,
    features: {
      customDomain: true,
      dataBusiness: true,
      apiAccess: true,
      whatsapp: true,
      socialMedia: true,
      multiDoctor: true,
    },
  },
} as const satisfies Record<PlanTier, {
  name: string;
  priceUsd: number;
  maxDoctors: number | null;
  maxInvoicesPerMonth: number | null;
  features: Record<string, boolean>;
}>;
