/**
 * Generador de PDF para reportes financieros
 */

import { withPage } from './browser-pool';

export interface ReportData {
  title: string;
  period: string;
  tenantName: string;
  generatedAt: Date;
  summary: {
    totalIngresos: number;
    totalEgresos: number;
    utilidad: number;
  };
  byCategory: Array<{
    category: string;
    type: 'ingreso' | 'egreso';
    total: number;
    count: number;
  }>;
  transactions: Array<{
    date: string;
    description: string;
    category: string;
    type: 'ingreso' | 'egreso';
    amount: number;
    paymentMethod?: string;
  }>;
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function html(data: ReportData): string {
  const categoryRows = data.byCategory
    .sort((a, b) => b.total - a.total)
    .map(
      (c) => `
    <tr>
      <td>${c.category}</td>
      <td class="center"><span class="badge ${c.type === 'ingreso' ? 'badge-green' : 'badge-red'}">${c.type}</span></td>
      <td class="right">${c.count}</td>
      <td class="right ${c.type === 'ingreso' ? 'green' : 'red'}">${formatCurrency(c.total)}</td>
    </tr>
  `
    )
    .join('');

  const txRows = data.transactions
    .slice(0, 100)
    .map(
      (t) => `
    <tr>
      <td>${t.date}</td>
      <td>${t.description}</td>
      <td>${t.category}</td>
      <td>${t.paymentMethod ?? '—'}</td>
      <td class="right ${t.type === 'ingreso' ? 'green' : 'red'}">${t.type === 'egreso' ? '-' : ''}${formatCurrency(t.amount)}</td>
    </tr>
  `
    )
    .join('');

  const utilidadClass = data.summary.utilidad >= 0 ? 'green' : 'red';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:9px; color:#111; background:white; }
  .page { width:210mm; padding:12mm 14mm; }

  .header { border-bottom:3px solid #1E40AF; padding-bottom:8px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:flex-end; }
  .header-left .title { font-size:18px; font-weight:700; color:#1E40AF; }
  .header-left .subtitle { font-size:10px; color:#555; margin-top:2px; }
  .header-right { text-align:right; font-size:8px; color:#888; }

  .kpi-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:12px; }
  .kpi-card { border:1px solid #e5e7eb; border-radius:6px; padding:8px 10px; }
  .kpi-card .label { font-size:8px; text-transform:uppercase; letter-spacing:0.5px; color:#888; }
  .kpi-card .value { font-size:16px; font-weight:700; margin-top:2px; }
  .kpi-card.ingresos .value { color:#16a34a; }
  .kpi-card.egresos .value { color:#dc2626; }
  .kpi-card.utilidad .value { color:#1E40AF; }

  .section-title { font-size:10px; font-weight:700; color:#1E40AF; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #e5e7eb; padding-bottom:4px; margin-bottom:8px; margin-top:16px; }

  table { width:100%; border-collapse:collapse; font-size:8.5px; }
  thead tr { background:#1E40AF; color:white; }
  thead td { padding:4px 6px; font-weight:600; }
  tbody tr:nth-child(even) { background:#f9fafb; }
  tbody td { padding:3px 6px; border-bottom:1px solid #f3f4f6; }
  .right { text-align:right; }
  .center { text-align:center; }
  .green { color:#16a34a; font-weight:600; }
  .red { color:#dc2626; font-weight:600; }

  .badge { display:inline-block; padding:1px 5px; border-radius:3px; font-size:7.5px; font-weight:600; }
  .badge-green { background:#dcfce7; color:#16a34a; }
  .badge-red { background:#fee2e2; color:#dc2626; }

  .footer { margin-top:16px; border-top:1px solid #e5e7eb; padding-top:6px; font-size:7.5px; color:#888; text-align:center; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <div class="title">${data.tenantName}</div>
      <div class="subtitle">${data.title} · ${data.period}</div>
    </div>
    <div class="header-right">
      Generado el ${data.generatedAt.toLocaleDateString('es-EC', { day:'2-digit', month:'long', year:'numeric' })}
      <br/>MediCore Ecuador
    </div>
  </div>

  <!-- KPIs -->
  <div class="kpi-grid">
    <div class="kpi-card ingresos">
      <div class="label">Total ingresos</div>
      <div class="value">${formatCurrency(data.summary.totalIngresos)}</div>
    </div>
    <div class="kpi-card egresos">
      <div class="label">Total egresos</div>
      <div class="value">${formatCurrency(data.summary.totalEgresos)}</div>
    </div>
    <div class="kpi-card utilidad">
      <div class="label">Utilidad neta</div>
      <div class="value ${utilidadClass}">${formatCurrency(data.summary.utilidad)}</div>
    </div>
  </div>

  <!-- CATEGORIES -->
  ${data.byCategory.length > 0 ? `
  <div class="section-title">Resumen por categoría</div>
  <table>
    <thead><tr>
      <td>Categoría</td><td class="center">Tipo</td><td class="right">Transacciones</td><td class="right">Total</td>
    </tr></thead>
    <tbody>${categoryRows}</tbody>
  </table>
  ` : ''}

  <!-- TRANSACTIONS -->
  ${data.transactions.length > 0 ? `
  <div class="section-title">Detalle de transacciones${data.transactions.length > 100 ? ' (primeras 100)' : ''}</div>
  <table>
    <thead><tr>
      <td>Fecha</td><td>Descripción</td><td>Categoría</td><td>Método pago</td><td class="right">Monto</td>
    </tr></thead>
    <tbody>${txRows}</tbody>
  </table>
  ` : ''}

  <div class="footer">
    Reporte generado por PlexoMed · plexomed.com · Solo para uso interno del consultorio
  </div>

</div>
</body>
</html>`;
}

export async function generateReportPdf(data: ReportData): Promise<Buffer> {
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
