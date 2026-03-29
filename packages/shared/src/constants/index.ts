export * from './plans';
export * from './roles';
export * from './sri';

export const APP_NAME = 'MediCore';
export const APP_DOMAIN = 'plexomed.com';
export const SUPPORT_EMAIL = 'soporte@plexomed.com';

/** Grupos etarios para anonimización LOPDP */
export const AGE_GROUPS = [
  { label: '0-18', min: 0, max: 18 },
  { label: '19-35', min: 19, max: 35 },
  { label: '36-50', min: 36, max: 50 },
  { label: '51-65', min: 51, max: 65 },
  { label: '65+', min: 66, max: 999 },
] as const;

/** Farmacias para scraping */
export const PHARMACY_CHAINS = [
  'fybeca',
  'cruz_azul',
  'sana_sana',
  'pharmacys',
  'medicity',
] as const;
export type PharmacyChain = (typeof PHARMACY_CHAINS)[number];

/** TTL de caché Redis en segundos */
export const CACHE_TTL = {
  PHARMACY_PERIODIC: 6 * 60 * 60,    // 6 horas
  PHARMACY_ON_DEMAND: 30 * 60,        // 30 minutos
  SOCIAL_STATS: 60 * 60,              // 1 hora (TikTok rate limits)
  CIE10_SEARCH: 24 * 60 * 60,         // 24 horas (datos estáticos)
  TENANT_CONFIG: 5 * 60,              // 5 minutos
} as const;

/** k-anonimidad mínima para Data Business */
export const K_ANONYMITY_MIN = 5;

/** Días de aviso antes de expiración del token Meta */
export const META_TOKEN_WARNING_DAYS = 7;
