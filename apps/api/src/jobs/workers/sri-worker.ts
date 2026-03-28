/**
 * Worker: sri-transmit
 * Envía documentos electrónicos al SRI Ecuador de forma asíncrona
 * Retry automático con backoff exponencial (3 intentos)
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../config/redis';
import { supabaseAdmin } from '../../config/supabase';
import { buildFacturaXml } from '../../services/sri/xml-builder';
import { signXmlXadesBes } from '../../services/sri/signer';
import { enviarDocumentoSRI, autorizarDocumentoSRI } from '../../services/sri/transmitter';
import { generateRidePdf } from '../../services/sri/ride-generator';
import type { FacturaInput } from '../../services/sri/xml-builder';
import type { RideInput } from '../../services/sri/ride-generator';

export interface SriTransmitJobData {
  documentId: string;
  tenantId: string;
}

async function processSriTransmit(job: Job): Promise<void> {
  const { documentId, tenantId } = job.data as SriTransmitJobData;

  // Fetch document with tenant SRI config
  const { data: doc, error: docErr } = await supabaseAdmin
    .from('sri_documents')
    .select(`
      *,
      tenants(
        name, sri_ruc, sri_razon_social, sri_cert_p12, sri_cert_password,
        sri_ambiente, sri_serie, settings
      )
    `)
    .eq('id', documentId)
    .eq('tenant_id', tenantId)
    .single();

  if (docErr ?? !doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  const d = doc as Record<string, unknown>;
  const tenant = d['tenants'] as Record<string, unknown> | null;

  if (!tenant?.['sri_ruc']) {
    throw new Error('Tenant SRI config incompleta (RUC faltante)');
  }

  const ambiente = (tenant['sri_ambiente'] as 1 | 2) ?? 1;

  // Log transmission attempt
  const attemptNum = job.attemptsMade + 1;
  const { data: transmission } = await supabaseAdmin
    .from('sri_transmissions')
    .insert({
      tenant_id: tenantId,
      document_id: documentId,
      attempt: attemptNum,
      transmitted_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  const transmissionId = (transmission as Record<string, string> | null)?.['id'];
  const startMs = Date.now();

  try {
    // Build XML
    const facturaInput: FacturaInput = {
      claveAcceso: d['clave_acceso'] as string,
      fechaEmision: new Date(d['created_at'] as string),
      secuencial: d['secuencial'] as string,
      tenant: {
        ruc: tenant['sri_ruc'] as string,
        razonSocial: tenant['sri_razon_social'] as string,
        direccion: (tenant['settings'] as Record<string, string> | null)?.['direccion'] ?? 'Sin dirección',
        serie: tenant['sri_serie'] as string,
        ambiente,
      },
      buyer: {
        idType: d['buyer_id_type'] as 'cedula' | 'ruc' | 'pasaporte' | 'consumidor_final',
        id: d['buyer_id'] as string,
        name: d['buyer_name'] as string,
        ...(d['buyer_email'] != null ? { email: d['buyer_email'] as string } : {}),
      },
      items: d['items'] as FacturaInput['items'],
      paymentMethod: d['payment_method'] as string,
      paymentDeadlineDays: 0,
    };

    const xml = buildFacturaXml(facturaInput);

    // Sign XML (decrypt P12 from DB)
    const p12Encrypted = tenant['sri_cert_p12'] as Buffer | null;
    const p12Password = tenant['sri_cert_password'] as string | null;

    if (!p12Encrypted || !p12Password) {
      throw new Error('Certificado P12 no configurado');
    }

    const { signedXml } = await signXmlXadesBes(xml, {
      encryptedP12: p12Encrypted,
      encryptedPassword: p12Password,
    });

    // Update document with XML
    await supabaseAdmin
      .from('sri_documents')
      .update({ xml_generated: signedXml, status: 'firmado' })
      .eq('id', documentId);

    // Send to SRI
    const claveAcceso = d['clave_acceso'] as string;
    const envioResult = await enviarDocumentoSRI(signedXml, ambiente, claveAcceso);

    await supabaseAdmin
      .from('sri_transmissions')
      .update({
        request_xml: signedXml,
        response_xml: envioResult.responseXml,
        status_code: envioResult.estado === 'RECIBIDA' ? 200 : 400,
        duration_ms: Date.now() - startMs,
      })
      .eq('id', transmissionId ?? '');

    if (envioResult.estado !== 'RECIBIDA') {
      const errorMsg = envioResult.errorMessage ?? 'Error SRI';
      await supabaseAdmin
        .from('sri_documents')
        .update({ status: 'rechazado', sri_response: envioResult })
        .eq('id', documentId);
      throw new Error(`SRI rechazó: ${errorMsg}`);
    }

    // Authorize
    await supabaseAdmin
      .from('sri_documents')
      .update({ status: 'enviado' })
      .eq('id', documentId);

    // Wait a bit then authorize
    await new Promise<void>((r) => setTimeout(r, 3000));

    const authResult = await autorizarDocumentoSRI(claveAcceso, ambiente);

    const firstAuth = authResult.autorizaciones?.[0]?.autorizacion;
    if (authResult.success && firstAuth?.estado === 'AUTORIZADO' && firstAuth.numeroAutorizacion) {
      const authNum = firstAuth.numeroAutorizacion;
      const authDate = firstAuth.fechaAutorizacion;

      await supabaseAdmin
        .from('sri_documents')
        .update({
          status: 'autorizado',
          authorization_number: authNum,
          authorization_date: authDate,
          sri_response: authResult,
        })
        .eq('id', documentId);

      // Generate RIDE PDF
      try {
        const rideInput: RideInput = {
          docType: d['doc_type'] as RideInput['docType'],
          claveAcceso: d['clave_acceso'] as string,
          authorizationNumber: authNum,
          authorizationDate: authDate ? new Date(authDate) : new Date(),
          ambiente,
          serie: d['serie'] as string,
          secuencial: d['secuencial'] as string,
          issuedAt: new Date(d['created_at'] as string),
          tenant: {
            ruc: tenant['sri_ruc'] as string,
            razonSocial: tenant['sri_razon_social'] as string,
          },
          buyer: {
            idType: d['buyer_id_type'] as string,
            id: d['buyer_id'] as string,
            name: d['buyer_name'] as string,
            ...(d['buyer_email'] != null ? { email: d['buyer_email'] as string } : {}),
          },
          items: (d['items'] as Array<Record<string, unknown>>).map((item) => ({
            descripcion: item['descripcion'] as string,
            cantidad: item['cantidad'] as number,
            precioUnitario: item['precio_unitario'] as number,
            descuento: (item['descuento'] as number) ?? 0,
            subtotal: (item['cantidad'] as number) * (item['precio_unitario'] as number) - ((item['descuento'] as number) ?? 0),
            ivaPct: (item['iva_pct'] as number) ?? 0,
          })),
          subtotal0: (d['subtotal_0'] as number) ?? 0,
          subtotal12: (d['subtotal_12'] as number) ?? 0,
          subtotal15: (d['subtotal_15'] as number) ?? 0,
          iva12: (d['iva_12'] as number) ?? 0,
          iva15: (d['iva_15'] as number) ?? 0,
          total: d['total'] as number,
          paymentMethod: d['payment_method'] as string,
        };

        const ridePdf = await generateRidePdf(rideInput);
        const ridePath = `${tenantId}/rides/${documentId}.pdf`;

        await supabaseAdmin.storage
          .from('documents')
          .upload(ridePath, ridePdf, { contentType: 'application/pdf', upsert: true });

        const { data: { publicUrl } } = supabaseAdmin.storage.from('documents').getPublicUrl(ridePath);

        await supabaseAdmin
          .from('sri_documents')
          .update({ ride_url: publicUrl })
          .eq('id', documentId);
      } catch (rideErr) {
        // RIDE failure is non-blocking
        console.error(`[sri-worker] RIDE generation failed for ${documentId}:`, rideErr);
      }
    } else {
      await supabaseAdmin
        .from('sri_documents')
        .update({ status: 'rechazado', sri_response: authResult })
        .eq('id', documentId);
      throw new Error(`SRI no autorizó: ${firstAuth?.estado ?? authResult.errorMessage ?? 'desconocido'}`);
    }
  } catch (err) {
    // Update transmission record with error
    if (transmissionId) {
      await supabaseAdmin
        .from('sri_transmissions')
        .update({
          error_message: String(err),
          duration_ms: Date.now() - startMs,
        })
        .eq('id', transmissionId);
    }
    throw err; // Re-throw for BullMQ retry
  }
}

export function startSriWorker() {
  const worker = new Worker('sri-transmit', processSriTransmit, {
    connection: redis,
    concurrency: 3,
    // Backoff exponencial: 30s, 60s, 120s
    settings: {
      backoffStrategy: (attemptsMade: number) => Math.min(30000 * Math.pow(2, attemptsMade - 1), 300000),
    },
  });

  worker.on('completed', (job) => {
    console.log(`[sri-worker] Document ${(job.data as SriTransmitJobData).documentId} authorized`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[sri-worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });

  return worker;
}
