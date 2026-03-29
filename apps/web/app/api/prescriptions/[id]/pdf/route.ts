import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import crypto from 'crypto';
import QRCode from 'qrcode';
import signpdf from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Dosage {
  amount?: string;
  unit?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

interface Medication {
  name?: string;
  active_ingredient?: string;
  concentration?: string;
  pharmaceutical_form?: string;
  quantity?: string;
  unit?: string;
  dosage?: Dosage;
  is_controlled?: boolean;
}

interface DiagnosisItem {
  cie10_code?: string;
  description?: string;
}

interface PrescriptionRow {
  id: string;
  prescription_number: string;
  issue_date: string;
  validity_days: number;
  status: string;
  diagnoses: DiagnosisItem[];
  medications: Medication[];
  instructions: string | null;
  verification_code: string;
  patient: {
    first_name: string;
    last_name: string;
    cedula: string | null;
    birth_date: string | null;
    address: string | null;
    phone: string | null;
  } | null;
  doctor: {
    first_name: string;
    last_name: string;
    speciality: string | null;
    senescyt_registration: string | null;
  } | null;
  tenant: {
    id?: string;
    name: string;
    sri_ruc: string | null;
    sri_direccion: string | null;
    sri_telefono: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()] ?? ''} de ${d.getFullYear()}`;
}

function calcAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return age;
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
  return lines.length ? lines : [''];
}

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
// PDF builder
// ---------------------------------------------------------------------------

async function buildPrescriptionPdf(rx: PrescriptionRow): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  const contentWidth = width - margin * 2;
  const dark = rgb(0.08, 0.08, 0.08);
  const gray = rgb(0.45, 0.45, 0.45);
  const blue = rgb(0.07, 0.25, 0.68);

  const tenant  = rx.tenant;
  const doctor  = rx.doctor;
  const patient = rx.patient;

  const tenantName     = (tenant?.name ?? 'Consultorio Medico').toUpperCase();
  const doctorFullName = doctor ? `${doctor.first_name} ${doctor.last_name}`.toUpperCase() : 'MEDICO';
  const patientFullName = patient ? `${patient.first_name} ${patient.last_name}`.toUpperCase() : 'PACIENTE';

  // ── Header: date left, clinic info right ──────────────────────────────
  let y = height - 50;

  const dateStr = formatDateLong(rx.issue_date);
  const cityName = 'Ecuador';
  page.drawText(`${cityName}, ${dateStr}`, { x: margin, y, font: fontReg, size: 10, color: dark });

  // Clinic block top-right
  const clinicLines = [
    tenantName,
    ...(tenant?.sri_ruc ? [`RUC: ${tenant.sri_ruc}`] : []),
    ...(tenant?.sri_direccion ? [tenant.sri_direccion] : []),
    ...(tenant?.sri_telefono ? [`Tel: ${tenant.sri_telefono}`] : []),
  ];
  let clinicY = y;
  for (const cl of clinicLines) {
    const isFirst = cl === clinicLines[0];
    const cw = (isFirst ? fontBold : fontReg).widthOfTextAtSize(cl, isFirst ? 9 : 8);
    page.drawText(cl, { x: width - margin - cw, y: clinicY, font: isFirst ? fontBold : fontReg, size: isFirst ? 9 : 8, color: dark });
    clinicY -= 11;
  }

  // ── Separator ─────────────────────────────────────────────────────────
  y -= 18;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: blue });
  y -= 22;

  // ── Title ─────────────────────────────────────────────────────────────
  const title = 'RECETA MEDICA';
  const titleSize = 14;
  const titleW = fontBold.widthOfTextAtSize(title, titleSize);
  const titleX = (width - titleW) / 2;
  page.drawText(title, { x: titleX, y, font: fontBold, size: titleSize, color: dark });
  page.drawLine({ start: { x: titleX, y: y - 2 }, end: { x: titleX + titleW, y: y - 2 }, thickness: 1, color: dark });

  // Prescription number right-aligned
  const rxNum = `N° ${rx.prescription_number}`;
  const rxNumW = fontReg.widthOfTextAtSize(rxNum, 9);
  page.drawText(rxNum, { x: width - margin - rxNumW, y, font: fontReg, size: 9, color: gray });
  y -= 28;

  // ── Patient block ─────────────────────────────────────────────────────
  page.drawRectangle({ x: margin, y: y - 44, width: contentWidth, height: 54, color: rgb(0.96, 0.97, 1) });
  page.drawText('PACIENTE:', { x: margin + 8, y: y - 4, font: fontBold, size: 9, color: gray });
  page.drawText(patientFullName, { x: margin + 8, y: y - 16, font: fontBold, size: 11, color: dark });

  const patientSub: string[] = [];
  if (patient?.cedula) patientSub.push(`CI: ${patient.cedula}`);
  if (patient?.birth_date) patientSub.push(`${calcAge(patient.birth_date)} anos`);
  if (patient?.phone) patientSub.push(`Tel: ${patient.phone}`);
  page.drawText(patientSub.join('  |  '), { x: margin + 8, y: y - 29, font: fontReg, size: 9, color: gray });

  // Validity right side
  const validText = `Valida por ${rx.validity_days} dias`;
  const validW = fontReg.widthOfTextAtSize(validText, 8);
  page.drawText(validText, { x: width - margin - validW - 8, y: y - 16, font: fontReg, size: 8, color: gray });

  y -= 58;

  // ── Diagnoses ─────────────────────────────────────────────────────────
  const diags = Array.isArray(rx.diagnoses) ? rx.diagnoses.filter(d => d.cie10_code || d.description) : [];
  if (diags.length > 0) {
    page.drawText('DIAGNOSTICO(S):', { x: margin, y, font: fontBold, size: 9, color: blue });
    y -= 14;
    for (const d of diags) {
      const diagText = d.cie10_code
        ? `${d.cie10_code}  ${d.description ?? ''}`
        : (d.description ?? '');
      page.drawText(diagText, { x: margin, y, font: fontReg, size: 10, color: dark });
      y -= 14;
    }
    y -= 6;
  }

  // ── Medications ───────────────────────────────────────────────────────
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 14;

  const meds = Array.isArray(rx.medications) ? rx.medications : [];

  for (let i = 0; i < meds.length; i++) {
    const m = meds[i]!;

    // Rx symbol + drug name
    const rxSymbol = 'Rx';
    page.drawText(rxSymbol, { x: margin, y, font: fontBold, size: 12, color: blue });
    const drugName = [m.name, m.concentration, m.pharmaceutical_form].filter(Boolean).join(' ');
    page.drawText(drugName || 'Medicamento', { x: margin + 22, y, font: fontBold, size: 11, color: dark });

    // Controlled badge
    if (m.is_controlled) {
      const ctrlText = 'CONTROL ESPECIAL';
      const ctrlW = fontReg.widthOfTextAtSize(ctrlText, 7);
      page.drawRectangle({ x: width - margin - ctrlW - 8, y: y - 2, width: ctrlW + 8, height: 13, color: rgb(1, 0.93, 0.87) });
      page.drawText(ctrlText, { x: width - margin - ctrlW - 4, y: y + 1, font: fontReg, size: 7, color: rgb(0.8, 0.35, 0) });
    }

    // Active ingredient
    if (m.active_ingredient) {
      y -= 13;
      page.drawText(m.active_ingredient, { x: margin + 22, y, font: fontReg, size: 9, color: gray });
    }

    y -= 13;

    // Dosage details
    const dosage = m.dosage ?? {};
    const dosageLines: string[] = [];
    if (dosage.frequency) dosageLines.push(`Frecuencia: ${dosage.frequency}`);
    if (dosage.duration)  dosageLines.push(`Duracion: ${dosage.duration}`);
    if (dosage.instructions) dosageLines.push(`Indicaciones: ${dosage.instructions}`);

    for (const dl of dosageLines) {
      const wrapped = wrapText(dl, fontReg, 9, contentWidth - 22);
      for (const wl of wrapped) {
        page.drawText(wl, { x: margin + 22, y, font: fontReg, size: 9, color: dark });
        y -= 12;
      }
    }

    // Quantity right-aligned
    if (m.quantity) {
      const qtyText = `Cantidad: ${m.quantity} ${m.unit ?? ''}`.trim();
      const qtyW = fontBold.widthOfTextAtSize(qtyText, 9);
      page.drawText(qtyText, { x: width - margin - qtyW, y: y + (dosageLines.length * 12), font: fontBold, size: 9, color: dark });
    }

    // Separator between meds
    if (i < meds.length - 1) {
      y -= 4;
      page.drawLine({ start: { x: margin + 20, y }, end: { x: width - margin, y }, thickness: 0.3, color: rgb(0.88, 0.88, 0.88) });
      y -= 10;
    } else {
      y -= 10;
    }
  }

  // ── Instructions ──────────────────────────────────────────────────────
  if (rx.instructions) {
    y -= 6;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 14;
    page.drawText('INSTRUCCIONES AL PACIENTE:', { x: margin, y, font: fontBold, size: 9, color: blue });
    y -= 13;
    const instrLines = wrapText(rx.instructions, fontReg, 9, contentWidth);
    for (const il of instrLines) {
      page.drawText(il, { x: margin, y, font: fontReg, size: 9, color: dark });
      y -= 12;
    }
  }

  // ── Signature block ───────────────────────────────────────────────────
  const sigY = Math.min(y - 30, 170);
  const qrSize = 65;

  // ── Doctor info (left) ────────────────────────────────────────────────
  page.drawLine({ start: { x: margin, y: sigY + 28 }, end: { x: margin + 160, y: sigY + 28 }, thickness: 0.5, color: dark });
  page.drawText(doctorFullName, { x: margin, y: sigY + 14, font: fontBold, size: 9, color: dark });
  if (doctor?.speciality) {
    page.drawText(doctor.speciality.toUpperCase(), { x: margin, y: sigY + 2, font: fontReg, size: 8, color: gray });
  }
  if (doctor?.senescyt_registration) {
    page.drawText(`REG. SENESCYT: ${doctor.senescyt_registration}`, { x: margin, y: sigY - 10, font: fontReg, size: 8, color: gray });
  }
  page.drawText(tenantName, { x: margin, y: sigY - 22, font: fontReg, size: 8, color: gray });

  // ── Digital signature stamp (center) ──────────────────────────────────
  const stampX = margin + 175;
  const stampW = 120;
  const stampH = 58;
  const stampY = sigY - 22;
  // Outer border
  page.drawRectangle({ x: stampX, y: stampY, width: stampW, height: stampH,
    borderColor: blue, borderWidth: 1, color: rgb(0.94, 0.97, 1) });
  // Top accent bar
  page.drawRectangle({ x: stampX, y: stampY + stampH - 12, width: stampW, height: 12, color: blue });
  // Header text
  const headerText = 'FIRMADO DIGITALMENTE';
  const headerW = fontBold.widthOfTextAtSize(headerText, 6);
  page.drawText(headerText, {
    x: stampX + (stampW - headerW) / 2, y: stampY + stampH - 9,
    font: fontBold, size: 6, color: rgb(1, 1, 1),
  });
  // Doctor name in stamp
  const stampName = doctorFullName.length > 22 ? doctorFullName.slice(0, 22) + '.' : doctorFullName;
  const stampNameW = fontBold.widthOfTextAtSize(stampName, 7);
  page.drawText(stampName, {
    x: stampX + (stampW - stampNameW) / 2, y: stampY + stampH - 24,
    font: fontBold, size: 7, color: dark,
  });
  // Date
  const signDate = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const signTime = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const dateText = `Fecha: ${signDate} ${signTime}`;
  const dateW = fontReg.widthOfTextAtSize(dateText, 6.5);
  page.drawText(dateText, {
    x: stampX + (stampW - dateW) / 2, y: stampY + stampH - 35,
    font: fontReg, size: 6.5, color: gray,
  });
  // Verification code
  const codeInStamp = `Cod: ${rx.verification_code}`;
  const codeInStampW = fontBold.widthOfTextAtSize(codeInStamp, 6);
  page.drawText(codeInStamp, {
    x: stampX + (stampW - codeInStampW) / 2, y: stampY + 15,
    font: fontBold, size: 6, color: dark,
  });
  // PlexoMed brand
  const brandText = 'PlexoMed — Donde todo converge.';
  const brandW = fontReg.widthOfTextAtSize(brandText, 5.5);
  page.drawText(brandText, {
    x: stampX + (stampW - brandW) / 2, y: stampY + 6,
    font: fontReg, size: 5.5, color: rgb(0.4, 0.5, 0.7),
  });

  // ── QR code (right) ───────────────────────────────────────────────────
  try {
    const rootDomain = process.env['NEXT_PUBLIC_ROOT_DOMAIN'] ?? 'plexomed.com';
    const verificationUrl = `https://${rootDomain}/verificar/${rx.verification_code}`;
    const qrBuffer = await QRCode.toBuffer(verificationUrl, { width: qrSize * 2, margin: 1, type: 'png' });
    const qrImage = await pdfDoc.embedPng(qrBuffer);
    const qrX = width - margin - qrSize;
    const qrY = sigY - 20;
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    const qrLabel = 'Escanear para verificar';
    const qrLabelW = fontReg.widthOfTextAtSize(qrLabel, 6);
    page.drawText(qrLabel, { x: qrX + (qrSize - qrLabelW) / 2, y: qrY - 9, font: fontReg, size: 6, color: gray });
  } catch {
    const verifyText = `Cod. verificacion: ${rx.verification_code}`;
    const vw = fontReg.widthOfTextAtSize(verifyText, 7);
    page.drawText(verifyText, { x: width - margin - vw, y: sigY - 20, font: fontReg, size: 7, color: gray });
  }

  // ── Footer bar ────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height: 22, color: blue });
  const footerText = `${tenant?.name ?? ''}${tenant?.sri_ruc ? `  |  RUC: ${tenant.sri_ruc}` : ''}${tenant?.sri_telefono ? `  |  Tel: ${tenant.sri_telefono}` : ''}`;
  page.drawText(footerText, { x: margin, y: 7, font: fontReg, size: 7, color: rgb(1, 1, 1) });

  // useObjectStreams: false required for @signpdf/placeholder-plain xref parsing
  return pdfDoc.save({ useObjectStreams: false });
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
      reason: 'Receta Medica Digital',
      contactInfo: '',
      name: signerName,
      location: 'Ecuador',
    });

    const signer = new P12Signer(p12Buffer, { passphrase: p12Password });
    const signedBuffer = await signpdf.sign(pdfWithPlaceholder, signer);
    return { signed: new Uint8Array(signedBuffer), success: true };
  } catch (err) {
    console.error('[signPdfEmbedded] Error:', err instanceof Error ? err.message : String(err));
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

  const { data: rx, error } = await supabase
    .from('prescriptions')
    .select(`
      id, prescription_number, issue_date, validity_days, status,
      diagnoses, medications, instructions, verification_code,
      patient:patients(first_name, last_name, cedula, birth_date, address, phone),
      doctor:doctor_id(first_name, last_name, speciality, senescyt_registration),
      tenant:tenants(id, name, sri_ruc, sri_direccion, sri_telefono)
    `)
    .eq('id', id)
    .single();

  if (error || !rx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rxRow = rx as unknown as PrescriptionRow;
  let pdfBytes = await buildPrescriptionPdf(rxRow);

  // Try electronic signature
  const adminClient = createAdmin(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );
  const tenantId = rxRow.tenant?.id ?? '';
  if (tenantId) {
    const { data: tenantFull } = await adminClient
      .from('tenants')
      .select('sri_cert_p12, sri_cert_password')
      .eq('id', tenantId)
      .single();

    if (tenantFull?.sri_cert_p12 && tenantFull.sri_cert_password) {
      try {
        // P12 stored formats: Uint8Array | \xHEX (Supabase bytea) | JSON.stringify(Buffer) | base64
        const raw = tenantFull.sri_cert_p12 as unknown;
        let p12Buf: Buffer;
        if (raw instanceof Uint8Array) {
          p12Buf = Buffer.from(raw);
        } else {
          const str = String(raw);
          if (str.startsWith('\\x')) {
            // Supabase bytea → \xHEX string, content is JSON.stringify(Buffer)
            const hex = str.slice(2);
            const jsonStr = Buffer.from(hex, 'hex').toString('utf8');
            const parsed = JSON.parse(jsonStr) as { type?: string; data?: number[] };
            p12Buf = parsed.type === 'Buffer' && Array.isArray(parsed.data)
              ? Buffer.from(parsed.data)
              : Buffer.from(jsonStr, 'base64');
          } else if (str.startsWith('{')) {
            const parsed = JSON.parse(str) as { type?: string; data?: number[] };
            p12Buf = parsed.type === 'Buffer' && Array.isArray(parsed.data)
              ? Buffer.from(parsed.data)
              : Buffer.from(str, 'base64');
          } else {
            p12Buf = Buffer.from(str, 'base64');
          }
        }
        console.warn('[rx/pdf] p12 size:', p12Buf.length, 'bytes, first2:', p12Buf[0]?.toString(16), p12Buf[1]?.toString(16));
        const plainPassword = decryptPassword(tenantFull.sri_cert_password as string);
        const doctorName = rxRow.doctor
          ? `${rxRow.doctor.first_name} ${rxRow.doctor.last_name}`
          : 'Medico';
        const result = await signPdfEmbedded(pdfBytes, p12Buf, plainPassword, doctorName);
        pdfBytes = result.signed;
        console.warn('[rx/pdf] signature result:', result.success ? 'signed' : 'failed');
      } catch (err) {
        console.error('[rx/pdf] outer sign error:', err instanceof Error ? err.message : String(err));
      }
    }
  }

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receta-${rxRow.prescription_number}.pdf"`,
    },
  });
}
