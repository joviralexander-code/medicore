/**
 * Cron jobs BullMQ
 * Registrar al arrancar el servidor
 */

import { queues } from '../queues';
import { supabaseAdmin } from '../../config/supabase';

export async function registerCronJobs(): Promise<void> {
  // Scraping farmacias: cada 6 horas
  await queues.pharmacy.add(
    'scrape-all-periodic',
    {},
    {
      repeat: { pattern: '0 */6 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 20 },
    }
  );
  console.log('[cron] Registered: pharmacy-scrape every 6h');

  // Recordatorios de citas: cada 30 minutos
  // (el reminder-worker ya verifica si faltan 24h o 1h por cada cita pendiente)
  await queues.reminder.add(
    'scan-upcoming-appointments',
    {},
    {
      repeat: { pattern: '*/30 * * * *' },
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 10 },
    }
  );
  console.log('[cron] Registered: reminder-scan every 30min');

  // Meta token expiry check: diario a las 09:00 Ecuador (UTC-5 → 14:00 UTC)
  await queues.social.add(
    'check-meta-token-expiry',
    { _cron: true },
    {
      repeat: { pattern: '0 14 * * *' },
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 10 },
    }
  );
  console.log('[cron] Registered: meta-token-expiry-check daily at 09:00 ECT');
}

/**
 * Verifica cuentas sociales Meta cuyo access_token expira en <= 7 días
 * Se llama desde el social-worker cuando recibe el job check-meta-token-expiry
 */
export async function checkMetaTokenExpiry(): Promise<void> {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiring } = await supabaseAdmin
    .from('social_accounts')
    .select('id, tenant_id, platform, account_name, token_expires_at')
    .in('platform', ['facebook', 'instagram'])
    .lte('token_expires_at', sevenDaysFromNow)
    .gt('token_expires_at', new Date().toISOString()); // No expirados aún

  if (!expiring?.length) return;

  for (const account of expiring as Array<Record<string, string>>) {
    const expiresAt = account['token_expires_at'] ?? '';
    const daysLeft = Math.floor(
      (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    console.warn(
      `[cron] Meta token expiring in ${daysLeft}d — tenant=${account['tenant_id']} platform=${account['platform']} account=${account['account_name']}`
    );

    // Insertar notificación interna para que el admin la vea en la UI
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: account['tenant_id'],
      action: 'social_token_expiring',
      resource_type: 'social_accounts',
      resource_id: account['id'],
      new_data: { platform: account['platform'], days_left: daysLeft },
    });
  }
}
