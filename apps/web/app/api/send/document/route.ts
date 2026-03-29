/**
 * POST /api/send/document
 * Envía por email un documento médico (factura, certificado, receta)
 * con PDF adjunto generado on-demand.
 *
 * Body: { type: 'certificate' | 'prescription' | 'invoice', id: string, email: string }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Email HTML templates
// ---------------------------------------------------------------------------

function emailHtml(opts: {
  tenantName: string;
  title: string;
  body: string;
  patientName: string;
  verificationCode?: string;
  appUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:#1E40AF;padding:28px 40px">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700">${opts.tenantName}</p>
          <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px">${opts.title}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 40px">
          <p style="margin:0 0 16px;color:#374151;font-size:15px">Estimado/a <strong>${opts.patientName}</strong>,</p>
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6">${opts.body}</p>
          <p style="margin:0 0 8px;color:#6b7280;font-size:13px">Encuentre el documento adjunto en este correo.</p>
          ${opts.verificationCode ? `
          <div style="margin:24px 0;padding:16px;background:#f0f9ff;border-radius:8px;border-left:4px solid #0ea5e9">
            <p style="margin:0;color:#0369a1;font-size:12px;font-weight:600">CÓDIGO DE VERIFICACIÓN</p>
            <p style="margin:4px 0 0;color:#0c4a6e;font-size:18px;font-weight:700;letter-spacing:2px">${opts.verificationCode}</p>
          </div>` : ''}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e5e7eb">
          <p style="margin:0;color:#9ca3af;font-size:12px">${opts.tenantName} · Documento generado automáticamente</p>
          <p style="margin:4px 0 0;color:#9ca3af;font-size:11px">Este es un correo automático, por favor no responda a este mensaje.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF fetchers
// ---------------------------------------------------------------------------

async function fetchCertificatePdf(id: string, baseUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`${baseUrl}/api/certificates/${id}/pdf`, {
      headers: { 'Cookie': '' }, // internal call
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

type DocType = 'certificate' | 'prescription' | 'invoice';

interface SendBody {
  type: DocType;
  id: string;
  email: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as SendBody;
  const { type, id, email } = body;

  if (!type || !id || !email) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
  }

  const RESEND_API_KEY = process.env['RESEND_API_KEY'];
  const FROM_EMAIL = process.env['RESEND_FROM'] ?? 'noreply@plexomed.com';
  const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://plexomed.com';

  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'Servicio de email no configurado. Configure RESEND_API_KEY.' }, { status: 503 });
  }

  // ── CERTIFICATE ────────────────────────────────────────────────────────────
  if (type === 'certificate') {
    const { data: cert } = await supabase
      .from('medical_certificates')
      .select(`
        id, certificate_type, certificate_number, verification_code, content,
        patient:patients(first_name, last_name, email),
        tenant:tenants(name)
      `)
      .eq('id', id)
      .single();

    if (!cert) return NextResponse.json({ error: 'Certificado no encontrado' }, { status: 404 });

    const patient = (Array.isArray(cert.patient) ? cert.patient[0] : cert.patient) as { first_name: string; last_name: string; email: string | null } | null;
    const tenant = (Array.isArray(cert.tenant) ? cert.tenant[0] : cert.tenant) as { name: string } | null;
    const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'Paciente';
    const tenantName = tenant?.name ?? 'Consultorio';

    const typeLabels: Record<string, string> = {
      reposo: 'Certificado de Reposo Médico',
      salud: 'Certificado de Salud',
      atencion: 'Constancia de Atención Médica',
      personalizado: String((cert.content as Record<string,unknown>).title ?? 'Certificado Médico'),
    };

    const pdfBuffer = await fetchCertificatePdf(id, APP_URL);
    const attachments = pdfBuffer ? [{
      filename: `certificado-${cert.certificate_number ?? id}.pdf`,
      content: pdfBuffer.toString('base64'),
    }] : [];

    const html = emailHtml({
      tenantName,
      title: typeLabels[cert.certificate_type] ?? 'Certificado Médico',
      body: `Le hacemos llegar su ${typeLabels[cert.certificate_type] ?? 'certificado médico'} emitido por ${tenantName}.`,
      patientName,
      verificationCode: cert.verification_code ?? undefined,
      appUrl: APP_URL,
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${tenantName} <${FROM_EMAIL}>`,
        to: [email],
        subject: `${typeLabels[cert.certificate_type]} — ${tenantName}`,
        html,
        attachments,
      }),
    });

    if (!res.ok) return NextResponse.json({ error: 'Error al enviar el email' }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  // ── PRESCRIPTION ───────────────────────────────────────────────────────────
  if (type === 'prescription') {
    const { data: rx } = await supabase
      .from('prescriptions')
      .select(`
        id, prescription_number, verification_code, medications, pdf_url,
        patient:patients(first_name, last_name, email),
        tenant:tenants(name)
      `)
      .eq('id', id)
      .single();

    if (!rx) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 });

    const patient = (Array.isArray(rx.patient) ? rx.patient[0] : rx.patient) as { first_name: string; last_name: string; email: string | null } | null;
    const tenant = (Array.isArray(rx.tenant) ? rx.tenant[0] : rx.tenant) as { name: string } | null;
    const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'Paciente';
    const tenantName = tenant?.name ?? 'Consultorio';

    const meds = (rx.medications as { name: string }[] | null) ?? [];
    const medList = meds.map(m => `• ${m.name}`).join('\n');

    const html = emailHtml({
      tenantName,
      title: `Receta Médica N° ${rx.prescription_number}`,
      body: `Le hacemos llegar su receta médica.<br><br>Medicamentos prescritos:<br>${meds.map(m => `• ${m.name}`).join('<br>')}`,
      patientName,
      verificationCode: rx.verification_code ?? undefined,
      appUrl: APP_URL,
    });

    // Fetch PDF if stored
    let attachments: { filename: string; content: string }[] = [];
    if (rx.pdf_url) {
      try {
        const pdfRes = await supabase.storage.from('prescriptions').download(rx.pdf_url);
        if (pdfRes.data) {
          const buf = Buffer.from(await pdfRes.data.arrayBuffer());
          attachments = [{ filename: `receta-${rx.prescription_number}.pdf`, content: buf.toString('base64') }];
        }
      } catch { /* no PDF stored, send without attachment */ }
    }

    void medList;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${tenantName} <${FROM_EMAIL}>`,
        to: [email],
        subject: `Receta Médica N° ${rx.prescription_number} — ${tenantName}`,
        html,
        attachments,
      }),
    });

    if (!res.ok) return NextResponse.json({ error: 'Error al enviar el email' }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  // ── INVOICE ────────────────────────────────────────────────────────────────
  if (type === 'invoice') {
    const { data: inv } = await supabase
      .from('sri_documents')
      .select(`
        id, doc_type, serie, secuencial, total, status, buyer_name, buyer_email,
        authorization_number, ride_url,
        tenant:tenants(name)
      `)
      .eq('id', id)
      .single();

    if (!inv) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });

    const tenant = (Array.isArray(inv.tenant) ? inv.tenant[0] : inv.tenant) as { name: string } | null;
    const tenantName = tenant?.name ?? 'Consultorio';
    const docNumber = `${inv.serie}-${String(inv.secuencial).padStart(9, '0')}`;
    const buyerName = String(inv.buyer_name ?? 'Cliente');

    const html = emailHtml({
      tenantName,
      title: `Factura Electrónica N° ${docNumber}`,
      body: `Le hacemos llegar su factura electrónica N° <strong>${docNumber}</strong> por el valor de <strong>$${Number(inv.total).toFixed(2)}</strong>.<br><br>Estado: <strong>${inv.status === 'autorizado' ? 'Autorizado por el SRI' : inv.status}</strong>${inv.authorization_number ? `<br>Clave de acceso: ${inv.authorization_number}` : ''}`,
      patientName: buyerName,
      appUrl: APP_URL,
    });

    // Fetch RIDE PDF if stored
    let attachments: { filename: string; content: string }[] = [];
    if (inv.ride_url) {
      try {
        const pdfRes = await supabase.storage.from('sri-rides').download(inv.ride_url as string);
        if (pdfRes.data) {
          const buf = Buffer.from(await pdfRes.data.arrayBuffer());
          attachments = [{ filename: `factura-${docNumber}.pdf`, content: buf.toString('base64') }];
        }
      } catch { /* no RIDE stored */ }
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${tenantName} <${FROM_EMAIL}>`,
        to: [email],
        subject: `Factura Electrónica N° ${docNumber} — ${tenantName}`,
        html,
        attachments,
      }),
    });

    if (!res.ok) return NextResponse.json({ error: 'Error al enviar el email' }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Tipo de documento inválido' }, { status: 400 });
}
