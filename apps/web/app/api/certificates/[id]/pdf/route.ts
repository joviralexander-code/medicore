import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import forge from 'node-forge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CertificateRow {
  id: string;
  certificate_type: 'reposo' | 'salud' | 'atencion' | 'personalizado';
  certificate_number: string | null;
  content: Record<string, unknown>;
  issued_at: string;
  valid_until: string | null;
  verification_code: string;
  is_signed: boolean;
  patient: {
    first_name: string;
    last_name: string;
    cedula: string | null;
    birth_date: string | null;
  } | null;
  doctor: {
    first_name: string;
    last_name: string;
    speciality: string | null;
    senescyt_registration: string | null;
    cedula: string | null;
  } | null;
  tenant: {
    name: string;
    sri_ruc: string | null;
    settings: Record<string, unknown> | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ['enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

function age(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return age;
}

function drawText(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.1, 0.1, 0.1),
) {
  page.drawText(text, { x, y, font, size, color });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

async function buildCertificatePdf(cert: CertificateRow): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  const contentWidth = width - margin * 2;

  // ── Header bar ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: rgb(0.12, 0.25, 0.69) });
  drawText(page, cert.tenant?.name ?? 'Consultorio Médico', margin, height - 35, fontBold, 16, rgb(1,1,1));
  if (cert.tenant?.sri_ruc) {
    drawText(page, `RUC: ${cert.tenant.sri_ruc}`, margin, height - 55, fontRegular, 10, rgb(0.8,0.9,1));
  }

  // ── Certificate title ────────────────────────────────────────────────────
  const titles: Record<string, string> = {
    reposo: 'CERTIFICADO DE REPOSO MÉDICO',
    salud: 'CERTIFICADO DE SALUD',
    atencion: 'CERTIFICADO DE ATENCIÓN MÉDICA',
    personalizado: String(cert.content.title ?? 'CERTIFICADO MÉDICO'),
  };
  const title = titles[cert.certificate_type] ?? 'CERTIFICADO MÉDICO';

  const titleWidth = fontBold.widthOfTextAtSize(title, 14);
  drawText(page, title, (width - titleWidth) / 2, height - 115, fontBold, 14, rgb(0.12, 0.25, 0.69));

  // ── Cert number + date ───────────────────────────────────────────────────
  let y = height - 145;
  const certNum = cert.certificate_number ?? `CERT-${cert.id.substring(0, 8).toUpperCase()}`;
  drawText(page, `N°: ${certNum}`, margin, y, fontBold, 9, rgb(0.4,0.4,0.4));
  const dateStr = `Fecha: ${formatDate(cert.issued_at)}`;
  drawText(page, dateStr, width - margin - fontRegular.widthOfTextAtSize(dateStr, 9), y, fontRegular, 9, rgb(0.4,0.4,0.4));

  // ── Separator ────────────────────────────────────────────────────────────
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.7,0.7,0.7) });
  y -= 20;

  // ── Doctor block ─────────────────────────────────────────────────────────
  const doctorName = cert.doctor
    ? `Dr./Dra. ${cert.doctor.first_name} ${cert.doctor.last_name}`
    : 'Médico';
  drawText(page, 'El/La suscrito/a:', margin, y, fontRegular, 10);
  y -= 16;
  drawText(page, doctorName, margin, y, fontBold, 11);
  y -= 14;
  if (cert.doctor?.speciality) {
    drawText(page, cert.doctor.speciality, margin, y, fontRegular, 10, rgb(0.3,0.3,0.3));
    y -= 14;
  }
  if (cert.doctor?.senescyt_registration) {
    drawText(page, `Reg. SENESCYT: ${cert.doctor.senescyt_registration}`, margin, y, fontRegular, 9, rgb(0.45,0.45,0.45));
    y -= 20;
  }

  // ── Patient block ────────────────────────────────────────────────────────
  const patientName = cert.patient
    ? `${cert.patient.first_name} ${cert.patient.last_name}`
    : 'Paciente';
  const patientAge = cert.patient?.birth_date ? `, ${age(cert.patient.birth_date)} años` : '';
  const patientCedula = cert.patient?.cedula ? `, C.I.: ${cert.patient.cedula}` : '';

  // Certificate body based on type
  const bodyLines: string[] = [];

  if (cert.certificate_type === 'reposo') {
    const c = cert.content as { days?: number; diagnosis?: string; from_date?: string; to_date?: string; observations?: string };
    bodyLines.push(`CERTIFICA que el/la paciente:`);
    bodyLines.push('');
    bodyLines.push(`${patientName}${patientCedula}${patientAge}`);
    bodyLines.push('');
    bodyLines.push(`requiere REPOSO MÉDICO por ${c.days ?? '___'} día(s), comprendido desde el`);
    if (c.from_date && c.to_date) {
      bodyLines.push(`${formatDate(c.from_date)} hasta el ${formatDate(c.to_date)}.`);
    }
    if (c.diagnosis) {
      bodyLines.push('');
      bodyLines.push(`Diagnóstico: ${c.diagnosis}`);
    }
    if (c.observations) {
      bodyLines.push('');
      bodyLines.push(`Observaciones: ${c.observations}`);
    }

  } else if (cert.certificate_type === 'salud') {
    const c = cert.content as { purpose?: string; observations?: string; valid_until_date?: string };
    const purposes: Record<string,string> = { trabajo: 'trabajo', deporte: 'la práctica deportiva', escuela: 'actividades escolares', viaje: 'viaje', otro: 'las actividades indicadas' };
    bodyLines.push(`CERTIFICA que el/la paciente:`);
    bodyLines.push('');
    bodyLines.push(`${patientName}${patientCedula}${patientAge}`);
    bodyLines.push('');
    bodyLines.push(`se encuentra en BUEN ESTADO DE SALUD y APTO/A para ${purposes[c.purpose ?? ''] ?? c.purpose ?? 'las actividades indicadas'}.`);
    if (c.observations) {
      bodyLines.push('');
      bodyLines.push(`Observaciones: ${c.observations}`);
    }
    if (c.valid_until_date) {
      bodyLines.push('');
      bodyLines.push(`Válido hasta: ${formatDate(c.valid_until_date)}`);
    }

  } else if (cert.certificate_type === 'atencion') {
    const c = cert.content as { diagnosis?: string; treatment?: string; observations?: string };
    bodyLines.push(`CERTIFICA que el/la paciente:`);
    bodyLines.push('');
    bodyLines.push(`${patientName}${patientCedula}${patientAge}`);
    bodyLines.push('');
    bodyLines.push(`fue atendido/a en consulta médica en la fecha indicada.`);
    if (c.diagnosis) {
      bodyLines.push('');
      bodyLines.push(`Diagnóstico: ${c.diagnosis}`);
    }
    if (c.treatment) {
      bodyLines.push('');
      bodyLines.push(`Tratamiento indicado: ${c.treatment}`);
    }
    if (c.observations) {
      bodyLines.push('');
      bodyLines.push(`Observaciones: ${c.observations}`);
    }

  } else {
    // personalizado
    const c = cert.content as { body?: string };
    bodyLines.push(c.body ?? '');
  }

  // Render body lines with word wrapping
  for (const line of bodyLines) {
    if (line === '') { y -= 10; continue; }
    const wrapped = wrapText(line, fontRegular, 11, contentWidth);
    for (const wl of wrapped) {
      drawText(page, wl, margin, y, fontRegular, 11);
      y -= 16;
    }
  }

  // ── Legal footer ──────────────────────────────────────────────────────────
  y -= 20;
  drawText(page, 'El presente certificado se expide a petición del interesado/a para los fines que estime conveniente.', margin, y, fontRegular, 9, rgb(0.5,0.5,0.5));

  // ── Signature area ────────────────────────────────────────────────────────
  y -= 60;
  page.drawLine({ start: { x: margin + 40, y }, end: { x: margin + 180, y }, thickness: 0.5, color: rgb(0.3,0.3,0.3) });
  drawText(page, doctorName, margin + 44, y - 14, fontBold, 9);
  if (cert.doctor?.speciality) {
    drawText(page, cert.doctor.speciality, margin + 44, y - 26, fontRegular, 8, rgb(0.4,0.4,0.4));
  }

  // ── QR / Verification code ────────────────────────────────────────────────
  const verifyText = `Código de verificación: ${cert.verification_code}`;
  drawText(page, verifyText, width - margin - fontRegular.widthOfTextAtSize(verifyText, 8), y - 14, fontRegular, 8, rgb(0.5,0.5,0.5));

  // ── Bottom border ─────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height: 20, color: rgb(0.12, 0.25, 0.69) });

  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Electronic signature with p12 cert (PKCS#7 / CMS)
// ---------------------------------------------------------------------------

async function signPdf(pdfBytes: Uint8Array, p12Buffer: Buffer, p12Password: string): Promise<Uint8Array> {
  try {
    const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

    // Extract cert and key
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];

    if (!certBags[0]?.cert || !keyBags[0]?.key) return pdfBytes; // return unsigned if no cert

    const cert       = certBags[0].cert!;
    const privateKey = keyBags[0].key!;

    // Create detached PKCS#7 signature over PDF bytes
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(Buffer.from(pdfBytes).toString('binary'));
    p7.addCertificate(cert);
    p7.addSigner({
      key: privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
      ],
    });
    p7.sign({ detached: true });

    // Embed signature as PDF metadata comment (simple approach for beta)
    const sigDer  = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const sigB64  = Buffer.from(sigDer, 'binary').toString('base64');
    const comment = `\n%% PKCS7-SIGNATURE: ${sigB64}\n`;
    const commentBytes = new TextEncoder().encode(comment);

    const merged = new Uint8Array(pdfBytes.length + commentBytes.length);
    merged.set(pdfBytes);
    merged.set(commentBytes, pdfBytes.length);
    return merged;
  } catch {
    // If signing fails, return unsigned PDF (cert may not be configured)
    return pdfBytes;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch certificate with related data
  const { data: cert, error } = await supabase
    .from('medical_certificates')
    .select(`
      id, certificate_type, certificate_number, content, issued_at,
      valid_until, verification_code, is_signed,
      patient:patients(first_name, last_name, cedula, birth_date),
      doctor:user_profiles(first_name, last_name, speciality, senescyt_registration, cedula),
      tenant:tenants(name, sri_ruc, settings)
    `)
    .eq('id', id)
    .single();

  if (error || !cert) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  const certRow = cert as unknown as CertificateRow;

  // Generate PDF
  let pdfBytes = await buildCertificatePdf(certRow);

  // Try to sign with tenant's p12 cert if available
  const adminClient = createAdmin(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );

  const tenantId = (certRow.tenant as unknown as { id?: string })?.id ?? '';
  const { data: tenantFull } = tenantId
    ? await adminClient.from('tenants').select('sri_cert_p12, sri_cert_password').eq('id', tenantId).single()
    : { data: null };

  if (tenantFull?.sri_cert_p12 && tenantFull.sri_cert_password) {
    try {
      const p12Buf = Buffer.from(tenantFull.sri_cert_p12 as string, 'base64');
      pdfBytes = await signPdf(pdfBytes, p12Buf, tenantFull.sri_cert_password as string);
    } catch {
      // sign failure → return unsigned
    }
  }

  // Update is_signed status
  await supabase
    .from('medical_certificates')
    .update({ is_signed: true, signed_at: new Date().toISOString() })
    .eq('id', id);

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificado-${certRow.certificate_number ?? id}.pdf"`,
    },
  });
}
