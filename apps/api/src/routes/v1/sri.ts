/**
 * Rutas SRI Ecuador — Facturación electrónica
 * Módulo completo: configuración, certificados P12, emisión, transmisión y anulación
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import * as forge from 'node-forge';
import { authMiddleware, requireTenant } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { supabaseAdmin } from '../../config/supabase';
import { generarClaveAcceso } from '../../services/sri/clave-acceso';
import { buildFacturaXml } from '../../services/sri/xml-builder';
import type { FacturaInput } from '../../services/sri/xml-builder';
import { signXmlXadesBes, encryptP12 } from '../../services/sri/signer';
import {
  enviarDocumentoSRI,
  autorizarDocumentoSRI,
} from '../../services/sri/transmitter';
import type { SriAmbiente } from '@medicore/shared/constants';

export const sri_Router = Router();

// All SRI routes require authentication and a tenant
sri_Router.use(authMiddleware, requireTenant);

// ---------------------------------------------------------------------------
// GET / — Health check
// ---------------------------------------------------------------------------
sri_Router.get('/', (_req: Request, res: Response): void => {
  res.json({ status: 'ok', module: 'sri' });
});

// ---------------------------------------------------------------------------
// POST /configurar — Save SRI configuration for the tenant
// ---------------------------------------------------------------------------
sri_Router.post(
  '/configurar',
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth.tenantId!;

    const {
      ruc,
      razonSocial,
      nombreComercial,
      direccion,
      telefono,
      email,
      serie,
      ambiente,
    } = req.body as {
      ruc?: unknown;
      razonSocial?: unknown;
      nombreComercial?: unknown;
      direccion?: unknown;
      telefono?: unknown;
      email?: unknown;
      serie?: unknown;
      ambiente?: unknown;
    };

    // Validate required fields
    if (
      typeof ruc !== 'string' ||
      typeof razonSocial !== 'string' ||
      typeof direccion !== 'string' ||
      typeof serie !== 'string' ||
      (ambiente !== 1 && ambiente !== 2)
    ) {
      res.status(400).json({
        error: 'Campos requeridos: ruc, razonSocial, direccion, serie, ambiente (1|2)',
      });
      return;
    }

    // Validate RUC: 10 (cédula/persona natural) or 13 digits
    if (!/^\d{10}(\d{3})?$/.test(ruc)) {
      res.status(400).json({ error: 'RUC inválido — debe tener 10 o 13 dígitos' });
      return;
    }

    // Validate serie: exactly 6 digits (estab + ptoEmi)
    if (!/^\d{6}$/.test(serie)) {
      res.status(400).json({ error: 'Serie inválida — debe tener 6 dígitos (ej: 001001)' });
      return;
    }

    const updatePayload: Record<string, unknown> = {
      sri_ruc: ruc,
      sri_razon_social: razonSocial,
      sri_serie: serie,
      sri_ambiente: ambiente,
      sri_direccion: direccion,
    };

    if (typeof nombreComercial === 'string') {
      updatePayload['sri_nombre_comercial'] = nombreComercial;
    }
    if (typeof telefono === 'string') {
      updatePayload['sri_telefono'] = telefono;
    }
    if (typeof email === 'string') {
      updatePayload['sri_email'] = email;
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updatePayload)
      .eq('id', tenantId);

    if (error) {
      console.error('[SRI] Error guardando config:', error);
      res.status(500).json({ error: 'Error guardando configuración SRI' });
      return;
    }

    res.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// POST /certificado — Upload and store encrypted P12 certificate
// Encryption uses the same scheme as signer.ts (encryptP12) so that
// signXmlXadesBes can decrypt with decryptP12 using the stored credentials.
// ---------------------------------------------------------------------------
sri_Router.post(
  '/certificado',
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth.tenantId!;

    const { p12Base64, password } = req.body as {
      p12Base64?: unknown;
      password?: unknown;
    };

    if (typeof p12Base64 !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Se requieren p12Base64 y password' });
      return;
    }

    let certSubject = 'Desconocido';
    let validTo = '';

    try {
      // Validate the P12 using node-forge
      const p12Der = forge.util.decode64(p12Base64);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

      const CERT_BAG_OID = forge.pki.oids['certBag'] as string;
      const bags = p12.getBags({ bagType: CERT_BAG_OID });
      const certBag = bags[CERT_BAG_OID]?.[0];
      const cert = certBag?.cert;

      if (!cert) {
        res.status(400).json({ error: 'No se encontró certificado en el P12' });
        return;
      }

      const cnField = cert.subject.getField('CN') as { value: string } | null;
      certSubject = cnField?.value ?? 'Desconocido';
      validTo = cert.validity.notAfter.toISOString();

      // Encrypt using the same scheme as signer.ts encryptP12()
      // Key = raw first 32 bytes of P12_MASTER_KEY (NOT scrypt)
      const p12Buffer = Buffer.from(p12Der, 'binary');
      const { encryptedP12, encryptedPassword } = encryptP12(p12Buffer, password);

      // Upload encrypted P12 to Supabase Storage (bucket: sri-certificates)
      const storagePath = `${tenantId}/cert.p12.enc`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('sri-certificates')
        .upload(storagePath, encryptedP12, {
          contentType: 'application/octet-stream',
          upsert: true,
        });

      if (uploadError) {
        console.error('[SRI] Error subiendo certificado:', uploadError);
        res.status(500).json({ error: 'Error almacenando el certificado' });
        return;
      }

      // Save encrypted password and cert metadata in tenant record
      const { error: dbError } = await supabaseAdmin
        .from('tenants')
        .update({
          sri_cert_password: encryptedPassword,
          sri_cert_expiry: validTo,
          sri_cert_subject: certSubject,
        })
        .eq('id', tenantId);

      if (dbError) {
        console.error('[SRI] Error guardando metadata del cert:', dbError);
        res.status(500).json({ error: 'Error guardando metadata del certificado' });
        return;
      }

      res.json({ ok: true, subject: certSubject, validTo });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      if (
        message.includes('PKCS12') ||
        message.includes('MAC') ||
        message.includes('password') ||
        message.includes('decrypt') ||
        message.includes('integrity')
      ) {
        res.status(400).json({ error: 'Contraseña incorrecta o P12 inválido' });
        return;
      }
      console.error('[SRI] Error procesando certificado:', err);
      res.status(500).json({ error: 'Error procesando el certificado' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /configuracion — Get current SRI config (no sensitive data)
// ---------------------------------------------------------------------------
sri_Router.get(
  '/configuracion',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth.tenantId!;

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select(
        'sri_ruc, sri_razon_social, sri_nombre_comercial, sri_serie, sri_ambiente, sri_cert_expiry, sri_cert_subject, sri_cert_password, sri_direccion, sri_telefono, sri_email'
      )
      .eq('id', tenantId)
      .single();

    if (error ?? !data) {
      res.status(404).json({ error: 'Tenant no encontrado' });
      return;
    }

    const record = data as Record<string, unknown>;

    res.json({
      ruc: record['sri_ruc'] ?? null,
      razonSocial: record['sri_razon_social'] ?? null,
      nombreComercial: record['sri_nombre_comercial'] ?? null,
      direccion: record['sri_direccion'] ?? null,
      telefono: record['sri_telefono'] ?? null,
      email: record['sri_email'] ?? null,
      serie: record['sri_serie'] ?? null,
      ambiente: record['sri_ambiente'] ?? null,
      hasCert: Boolean(record['sri_cert_password']),
      certExpiry: record['sri_cert_expiry'] ?? null,
      certSubject: record['sri_cert_subject'] ?? null,
    });
  }
);

// ---------------------------------------------------------------------------
// Helper: download the encrypted P12 from Storage into a Buffer
// ---------------------------------------------------------------------------
async function downloadEncryptedP12(tenantId: string): Promise<Buffer> {
  const { data: fileData, error } = await supabaseAdmin.storage
    .from('sri-certificates')
    .download(`${tenantId}/cert.p12.enc`);

  if (error ?? !fileData) {
    throw new Error('No se pudo descargar el certificado del storage');
  }

  return Buffer.from(await fileData.arrayBuffer());
}

// ---------------------------------------------------------------------------
// POST /factura/:documentId/transmitir — Sign and transmit invoice to SRI
// ---------------------------------------------------------------------------
sri_Router.post(
  '/factura/:documentId/transmitir',
  requireRole('admin', 'secretaria'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth.tenantId!;
    const { documentId } = req.params as { documentId: string };

    // 1. Load the SRI document (must be in 'borrador' status)
    const { data: docData, error: docError } = await supabaseAdmin
      .from('sri_documents')
      .select('*')
      .eq('id', documentId)
      .eq('tenant_id', tenantId)
      .eq('status', 'borrador')
      .single();

    if (docError ?? !docData) {
      res.status(404).json({
        error: 'Documento no encontrado o no está en estado borrador',
      });
      return;
    }

    const doc = docData as Record<string, unknown>;

    // 2. Load tenant SRI config
    const { data: tenantData, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select(
        'sri_ruc, sri_razon_social, sri_nombre_comercial, sri_direccion, sri_telefono, sri_email, sri_serie, sri_ambiente, sri_secuencial, sri_cert_password'
      )
      .eq('id', tenantId)
      .single();

    if (tenantError ?? !tenantData) {
      res.status(500).json({ error: 'Error cargando configuración del tenant' });
      return;
    }

    const tenant = tenantData as Record<string, unknown>;

    // 3. Validate minimum required SRI config
    const sriRuc = tenant['sri_ruc'] as string | null;
    const sriSerie = tenant['sri_serie'] as string | null;
    const sriCertPassword = tenant['sri_cert_password'] as string | null;
    const sriRazonSocial = tenant['sri_razon_social'] as string | null;
    const sriDireccion = tenant['sri_direccion'] as string | null;

    if (!sriRuc || !sriSerie || !sriCertPassword) {
      res.status(422).json({
        error: 'Configuración SRI incompleta — falta RUC, serie o certificado P12',
      });
      return;
    }

    if (!sriRazonSocial || !sriDireccion) {
      res.status(422).json({
        error: 'Configuración SRI incompleta — falta razón social o dirección',
      });
      return;
    }

    const ambiente = ((tenant['sri_ambiente'] as number | null) ?? 1) as SriAmbiente;
    const nombreComercial = tenant['sri_nombre_comercial'] as string | undefined;
    const sriTelefono = tenant['sri_telefono'] as string | undefined;
    const sriEmail = tenant['sri_email'] as string | undefined;

    // 4. Atomic secuencial increment — optimistic locking previene duplicados en concurrencia
    const prevSecuencial = (tenant['sri_secuencial'] as number | null) ?? 0;
    const nextSecuencial = prevSecuencial + 1;

    const { data: updatedTenants, error: seqError } = await supabaseAdmin
      .from('tenants')
      .update({ sri_secuencial: nextSecuencial })
      .eq('id', tenantId)
      .eq('sri_secuencial', prevSecuencial)   // Condición atómica: falla si ya fue incrementado
      .select('sri_secuencial');

    if (seqError) {
      console.error('[SRI] Error actualizando secuencial:', seqError);
      res.status(500).json({ error: 'Error generando secuencial' });
      return;
    }

    if (!updatedTenants || updatedTenants.length === 0) {
      res.status(409).json({
        error: 'Conflicto al generar secuencial — otra solicitud procesó simultáneamente. Reintente.',
        code: 'SECUENCIAL_CONFLICT',
      });
      return;
    }

    const secuencial = String(nextSecuencial).padStart(9, '0');

    // 5. Determine emission date
    const fechaEmision = new Date(
      typeof doc['fecha_emision'] === 'string' ? doc['fecha_emision'] : Date.now()
    );

    // 6. Generate clave de acceso
    const claveAcceso = generarClaveAcceso({
      fechaEmision,
      tipoComprobante: 'factura',
      ruc: sriRuc,
      ambiente,
      serie: sriSerie,
      secuencial,
      codigoNumerico: Math.floor(Math.random() * 99999999).toString().padStart(8, '0'),
    });

    // 7. Build the tenant config for the XML builder
    const tenantXmlConfig = {
      ruc: sriRuc,
      razonSocial: sriRazonSocial,
      ...(nombreComercial !== undefined && nombreComercial !== null
        ? { nombreComercial }
        : {}),
      direccion: sriDireccion,
      ...(sriTelefono !== undefined && sriTelefono !== null
        ? { telefono: sriTelefono }
        : {}),
      ...(sriEmail !== undefined && sriEmail !== null
        ? { email: sriEmail }
        : {}),
      serie: sriSerie,
      ambiente,
    };

    // 8. Extract buyer and items from the document
    const buyer = doc['buyer'] as FacturaInput['buyer'] | undefined;
    const items = doc['items'] as FacturaInput['items'] | undefined;

    if (!buyer || !items || items.length === 0) {
      res.status(422).json({ error: 'Documento sin datos de comprador o ítems' });
      return;
    }

    const facturaInput: FacturaInput = {
      claveAcceso,
      fechaEmision,
      secuencial,
      tenant: tenantXmlConfig,
      buyer,
      items,
      paymentMethod: (doc['payment_method'] as string | undefined) ?? 'efectivo',
      paymentDeadlineDays: (doc['payment_deadline_days'] as number | undefined) ?? 0,
    };

    const xmlString = buildFacturaXml(facturaInput);

    // 9. Download encrypted P12 and sign with XAdES-BES
    // signXmlXadesBes uses decryptP12() internally, which expects:
    //   - encryptedP12: Buffer with format iv(16) + ciphertext (as stored in Storage)
    //   - encryptedPassword: base64(iv + ciphertext) (as stored in DB)
    let signedXml: string;

    try {
      const encryptedP12Buffer = await downloadEncryptedP12(tenantId);

      const signResult = await signXmlXadesBes(xmlString, {
        encryptedP12: encryptedP12Buffer,
        encryptedPassword: sriCertPassword,
      });

      signedXml = signResult.signedXml;
    } catch (signErr) {
      console.error('[SRI] Error firmando XML:', signErr);
      res.status(500).json({
        error: 'Error firmando el documento',
        detail: signErr instanceof Error ? signErr.message : 'Error desconocido',
      });
      return;
    }

    // 10. Transmit to SRI reception WS
    const transmissionResult = await enviarDocumentoSRI(signedXml, ambiente, claveAcceso);

    // 11. Store transmission log in sri_transmissions
    const { error: txLogError } = await supabaseAdmin.from('sri_transmissions').insert({
      tenant_id: tenantId,
      document_id: documentId,
      clave_acceso: claveAcceso,
      ambiente,
      request_xml: signedXml,
      response_xml: transmissionResult.responseXml ?? null,
      estado: transmissionResult.estado ?? null,
      success: transmissionResult.success,
      error_message: transmissionResult.errorMessage ?? null,
      duration_ms: transmissionResult.durationMs,
    });

    if (txLogError) {
      console.warn('[SRI] No se pudo guardar log de transmisión:', txLogError);
    }

    if (!transmissionResult.success) {
      await supabaseAdmin
        .from('sri_documents')
        .update({
          status: 'error',
          sri_response: transmissionResult.responseXml ?? null,
          clave_acceso: claveAcceso,
          secuencial,
          xml_generated: signedXml,
        })
        .eq('id', documentId);

      res.status(502).json({
        ok: false,
        error: 'El SRI no recibió el documento',
        detail: transmissionResult.errorMessage ?? transmissionResult.estado,
      });
      return;
    }

    // 12. If RECIBIDA — query authorization immediately
    const estadoEnvio = transmissionResult.estado ?? 'RECIBIDA';
    let finalStatus = 'enviado';
    let autorizacion:
      | { estado: string; numeroAutorizacion?: string; fechaAutorizacion?: string }
      | undefined;

    if (estadoEnvio === 'RECIBIDA') {
      const authResult = await autorizarDocumentoSRI(claveAcceso, ambiente);
      const firstAuth = authResult.autorizaciones?.[0]?.autorizacion;

      if (firstAuth) {
        finalStatus = firstAuth.estado === 'AUTORIZADO' ? 'autorizado' : 'rechazado';
        autorizacion = {
          estado: firstAuth.estado,
          ...(firstAuth.numeroAutorizacion !== undefined
            ? { numeroAutorizacion: firstAuth.numeroAutorizacion }
            : {}),
          ...(firstAuth.fechaAutorizacion !== undefined
            ? { fechaAutorizacion: firstAuth.fechaAutorizacion }
            : {}),
        };
      }
    }

    // 13. Update sri_document with final status and authorization data
    const docUpdate: Record<string, unknown> = {
      status: finalStatus,
      clave_acceso: claveAcceso,
      secuencial,
      xml_generated: signedXml,
      sri_response: transmissionResult.responseXml ?? null,
    };

    if (autorizacion?.numeroAutorizacion !== undefined) {
      docUpdate['authorization_number'] = autorizacion.numeroAutorizacion;
    }
    if (autorizacion?.fechaAutorizacion !== undefined) {
      docUpdate['authorization_date'] = autorizacion.fechaAutorizacion;
    }

    await supabaseAdmin
      .from('sri_documents')
      .update(docUpdate)
      .eq('id', documentId);

    res.json({
      ok: true,
      status: finalStatus,
      claveAcceso,
      ...(autorizacion !== undefined ? { autorizacion } : {}),
    });
  }
);

// ---------------------------------------------------------------------------
// GET /factura/:documentId/estado — Check authorization status from SRI
// ---------------------------------------------------------------------------
sri_Router.get(
  '/factura/:documentId/estado',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth.tenantId!;
    const { documentId } = req.params as { documentId: string };

    const { data: docData, error: docError } = await supabaseAdmin
      .from('sri_documents')
      .select('id, status, clave_acceso, sri_ambiente')
      .eq('id', documentId)
      .eq('tenant_id', tenantId)
      .single();

    if (docError ?? !docData) {
      res.status(404).json({ error: 'Documento no encontrado' });
      return;
    }

    const doc = docData as Record<string, unknown>;
    const claveAcceso = doc['clave_acceso'] as string | null;

    if (!claveAcceso) {
      res.status(422).json({
        error: 'El documento no tiene clave de acceso — no ha sido enviado al SRI',
      });
      return;
    }

    // Get ambiente from tenant (fallback to document field if present)
    const { data: tenantAmbData } = await supabaseAdmin
      .from('tenants')
      .select('sri_ambiente')
      .eq('id', tenantId)
      .single();

    const ambiente = (
      ((tenantAmbData as Record<string, unknown> | null)?.['sri_ambiente'] as number | null) ?? 1
    ) as SriAmbiente;

    const authResult = await autorizarDocumentoSRI(claveAcceso, ambiente);
    const firstAuth = authResult.autorizaciones?.[0]?.autorizacion;

    if (firstAuth) {
      const newStatus = firstAuth.estado === 'AUTORIZADO' ? 'autorizado' : 'rechazado';
      const updatePayload: Record<string, unknown> = { status: newStatus };

      if (firstAuth.numeroAutorizacion !== undefined) {
        updatePayload['authorization_number'] = firstAuth.numeroAutorizacion;
      }
      if (firstAuth.fechaAutorizacion !== undefined) {
        updatePayload['authorization_date'] = firstAuth.fechaAutorizacion;
      }

      await supabaseAdmin
        .from('sri_documents')
        .update(updatePayload)
        .eq('id', documentId);

      res.json({
        ok: true,
        status: newStatus,
        claveAcceso,
        autorizacion: {
          estado: firstAuth.estado,
          ...(firstAuth.numeroAutorizacion !== undefined
            ? { numeroAutorizacion: firstAuth.numeroAutorizacion }
            : {}),
          ...(firstAuth.fechaAutorizacion !== undefined
            ? { fechaAutorizacion: firstAuth.fechaAutorizacion }
            : {}),
        },
      });
      return;
    }

    res.json({
      ok: true,
      status: doc['status'] ?? 'desconocido',
      claveAcceso,
      sriResponse: authResult.responseXml ?? null,
    });
  }
);

// ---------------------------------------------------------------------------
// POST /factura/:documentId/anular — Void a document
// ---------------------------------------------------------------------------
sri_Router.post(
  '/factura/:documentId/anular',
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth.tenantId!;
    const { documentId } = req.params as { documentId: string };

    const { data: docData, error: docError } = await supabaseAdmin
      .from('sri_documents')
      .select('id, status')
      .eq('id', documentId)
      .eq('tenant_id', tenantId)
      .single();

    if (docError ?? !docData) {
      res.status(404).json({ error: 'Documento no encontrado' });
      return;
    }

    const doc = docData as Record<string, unknown>;
    const currentStatus = doc['status'] as string;

    if (currentStatus !== 'borrador' && currentStatus !== 'rechazado') {
      res.status(422).json({
        error: `No se puede anular un documento en estado '${currentStatus}' — solo borrador o rechazado`,
      });
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from('sri_documents')
      .update({ status: 'anulado' })
      .eq('id', documentId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('[SRI] Error anulando documento:', updateError);
      res.status(500).json({ error: 'Error anulando el documento' });
      return;
    }

    res.json({ ok: true });
  }
);
