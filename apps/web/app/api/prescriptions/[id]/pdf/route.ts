import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import forge from 'node-forge';
import crypto from 'crypto';

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

  page.drawLine({ start: { x: margin, y: sigY + 28 }, end: { x: margin + 185, y: sigY + 28 }, thickness: 0.5, color: dark });
  page.drawText(doctorFullName, { x: margin, y: sigY + 14, font: fontBold, size: 9, color: dark });
  if (doctor?.speciality) {
    page.drawText(doctor.speciality.toUpperCase(), { x: margin, y: sigY + 2, font: fontReg, size: 8, color: gray });
  }
  if (doctor?.senescyt_registration) {
    page.drawText(`REG. SENESCYT: ${doctor.senescyt_registration}`, { x: margin, y: sigY - 10, font: fontReg, size: 8, color: gray });
  }
  page.drawText(tenantName, { x: margin, y: sigY - 22, font: fontReg, size: 8, color: gray });

  // Verification code bottom-right
  const verifyLabel = 'Codigo de verificacion:';
  const verifyCode  = rx.verification_code;
  const vlW = fontReg.widthOfTextAtSize(verifyLabel, 7);
  const vcW = fontBold.widthOfTextAtSize(verifyCode, 9);
  const rightX = width - margin - Math.max(vlW, vcW);
  page.drawText(verifyLabel, { x: rightX, y: sigY + 14, font: fontReg, size: 7, color: gray });
  page.drawText(verifyCode,  { x: rightX, y: sigY + 2,  font: fontBold, size: 9, color: dark });
  page.drawText('Firmado electronicamente', { x: rightX, y: sigY - 10, font: fontReg, size: 7, color: gray });

  // ── Footer bar ────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height: 22, color: blue });
  const footerText = `${tenant?.name ?? ''}${tenant?.sri_ruc ? `  |  RUC: ${tenant.sri_ruc}` : ''}${tenant?.sri_telefono ? `  |  Tel: ${tenant.sri_telefono}` : ''}`;
  page.drawText(footerText, { x: margin, y: 7, font: fontReg, size: 7, color: rgb(1, 1, 1) });

  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Electronic signature
// ---------------------------------------------------------------------------

async function signPdf(pdfBytes: Uint8Array, p12Buffer: Buffer, p12Password: string): Promise<Uint8Array> {
  try {
    const p12Der  = forge.util.createBuffer(p12Buffer.toString('binary'));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
    if (!certBags[0]?.cert || !keyBags[0]?.key) return pdfBytes;

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(Buffer.from(pdfBytes).toString('binary'));
    p7.addCertificate(certBags[0].cert!);
    p7.addSigner({
      key: keyBags[0].key!,
      certificate: certBags[0].cert!,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType,  value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime,  value: new Date().toISOString() },
      ],
    });
    p7.sign({ detached: true });

    const sigB64  = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary').toString('base64');
    const comment = new TextEncoder().encode(`\n%% PKCS7-SIGNATURE: ${sigB64}\n`);
    const merged  = new Uint8Array(pdfBytes.length + comment.length);
    merged.set(pdfBytes);
    merged.set(comment, pdfBytes.length);
    return merged;
  } catch {
    return pdfBytes;
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
        const p12Buf = Buffer.from(tenantFull.sri_cert_p12 as string, 'base64');
        const plainPassword = decryptPassword(tenantFull.sri_cert_password as string);
        pdfBytes = await signPdf(pdfBytes, p12Buf, plainPassword);
      } catch { /* unsigned */ }
    }
  }

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receta-${rxRow.prescription_number}.pdf"`,
    },
  });
}
