/**
 * Worker: data-etl
 * Ejecuta el pipeline ETL de anonimización bajo demanda
 * Genera el archivo (CSV o JSON), lo sube a Storage y registra el export
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../config/redis';
import { supabaseAdmin } from '../../config/supabase';
import { runEtlPipeline, toCSV, toAggregated, type EtlFilters } from '../../services/anonymization/etl';

export interface EtlJobData {
  exportId: string;      // ID del registro en data_exports a actualizar
  tenantId: string;
  buyerId: string;
  format: 'csv' | 'json';
  filters: EtlFilters;
}

async function processEtl(job: Job): Promise<void> {
  const { exportId, tenantId, buyerId, format, filters } = job.data as EtlJobData;

  // Mark export as processing
  await supabaseAdmin
    .from('data_exports')
    .update({ status: 'processing' })
    .eq('id', exportId);

  let result;
  try {
    result = await runEtlPipeline({ ...filters, tenantId });
  } catch (err) {
    await supabaseAdmin
      .from('data_exports')
      .update({ status: 'error', error_message: String(err) })
      .eq('id', exportId);
    throw err;
  }

  if (!result.valid) {
    const msg = `k-anonymity violation: k=${result.k} < 5. Suppressed ${result.suppressedCount} records.`;
    await supabaseAdmin
      .from('data_exports')
      .update({ status: 'error', error_message: msg })
      .eq('id', exportId);
    throw new Error(msg);
  }

  // Generate file content
  let fileContent: string;
  let contentType: string;
  let fileExt: string;

  if (format === 'csv') {
    fileContent = toCSV(result.records);
    contentType = 'text/csv';
    fileExt = 'csv';
  } else {
    fileContent = JSON.stringify(toAggregated(result.records), null, 2);
    contentType = 'application/json';
    fileExt = 'json';
  }

  const filePath = `exports/${buyerId}/${exportId}.${fileExt}`;
  const fileBuffer = Buffer.from(fileContent, 'utf-8');

  await supabaseAdmin.storage
    .from('data-exports')
    .upload(filePath, fileBuffer, { contentType, upsert: true });

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('data-exports')
    .getPublicUrl(filePath);

  await supabaseAdmin
    .from('data_exports')
    .update({
      status: 'completed',
      record_count: result.totalSafe,
      file_url: publicUrl,
    })
    .eq('id', exportId);

  console.log(`[etl-worker] Export ${exportId}: ${result.totalSafe} records (${format}) for buyer ${buyerId}`);
}

export function startEtlWorker() {
  const worker = new Worker('data-etl', processEtl, {
    connection: redis,
    concurrency: 2,  // ETL es pesado — limitar concurrencia
  });

  worker.on('completed', (job) => {
    const d = job.data as EtlJobData;
    console.log(`[etl-worker] Export ${d.exportId} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[etl-worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
