/**
 * Generador de PDF para recetas médicas
 * Genera una receta profesional con membrete, diagnósticos y medicamentos
 */

import { withPage } from './browser-pool';

export interface PrescriptionPdfInput {
  prescriptionNumber: string;
  issuedAt: Date;
  validUntilDays: number;
  verificationCode: string;
  doctor: {
    firstName: string;
    lastName: string;
    speciality: string;
    senescytRegistration?: string;
    phone?: string;
    email?: string;
  };
  tenant: {
    name: string;
    ruc?: string;
    address?: string;
    phone?: string;
  };
  patient: {
    firstName: string;
    lastName: string;
    cedula?: string;
    birthDate?: string;
    sex?: string;
  };
  diagnoses: Array<{ cie10Code: string; description: string }>;
  medications: Array<{
    name: string;
    activeIngredient?: string;
    concentration?: string;
    pharmaceuticalForm?: string;
    quantity: number;
    unit: string;
    dosage: {
      amount: number;
      unit: string;
      frequency: string;
      duration: string;
      instructions?: string;
    };
    isControlled?: boolean;
  }>;
}

function html(data: PrescriptionPdfInput): string {
  const validUntil = new Date(data.issuedAt);
  validUntil.setDate(validUntil.getDate() + data.validUntilDays);
  const formatDate = (d: Date) =>
    d.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });

  const medicationRows = data.medications
    .map(
      (m, i) => `
    <div class="medication">
      <div class="med-header">
        <span class="med-num">${i + 1}.</span>
        <span class="med-name">${m.name}${m.concentration ? ` ${m.concentration}` : ''}${m.pharmaceuticalForm ? ` — ${m.pharmaceuticalForm}` : ''}</span>
        ${m.isControlled ? '<span class="controlled">⚠ Controlado</span>' : ''}
      </div>
      ${m.activeIngredient ? `<div class="med-detail">Principio activo: ${m.activeIngredient}</div>` : ''}
      <div class="med-posology">
        <strong>Dosis:</strong> ${m.dosage.amount} ${m.dosage.unit} — ${m.dosage.frequency} — ${m.dosage.duration}
        &nbsp;&nbsp;<strong>Cantidad:</strong> ${m.quantity} ${m.unit}
      </div>
      ${m.dosage.instructions ? `<div class="med-instructions">📋 ${m.dosage.instructions}</div>` : ''}
    </div>
  `
    )
    .join('');

  const diagnosisText = data.diagnoses
    .map((d) => `${d.cie10Code} — ${d.description}`)
    .join('; ');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #1a1a2e; background: white; }
  .page { width: 210mm; min-height: 297mm; padding: 12mm 14mm; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1E40AF; padding-bottom: 8px; margin-bottom: 10px; }
  .header-left .clinic-name { font-size: 18px; font-weight: 700; color: #1E40AF; }
  .header-left .doctor-name { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .header-left .doctor-sub { font-size: 10px; color: #555; }
  .header-right { text-align: right; font-size: 9px; color: #555; }
  .rx-badge { background: #1E40AF; color: white; font-size: 28px; font-weight: 900; padding: 2px 8px; border-radius: 6px; margin-bottom: 4px; }

  /* Meta */
  .meta-row { display: flex; gap: 20px; background: #f8faff; border: 1px solid #e0e7ff; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; font-size: 9.5px; }
  .meta-item { flex: 1; }
  .meta-item strong { display: block; color: #1E40AF; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.5px; }

  /* Patient */
  .section-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #1E40AF; font-weight: 700; border-bottom: 1px solid #e0e7ff; padding-bottom: 3px; margin-bottom: 6px; }
  .patient-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 10px; font-size: 10px; }
  .patient-field strong { display: block; font-size: 8.5px; color: #888; }

  /* Diagnoses */
  .diagnoses { background: #fff7ed; border-left: 3px solid #f97316; padding: 5px 8px; border-radius: 0 4px 4px 0; margin-bottom: 10px; font-size: 10px; }
  .diagnoses strong { color: #c2410c; }

  /* Medications */
  .medication { border: 1px solid #e5e7eb; border-radius: 6px; padding: 7px 10px; margin-bottom: 7px; }
  .med-header { display: flex; align-items: baseline; gap: 6px; margin-bottom: 3px; }
  .med-num { font-size: 12px; font-weight: 700; color: #1E40AF; }
  .med-name { font-size: 12px; font-weight: 600; }
  .controlled { font-size: 8px; background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; padding: 1px 5px; border-radius: 4px; }
  .med-detail { font-size: 9px; color: #6b7280; margin-bottom: 2px; }
  .med-posology { font-size: 10px; background: #f9fafb; padding: 3px 6px; border-radius: 4px; }
  .med-instructions { font-size: 9px; color: #4b5563; margin-top: 2px; font-style: italic; }

  /* Footer */
  .footer { margin-top: auto; border-top: 2px solid #1E40AF; padding-top: 8px; display: flex; justify-content: space-between; align-items: flex-end; }
  .signature-area { text-align: center; }
  .signature-line { width: 120px; border-bottom: 1px solid #555; margin: 30px auto 4px; }
  .signature-sub { font-size: 8.5px; color: #555; }
  .validity-box { text-align: right; font-size: 9px; color: #555; }
  .validity-box strong { display: block; color: #1E40AF; }
  .verify-box { background: #f8faff; border: 1px solid #e0e7ff; border-radius: 6px; padding: 5px 8px; font-size: 8px; margin-top: 8px; }
  .verify-code { font-family: monospace; font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #1E40AF; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <div class="rx-badge">Rx</div>
      <div style="margin-top:4px">
        <div class="clinic-name">${data.tenant.name}</div>
        <div class="doctor-name">Dr. ${data.doctor.firstName} ${data.doctor.lastName}</div>
        <div class="doctor-sub">${data.doctor.speciality}${data.doctor.senescytRegistration ? ` · SENESCYT: ${data.doctor.senescytRegistration}` : ''}</div>
      </div>
    </div>
    <div class="header-right">
      ${data.tenant.ruc ? `<div><strong>RUC:</strong> ${data.tenant.ruc}</div>` : ''}
      ${data.tenant.address ? `<div>${data.tenant.address}</div>` : ''}
      ${data.tenant.phone ? `<div>${data.tenant.phone}</div>` : ''}
      ${data.doctor.phone ? `<div>${data.doctor.phone}</div>` : ''}
      ${data.doctor.email ? `<div>${data.doctor.email}</div>` : ''}
    </div>
  </div>

  <!-- META ROW -->
  <div class="meta-row">
    <div class="meta-item"><strong>N° Receta</strong>${data.prescriptionNumber}</div>
    <div class="meta-item"><strong>Fecha emisión</strong>${formatDate(data.issuedAt)}</div>
    <div class="meta-item"><strong>Válida hasta</strong>${formatDate(validUntil)}</div>
    <div class="meta-item"><strong>Estado</strong>Emitida</div>
  </div>

  <!-- PATIENT -->
  <div class="section-title">Datos del paciente</div>
  <div class="patient-grid">
    <div class="patient-field"><strong>Nombre completo</strong>${data.patient.firstName} ${data.patient.lastName}</div>
    ${data.patient.cedula ? `<div class="patient-field"><strong>Cédula</strong>${data.patient.cedula}</div>` : '<div></div>'}
    ${data.patient.birthDate ? `<div class="patient-field"><strong>Fecha de nacimiento</strong>${data.patient.birthDate}</div>` : '<div></div>'}
    ${data.patient.sex ? `<div class="patient-field"><strong>Sexo</strong>${data.patient.sex === 'M' ? 'Masculino' : data.patient.sex === 'F' ? 'Femenino' : data.patient.sex}</div>` : ''}
  </div>

  <!-- DIAGNOSES -->
  ${data.diagnoses.length > 0 ? `
  <div class="diagnoses">
    <strong>Diagnóstico(s): </strong>${diagnosisText}
  </div>
  ` : ''}

  <!-- MEDICATIONS -->
  <div class="section-title">Medicamentos prescritos</div>
  ${medicationRows}

  <!-- FOOTER -->
  <div class="footer">
    <div class="signature-area">
      <div class="signature-line"></div>
      <div class="signature-sub">Dr. ${data.doctor.firstName} ${data.doctor.lastName}</div>
      <div class="signature-sub">${data.doctor.speciality}</div>
    </div>
    <div>
      <div class="validity-box">
        <strong>Válida hasta:</strong>
        ${formatDate(validUntil)}
        <br/>Uso exclusivo para la prescripción médica indicada
      </div>
      <div class="verify-box">
        <div>Código de verificación pública:</div>
        <div class="verify-code">${data.verificationCode}</div>
        <div style="margin-top:2px">Verifica en: medicore.ec/portal/verify</div>
      </div>
    </div>
  </div>

</div>
</body>
</html>`;
}

export async function generatePrescriptionPdf(
  data: PrescriptionPdfInput
): Promise<Buffer> {
  return withPage(async (page) => {
    await page.setContent(html(data), { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  });
}
