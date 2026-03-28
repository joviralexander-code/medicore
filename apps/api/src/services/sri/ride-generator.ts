/**
 * Generador de RIDE (Representación Impresa del Documento Electrónico)
 * PDF oficial del SRI con código QR de verificación
 */

import { withPage } from '../pdf/browser-pool';

export interface RideInput {
  docType: 'factura' | 'nota_credito' | 'nota_debito' | 'retencion';
  claveAcceso: string;
  authorizationNumber: string;
  authorizationDate: Date;
  ambiente: 1 | 2;
  serie: string;
  secuencial: string;
  issuedAt: Date;
  tenant: {
    ruc: string;
    razonSocial: string;
    nombreComercial?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  buyer: {
    idType: string;
    id: string;
    name: string;
    email?: string;
    address?: string;
  };
  items: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    subtotal: number;
    ivaPct: number;
  }>;
  subtotal0: number;
  subtotal12: number;
  subtotal15: number;
  iva12: number;
  iva15: number;
  total: number;
  paymentMethod: string;
  notes?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  factura: 'FACTURA',
  nota_credito: 'NOTA DE CRÉDITO',
  nota_debito: 'NOTA DE DÉBITO',
  retencion: 'COMPROBANTE DE RETENCIÓN',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
  transferencia: 'Transferencia bancaria',
  cheque: 'Cheque',
  seguro_medico: 'Seguro médico',
  otro: 'Otro',
};

function formatCurrency(n: number) {
  return `$${n.toFixed(2)}`;
}

function formatDate(d: Date) {
  return d.toLocaleDateString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function html(data: RideInput): string {
  const docLabel = DOC_TYPE_LABELS[data.docType] ?? data.docType.toUpperCase();
  const docNumber = `${data.serie}-${data.secuencial.padStart(9, '0')}`;

  const itemsHtml = data.items
    .map(
      (item) => `
    <tr>
      <td>${item.descripcion}</td>
      <td class="right">${item.cantidad}</td>
      <td class="right">${formatCurrency(item.precioUnitario)}</td>
      <td class="right">${formatCurrency(item.descuento)}</td>
      <td class="right">${item.ivaPct}%</td>
      <td class="right">${formatCurrency(item.subtotal)}</td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size:9px; color:#111; background:white; }
  .page { width:210mm; padding:10mm 12mm; }

  /* Header */
  .header { display:grid; grid-template-columns:1fr auto 1fr; gap:8px; margin-bottom:8px; border:1px solid #ccc; }
  .header-left { padding:8px; }
  .header-center { padding:8px; text-align:center; border-left:1px solid #ccc; border-right:1px solid #ccc; min-width:120px; }
  .header-right { padding:8px; text-align:center; font-size:8px; }
  .razon-social { font-size:13px; font-weight:700; color:#1E40AF; }
  .doc-type { font-size:12px; font-weight:700; color:#1E40AF; }
  .doc-num { font-size:11px; font-weight:600; margin-top:3px; }
  .ambiente-badge { display:inline-block; background:${data.ambiente === 1 ? '#fef3c7' : '#dcfce7'}; color:${data.ambiente === 1 ? '#92400e' : '#166534'}; padding:2px 6px; border-radius:4px; font-size:8px; font-weight:600; margin-top:4px; }

  /* Auth box */
  .auth-box { border:1px solid #ccc; background:#f8faff; padding:6px 8px; margin-bottom:8px; font-size:8px; }
  .auth-box .label { font-size:7.5px; text-transform:uppercase; letter-spacing:0.5px; color:#555; margin-bottom:1px; }
  .clave-acceso { font-family:monospace; font-size:8px; letter-spacing:1px; word-break:break-all; color:#1E40AF; font-weight:600; }
  .auth-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:6px; }

  /* Parties */
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
  .party-box { border:1px solid #e5e7eb; border-radius:4px; padding:6px 8px; }
  .party-title { font-size:7.5px; text-transform:uppercase; letter-spacing:0.5px; color:#1E40AF; font-weight:700; margin-bottom:4px; border-bottom:1px solid #e5e7eb; padding-bottom:2px; }
  .party-field { display:flex; gap:4px; margin-bottom:1px; }
  .party-field strong { min-width:65px; color:#555; font-size:8px; }

  /* Table */
  table { width:100%; border-collapse:collapse; margin-bottom:8px; font-size:8.5px; }
  thead tr { background:#1E40AF; color:white; }
  thead td { padding:4px 5px; font-weight:600; }
  tbody tr:nth-child(even) { background:#f9fafb; }
  tbody td { padding:3px 5px; border-bottom:1px solid #f3f4f6; }
  .right { text-align:right; }

  /* Totals */
  .totals { display:flex; justify-content:flex-end; margin-bottom:8px; }
  .totals-box { min-width:220px; border:1px solid #e5e7eb; border-radius:4px; overflow:hidden; }
  .totals-row { display:flex; justify-content:space-between; padding:3px 8px; font-size:9px; }
  .totals-row:not(:last-child) { border-bottom:1px solid #f3f4f6; }
  .totals-row.total { background:#1E40AF; color:white; font-weight:700; font-size:10px; }
  .totals-row.payment { background:#f0fdf4; color:#166534; }

  /* Footer */
  .footer-info { font-size:7.5px; color:#888; text-align:center; border-top:1px solid #e5e7eb; padding-top:5px; }
  .qr-placeholder { float:right; border:1px solid #e5e7eb; padding:4px; border-radius:4px; margin-left:8px; font-size:7px; color:#888; text-align:center; width:70px; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <div class="razon-social">${data.tenant.razonSocial}</div>
      ${data.tenant.nombreComercial ? `<div style="font-size:10px;font-weight:600;">${data.tenant.nombreComercial}</div>` : ''}
      <div style="margin-top:3px;font-size:8.5px;"><strong>RUC:</strong> ${data.tenant.ruc}</div>
      ${data.tenant.address ? `<div style="font-size:8.5px;">${data.tenant.address}</div>` : ''}
      ${data.tenant.phone ? `<div style="font-size:8.5px;">Tel: ${data.tenant.phone}</div>` : ''}
    </div>
    <div class="header-center">
      <div class="doc-type">${docLabel}</div>
      <div class="doc-num">N° ${docNumber}</div>
      <div><span class="ambiente-badge">${data.ambiente === 1 ? 'PRUEBAS' : 'PRODUCCIÓN'}</span></div>
      <div style="margin-top:5px;font-size:8px;"><strong>Fecha:</strong> ${formatDate(data.issuedAt)}</div>
    </div>
    <div class="header-right">
      <div style="font-size:8px;color:#555;margin-bottom:4px;">Código QR de verificación</div>
      <div style="border:1px solid #ccc;padding:4px;display:inline-block;font-size:7px;word-break:break-all;max-width:100px;color:#1E40AF;">
        srienlinea.sri.gob.ec
        <br/>Verificar comprobante
      </div>
    </div>
  </div>

  <!-- AUTHORIZATION -->
  <div class="auth-box">
    <div class="label">Clave de acceso / N° de autorización</div>
    <div class="clave-acceso">${data.claveAcceso}</div>
    <div class="auth-grid">
      <div><div class="label">Autorización</div>${data.authorizationNumber}</div>
      <div><div class="label">Fecha autorización</div>${formatDate(data.authorizationDate)}</div>
      <div><div class="label">Serie</div>${data.serie}</div>
      <div><div class="label">Secuencial</div>${data.secuencial.padStart(9,'0')}</div>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="parties">
    <div class="party-box">
      <div class="party-title">Emisor</div>
      <div class="party-field"><strong>Razón social:</strong> ${data.tenant.razonSocial}</div>
      <div class="party-field"><strong>RUC:</strong> ${data.tenant.ruc}</div>
      ${data.tenant.address ? `<div class="party-field"><strong>Dirección:</strong> ${data.tenant.address}</div>` : ''}
    </div>
    <div class="party-box">
      <div class="party-title">Receptor</div>
      <div class="party-field"><strong>Razón social:</strong> ${data.buyer.name}</div>
      <div class="party-field"><strong>${data.buyer.idType === 'cedula' ? 'Cédula' : data.buyer.idType === 'ruc' ? 'RUC' : 'Identificación'}:</strong> ${data.buyer.id}</div>
      ${data.buyer.email ? `<div class="party-field"><strong>Email:</strong> ${data.buyer.email}</div>` : ''}
      ${data.buyer.address ? `<div class="party-field"><strong>Dirección:</strong> ${data.buyer.address}</div>` : ''}
    </div>
  </div>

  <!-- ITEMS -->
  <table>
    <thead>
      <tr>
        <td>Descripción</td>
        <td class="right">Cant.</td>
        <td class="right">P. Unit.</td>
        <td class="right">Descuento</td>
        <td class="right">IVA</td>
        <td class="right">Subtotal</td>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <!-- TOTALS -->
  <div class="totals">
    <div class="totals-box">
      ${data.subtotal0 > 0 ? `<div class="totals-row"><span>Subtotal 0%</span><span>${formatCurrency(data.subtotal0)}</span></div>` : ''}
      ${data.subtotal12 > 0 ? `<div class="totals-row"><span>Subtotal 12%</span><span>${formatCurrency(data.subtotal12)}</span></div>` : ''}
      ${data.subtotal15 > 0 ? `<div class="totals-row"><span>Subtotal 15%</span><span>${formatCurrency(data.subtotal15)}</span></div>` : ''}
      ${data.iva12 > 0 ? `<div class="totals-row"><span>IVA 12%</span><span>${formatCurrency(data.iva12)}</span></div>` : ''}
      ${data.iva15 > 0 ? `<div class="totals-row"><span>IVA 15%</span><span>${formatCurrency(data.iva15)}</span></div>` : ''}
      <div class="totals-row total"><span>TOTAL</span><span>${formatCurrency(data.total)}</span></div>
      <div class="totals-row payment">
        <span>Forma de pago:</span>
        <span>${PAYMENT_METHOD_LABELS[data.paymentMethod] ?? data.paymentMethod}</span>
      </div>
    </div>
  </div>

  ${data.notes ? `<div style="font-size:8.5px;border:1px solid #e5e7eb;padding:5px 8px;border-radius:4px;margin-bottom:8px;"><strong>Observaciones:</strong> ${data.notes}</div>` : ''}

  <!-- FOOTER -->
  <div class="footer-info">
    Documento electrónico autorizado por el SRI · ${data.ambiente === 1 ? 'Ambiente de pruebas' : 'Ambiente de producción'} ·
    Generado por MediCore Ecuador · medicore.ec
  </div>

</div>
</body>
</html>`;
}

export async function generateRidePdf(data: RideInput): Promise<Buffer> {
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
