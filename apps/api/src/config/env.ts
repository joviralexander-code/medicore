import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Supabase — service_role SOLO en el backend, nunca en web
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // JWT secret is optional — auth uses supabaseAdmin.auth.getUser() instead
  SUPABASE_JWT_SECRET: z.string().optional(),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // SRI Ecuador
  SRI_CERT_ENCRYPTION_KEY: z.string().min(32),
  SRI_AMBIENTE_DEFAULT: z.coerce.number().int().min(1).max(2).default(1),

  // Stripe (optional — not needed for SRI module)
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_CLINICA: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),

  // PayPhone (optional)
  PAYPHONE_TOKEN: z.string().optional(),
  PAYPHONE_STORE_ID: z.string().optional(),

  // Claude AI (optional)
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),

  // Resend Email (optional)
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  RESEND_FROM: z.string().email().optional(),

  // Meta (optional)
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  // TikTok (optional)
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),

  // LinkedIn (optional)
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),

  // WhatsApp Business API (optional)
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  // Encryption
  P12_MASTER_KEY: z.string().min(32),

  // App
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().default('plexomed.com'),
  API_CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Variables de entorno inválidas:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = parseEnv();
