/**
 * Worker: social-post
 * Publica posts programados en redes sociales cuando llega su hora
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../config/redis';
import { supabaseAdmin } from '../../config/supabase';
import { checkMetaTokenExpiry } from '../schedulers/cron';

export interface SocialPostJobData {
  postId: string;
  tenantId: string;
}

async function processSocialPost(job: Job): Promise<void> {
  // Cron job: check token expiry across all tenants
  if ((job.data as Record<string, unknown>)['_cron']) {
    await checkMetaTokenExpiry();
    return;
  }

  const { postId, tenantId } = job.data as SocialPostJobData;

  const { data: post } = await supabaseAdmin
    .from('social_posts')
    .select('*')
    .eq('id', postId)
    .eq('tenant_id', tenantId)
    .single();

  if (!post) throw new Error(`Post ${postId} not found`);

  const p = post as Record<string, unknown>;

  // Only publish if still in 'programado' status
  if (p['status'] !== 'programado') return;

  const platforms = (p['platforms'] as string[]) ?? [];

  const { data: accounts } = await supabaseAdmin
    .from('social_accounts')
    .select('platform, access_token, page_id, account_id')
    .eq('tenant_id', tenantId)
    .in('platform', platforms);

  const platformPostIds: Record<string, string> = {};
  const errors: string[] = [];

  for (const account of (accounts ?? []) as Array<Record<string, string>>) {
    try {
      const pageId = account['page_id'] ?? account['account_id'];
      const accessToken = account['access_token'];
      const platform = account['platform'];

      if (platform === 'facebook' || platform === 'instagram') {
        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/feed`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: p['caption'], access_token: accessToken }),
          }
        );
        const fbData = await fbRes.json() as { id?: string; error?: { message: string } };
        if (fbData.id) {
          platformPostIds[platform] = fbData.id;
        } else {
          errors.push(`${platform}: ${fbData.error?.message ?? 'Error desconocido'}`);
        }
      }
      // TODO: TikTok, LinkedIn
    } catch {
      errors.push(`${account['platform']}: Error de conexión`);
    }
  }

  const newStatus = Object.keys(platformPostIds).length > 0 ? 'publicado' : 'error';

  await supabaseAdmin
    .from('social_posts')
    .update({
      status: newStatus,
      published_at: new Date().toISOString(),
      platform_post_ids: platformPostIds,
      ...(errors.length > 0 ? { error_message: errors.join('; ') } : {}),
    })
    .eq('id', postId);
}

export function startSocialWorker() {
  const worker = new Worker('social-post', processSocialPost, {
    connection: redis,
    concurrency: 5,
  });

  worker.on('failed', (job, err) => {
    console.error(`[social-worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
