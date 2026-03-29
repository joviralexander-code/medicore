import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import crypto from 'crypto';
import QRCode from 'qrcode';
import signpdf from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

function decryptPassword(encrypted: string): string {
  try {
    const [ivHex, dataHex] = encrypted.split(':');
    if (!ivHex || !dataHex) return encrypted;
    const rawKey = process.env['SRI_CERT_ENCRYPTION_KEY'] ?? 'fallback-key-32-bytes-padding!!';
    const key = Buffer.alloc(32);
    Buffer.from(rawKey).copy(key);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return encrypted;
  }
}

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
    address: string | null;
    phone: string | null;
    city: string | null;
  } | null;
  doctor: {
    first_name: string;
    last_name: string;
    speciality: string | null;
    senescyt_registration: string | null;
    cedula: string | null;
  } | null;
  tenant: {
    id?: string;
    name: string;
    sri_ruc: string | null;
    sri_direccion: string | null;
    sri_telefono: string | null;
    settings: Record<string, unknown> | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Spanish helpers
// ---------------------------------------------------------------------------

const ONES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const TENS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const MONTHS_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

function numToWords(n: number): string {
  if (n < 30) return ONES[n] ?? String(n);
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? (TENS[t] ?? String(n)) : `${TENS[t]} Y ${ONES[o]}`;
  }
  return String(n);
}

function yearToWords(y: number): string {
  if (y >= 2000 && y < 3000) {
    const rem = y - 2000;
    return rem === 0 ? 'DOS MIL' : `DOS MIL ${numToWords(rem)}`;
  }
  return String(y);
}

function dateToWords(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${numToWords(d)} DE ${MONTHS_ES[m - 1] ?? ''} DEL ${yearToWords(y)}`;
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateHeader(iso: string, city?: string | null): string {
  const d = new Date(iso);
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const cityName = city ?? 'Ecuador';
  return `${cityName}, ${d.getDate()} de ${months[d.getMonth()]} del ${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// PDF drawing helpers
// ---------------------------------------------------------------------------

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
  return lines.length ? lines : [''];
}

interface DrawCtx {
  page: PDFPage;
  fontReg: PDFFont;
  fontBold: PDFFont;
  margin: number;
  contentWidth: number;
  dark: ReturnType<typeof rgb>;
  gray: ReturnType<typeof rgb>;
}

function drawWrapped(ctx: DrawCtx, text: string, x: number, y: number, size: number, bold = false): number {
  const font = bold ? ctx.fontBold : ctx.fontReg;
  const lines = wrapText(text, font, size, ctx.contentWidth - (x - ctx.margin));
  for (const line of lines) {
    ctx.page.drawText(line, { x, y, font, size, color: ctx.dark });
    y -= size + 4;
  }
  return y;
}

function drawLabelValue(ctx: DrawCtx, label: string, value: string, x: number, y: number, size = 10): number {
  if (!value) return y;
  const labelWidth = ctx.fontBold.widthOfTextAtSize(label, size);
  ctx.page.drawText(label, { x, y, font: ctx.fontBold, size, color: ctx.dark });
  const maxValWidth = ctx.contentWidth - (x - ctx.margin) - labelWidth;
  const lines = wrapText(value, ctx.fontReg, size, maxValWidth);
  ctx.page.drawText(lines[0] ?? '', { x: x + labelWidth, y, font: ctx.fontReg, size, color: ctx.dark });
  y -= size + 5;
  for (let i = 1; i < lines.length; i++) {
    ctx.page.drawText(lines[i]!, { x: x + labelWidth, y, font: ctx.fontReg, size, color: ctx.dark });
    y -= size + 5;
  }
  return y;
}

// ---------------------------------------------------------------------------
// PDF Builder
// ---------------------------------------------------------------------------

async function buildCertificatePdf(cert: CertificateRow): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  const contentWidth = width - margin * 2;
  const dark  = rgb(0.08, 0.08, 0.08);
  const gray  = rgb(0.45, 0.45, 0.45);
  const blue  = rgb(0.07, 0.25, 0.68);

  const ctx: DrawCtx = { page, fontReg, fontBold, margin, contentWidth, dark, gray };

  const tenant    = cert.tenant;
  const doctor    = cert.doctor;
  const patient   = cert.patient;
  const tenantName = tenant?.name ?? 'Consultorio Medico';
  const doctorFullName = doctor ? `${doctor.first_name} ${doctor.last_name}`.toUpperCase() : 'MEDICO';
  const patientFullName = patient ? `${patient.first_name} ${patient.last_name}`.toUpperCase() : 'PACIENTE';
  const patientLastFirst = patient ? `${patient.last_name} ${patient.first_name}`.toUpperCase() : 'PACIENTE';

  // ── Header: date left, clinic info right ───────────────────────────────
  let y = height - 50;
  const headerDate = formatDateHeader(cert.issued_at, patient?.city);
  page.drawText(headerDate, { x: margin, y, font: fontReg, size: 10, color: dark });

  const clinicLines = [
    tenantName.toUpperCase(),
    ...(tenant?.sri_ruc ? [`RUC: ${tenant.sri_ruc}`] : []),
    ...(tenant?.sri_direccion ? [tenant.sri_direccion] : []),
    ...(tenant?.sri_telefono ? [`Tel: ${tenant.sri_telefono}`] : []),
  ];
  let clinicY = y;
  for (const cl of clinicLines) {
    const cw = fontReg.widthOfTextAtSize(cl, 8);
    page.drawText(cl, { x: width - margin - cw, y: clinicY, font: cl === clinicLines[0] ? fontBold : fontReg, size: cl === clinicLines[0] ? 9 : 8, color: dark });
    clinicY -= 11;
  }

  // ── Separator line ─────────────────────────────────────────────────────
  y -= 20;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: blue });
  y -= 22;

  // ── Title ──────────────────────────────────────────────────────────────
  const titles: Record<string, string> = {
    reposo:        'CERTIFICADO MEDICO',
    salud:         'CERTIFICADO DE SALUD',
    atencion:      'CERTIFICADO DE ASISTENCIA',
    personalizado: String(cert.content.title ?? 'CERTIFICADO MEDICO'),
  };
  const title = titles[cert.certificate_type] ?? 'CERTIFICADO MEDICO';
  const titleSize = 14;
  const titleW = fontBold.widthOfTextAtSize(title, titleSize);
  const titleX = (width - titleW) / 2;
  page.drawText(title, { x: titleX, y, font: fontBold, size: titleSize, color: dark });
  page.drawLine({ start: { x: titleX, y: y - 2 }, end: { x: titleX + titleW, y: y - 2 }, thickness: 1, color: dark });
  y -= 30;

  // ── Body by certificate type ───────────────────────────────────────────

  if (cert.certificate_type === 'reposo') {
    const c = cert.content as {
      days?: number; from_date?: string; to_date?: string;
      diagnosis_code?: string; diagnosis?: string;
      resumen_clinico?: string; actividad_laboral?: string;
      empresa?: string; contingencia?: string; observations?: string;
    };

    const addressStr = patient?.address ? ` y domiciliado/a en: ${patient.address.toUpperCase()}.` : '.';
    const openPara = `Por medio de la presente certifico haber atendido al Pcte. ${patientFullName}` +
      (patient?.cedula ? ` con CI# ${patient.cedula}, numero de historia clinica ${patient.cedula}` : '') +
      `${addressStr} Quien asistio al centro medico ${tenantName.toUpperCase()} a una consulta con el/la medico ${doctorFullName}.`;

    const paraLines = wrapText(openPara, fontReg, 10, contentWidth);
    for (const line of paraLines) {
      page.drawText(line, { x: margin, y, font: fontReg, size: 10, color: dark });
      y -= 15;
    }
    y -= 6;

    if (doctor?.speciality) {
      y = drawLabelValue(ctx, 'ESPECIALIDAD: ', doctor.speciality.toUpperCase(), margin, y);
      y -= 2;
    }
    if (c.resumen_clinico) {
      y = drawLabelValue(ctx, 'RESUMEN CLINICO: ', c.resumen_clinico.toUpperCase(), margin, y);
      y -= 2;
    }
    if (c.actividad_laboral) {
      y = drawLabelValue(ctx, 'ACTIVIDAD LABORAL: ', c.actividad_laboral.toUpperCase(), margin, y);
      y -= 2;
    }
    if (patient?.phone) {
      y = drawLabelValue(ctx, 'NUMERO DE CONTACTO: ', patient.phone, margin, y);
      y -= 2;
    }
    if (c.empresa) {
      y = drawLabelValue(ctx, 'INSTITUCION/EMPRESA: ', c.empresa.toUpperCase(), margin, y);
      y -= 2;
    }
    y -= 4;

    page.drawText('DIAGNOSTICO:', { x: margin, y, font: fontBold, size: 10, color: dark });
    y -= 15;
    const diagText = c.diagnosis_code
      ? `${c.diagnosis_code} ${(c.diagnosis ?? '').toUpperCase()}`
      : (c.diagnosis ?? '').toUpperCase();
    if (diagText) {
      page.drawText(diagText, { x: margin, y, font: fontReg, size: 10, color: dark });
      y -= 15;
    }
    y -= 4;

    if (c.contingencia) {
      y = drawLabelValue(ctx, 'TIPO DE CONTINGENCIA: ', c.contingencia.toUpperCase(), margin, y);
    }
    y -= 10;

    const daysNum = c.days ?? 1;
    const restLine = `Por lo que amerita reposo absoluto por ${daysNum} (${numToWords(daysNum)}) dia(s):`;
    page.drawText(restLine, { x: margin, y, font: fontReg, size: 10, color: dark });
    y -= 16;

    if (c.from_date) {
      y = drawLabelValue(ctx, 'DESDE: ', `${formatDateShort(c.from_date)} (${dateToWords(c.from_date)}).`, margin, y);
    }
    if (c.to_date) {
      y = drawLabelValue(ctx, 'HASTA: ', `${formatDateShort(c.to_date)} (${dateToWords(c.to_date)}).`, margin, y);
    }

    if (c.observations) {
      y -= 6;
      page.drawText(`Observaciones: ${c.observations}`, { x: margin, y, font: fontReg, size: 9, color: gray });
      y -= 14;
    }

  } else if (cert.certificate_type === 'atencion') {
    const c = cert.content as {
      procedimiento?: string; hora_desde?: string; hora_hasta?: string;
      diagnosis_code?: string; diagnosis?: string; treatment?: string; observations?: string;
    };

    const dateStr = formatDateShort(cert.issued_at.split('T')[0]!);
    const horaDesde = c.hora_desde ?? '';
    const horaHasta = c.hora_hasta ?? '';
    const timeBlock = horaDesde ? ` ${dateStr} desde las ${horaDesde}${horaHasta ? ` hasta las ${horaHasta}` : ''}` : ` ${dateStr}`;

    const procedimiento = c.procedimiento ?? 'CONSULTA MEDICA';
    const openPara = `Por la presente se certifica que el paciente ${patientLastFirst}` +
      (patient?.cedula ? ` con CI# ${patient.cedula}` : '') +
      ` asistio al centro medico ${tenantName.toUpperCase()} el dia${timeBlock} para realizarse ${procedimiento.toUpperCase()}.`;

    const paraLines = wrapText(openPara, fontReg, 10, contentWidth);
    for (const line of paraLines) {
      page.drawText(line, { x: margin, y, font: fontReg, size: 10, color: dark });
      y -= 15;
    }
    y -= 10;

    page.drawText('El interesado puede hacer uso de este documento como estime conveniente.', {
      x: margin, y, font: fontReg, size: 10, color: dark,
    });
    y -= 20;

    if (c.diagnosis_code || c.diagnosis) {
      const diagText = c.diagnosis_code
        ? `${c.diagnosis_code} ${(c.diagnosis ?? '').toUpperCase()}`
        : (c.diagnosis ?? '').toUpperCase();
      y = drawLabelValue(ctx, 'DIAGNOSTICO: ', diagText, margin, y);
    }
    if (c.treatment) {
      y = drawLabelValue(ctx, 'TRATAMIENTO: ', c.treatment, margin, y);
    }
    if (c.observations) {
      y = drawLabelValue(ctx, 'OBSERVACIONES: ', c.observations, margin, y);
    }

  } else if (cert.certificate_type === 'salud') {
    const c = cert.content as { purpose?: string; observations?: string; valid_until_date?: string };
    const purposes: Record<string, string> = {
      trabajo: 'TRABAJO', deporte: 'LA PRACTICA DEPORTIVA',
      escuela: 'ACTIVIDADES ESCOLARES', viaje: 'VIAJE', otro: 'LAS ACTIVIDADES INDICADAS',
    };
    const openPara = `Por medio de la presente certifico que el/la paciente ${patientFullName}` +
      (patient?.cedula ? ` con CI# ${patient.cedula}` : '') +
      ` se encuentra en BUEN ESTADO DE SALUD y APTO/A para ${purposes[c.purpose ?? ''] ?? 'LAS ACTIVIDADES INDICADAS'}.`;

    const paraLines = wrapText(openPara, fontReg, 10, contentWidth);
    for (const line of paraLines) {
      page.drawText(line, { x: margin, y, font: fontReg, size: 10, color: dark });
      y -= 15;
    }
    if (c.valid_until_date) {
      y -= 6;
      y = drawLabelValue(ctx, 'VALIDO HASTA: ', formatDateShort(c.valid_until_date), margin, y);
    }
    if (c.observations) {
      y -= 6;
      page.drawText(`Observaciones: ${c.observations}`, { x: margin, y, font: fontReg, size: 9, color: gray });
      y -= 14;
    }

  } else {
    const c = cert.content as { body?: string };
    const lines = wrapText(c.body ?? '', fontReg, 10, contentWidth);
    for (const line of lines) {
      page.drawText(line, { x: margin, y, font: fontReg, size: 10, color: dark });
      y -= 15;
    }
  }

  // ── Legal note ─────────────────────────────────────────────────────────
  y -= 14;
  page.drawText('El presente certificado se expide a peticion del interesado/a para los fines que estime conveniente.',
    { x: margin, y, font: fontReg, size: 8, color: gray });

  // ── Signature + QR block ───────────────────────────────────────────────
  const sigY = Math.min(y - 55, 155);
  const qrSize = 65;

  // Signature line + doctor info (left side)
  page.drawLine({
    start: { x: margin, y: sigY + 30 },
    end:   { x: margin + 190, y: sigY + 30 },
    thickness: 0.5, color: dark,
  });
  page.drawText(doctorFullName, { x: margin, y: sigY + 16, font: fontBold, size: 9, color: dark });
  if (doctor?.speciality) {
    page.drawText(doctor.speciality.toUpperCase(), { x: margin, y: sigY + 4, font: fontReg, size: 8, color: gray });
  }
  page.drawText(tenantName.toUpperCase(), { x: margin, y: sigY - 8, font: fontReg, size: 8, color: gray });
  if (doctor?.senescyt_registration) {
    page.drawText(`REG. SENESCYT: ${doctor.senescyt_registration}`, { x: margin, y: sigY - 20, font: fontReg, size: 8, color: gray });
  }

  // QR code (right side of signature block)
  try {
    const rootDomain = process.env['NEXT_PUBLIC_ROOT_DOMAIN'] ?? 'plexomed.com';
    const verificationUrl = `https://${rootDomain}/verificar/${cert.verification_code}`;
    const qrBuffer = await QRCode.toBuffer(verificationUrl, { width: qrSize * 2, margin: 1, type: 'png' });
    const qrImage = await pdfDoc.embedPng(qrBuffer);
    const qrX = width - margin - qrSize;
    const qrY = sigY - 20;
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    // Label below QR
    const qrLabel = 'Verificar documento';
    const qrLabelW = fontReg.widthOfTextAtSize(qrLabel, 6);
    page.drawText(qrLabel, { x: qrX + (qrSize - qrLabelW) / 2, y: qrY - 8, font: fontReg, size: 6, color: gray });
    // Verification code text
    const codeText = cert.verification_code;
    const codeW = fontBold.widthOfTextAtSize(codeText, 7);
    page.drawText(codeText, { x: qrX + (qrSize - codeW) / 2, y: qrY - 16, font: fontBold, size: 7, color: dark });
  } catch {
    // QR generation failed — fallback to text
    const verifyText = `Cod. verificacion: ${cert.verification_code}`;
    const vw = fontReg.widthOfTextAtSize(verifyText, 7);
    page.drawText(verifyText, { x: width - margin - vw, y: sigY - 20, font: fontReg, size: 7, color: gray });
  }

  // ── Bottom blue bar ────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height: 22, color: blue });
  const footerText = `${tenantName}${tenant?.sri_ruc ? `  |  RUC: ${tenant.sri_ruc}` : ''}${tenant?.sri_telefono ? `  |  Tel: ${tenant.sri_telefono}` : ''}`;
  page.drawText(footerText, { x: margin, y: 7, font: fontReg, size: 7, color: rgb(1, 1, 1) });

  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Electronic signature (proper embedded PDF PKCS#7)
// ---------------------------------------------------------------------------

async function signPdfEmbedded(
  pdfBytes: Uint8Array,
  p12Buffer: Buffer,
  p12Password: string,
  signerName: string,
): Promise<{ signed: Uint8Array; success: boolean }> {
  try {
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer: Buffer.from(pdfBytes),
      reason: 'Certificado Medico Digital',
      contactInfo: '',
      name: signerName,
      location: 'Ecuador',
    });

    const signer = new P12Signer(p12Buffer, { passphrase: p12Password });
    const signedBuffer = await signpdf.sign(pdfWithPlaceholder, signer);
    return { signed: new Uint8Array(signedBuffer), success: true };
  } catch {
    return { signed: pdfBytes, success: false };
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: cert, error } = await supabase
    .from('medical_certificates')
    .select(`
      id, certificate_type, certificate_number, content, issued_at,
      valid_until, verification_code, is_signed,
      patient:patients(first_name, last_name, cedula, birth_date, address, phone, city),
      doctor:user_profiles(first_name, last_name, speciality, senescyt_registration, cedula),
      tenant:tenants(id, name, sri_ruc, sri_direccion, sri_telefono, settings)
    `)
    .eq('id', id)
    .single();

  if (error || !cert) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const certRow = cert as unknown as CertificateRow;
  let pdfBytes = await buildCertificatePdf(certRow);
  let wasSigned = false;

  // Try electronic signature
  const adminClient = createAdmin(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );
  const tenantId = certRow.tenant?.id ?? '';
  if (tenantId) {
    const { data: tenantFull } = await adminClient
      .from('tenants')
      .select('sri_cert_p12, sri_cert_password')
      .eq('id', tenantId)
      .single();

    if (tenantFull?.sri_cert_p12 && tenantFull.sri_cert_password) {
      try {
        const p12Buf = Buffer.from(tenantFull.sri_cert_p12 as string, 'base64');
        const plainPassword = decryptPassword(tenantFull.sri_cert_password as string);
        const doctorName = certRow.doctor
          ? `${certRow.doctor.first_name} ${certRow.doctor.last_name}`
          : 'Medico';
        const result = await signPdfEmbedded(pdfBytes, p12Buf, plainPassword, doctorName);
        pdfBytes = result.signed;
        wasSigned = result.success;
      } catch { /* unsigned */ }
    }
  }

  // Only mark as signed if the signature was actually embedded
  if (wasSigned) {
    await supabase
      .from('medical_certificates')
      .update({ is_signed: true, signed_at: new Date().toISOString() })
      .eq('id', id);
  }

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificado-${certRow.certificate_number ?? id}.pdf"`,
    },
  });
}
