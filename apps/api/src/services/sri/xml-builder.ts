/**
 * Generador de XML para documentos electrónicos SRI Ecuador
 * Esquema Factura: 2.1.0
 * Esquema Nota de Crédito: 1.1.0
 */

export interface TenantSriConfig {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  direccion: string;
  telefono?: string;
  email?: string;
  serie: string;
  ambiente: 1 | 2;
}

export interface FacturaItem {
  codigoPrincipal?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  ivaPct: 0 | 12 | 15 | -1;
}

export interface FacturaInput {
  claveAcceso: string;
  fechaEmision: Date;
  secuencial: string;
  tenant: TenantSriConfig;
  buyer: {
    idType: 'cedula' | 'ruc' | 'pasaporte' | 'consumidor_final';
    id: string;
    name: string;
    email?: string;
    address?: string;
  };
  items: FacturaItem[];
  paymentMethod: string;
  paymentDeadlineDays: number;
}

/** Convierte fecha a formato SRI: DD/MM/YYYY */
function formatFechaSri(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/** Escapa caracteres especiales XML */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Redondea a 2 decimales */
function round2(n: number): string {
  return n.toFixed(2);
}

/** Códigos de forma de pago SRI */
const PAYMENT_METHOD_CODES: Record<string, string> = {
  efectivo: '01',
  cheque: '02',
  debito: '03',
  transferencia: '04',
  tarjeta_credito: '16',
  tarjeta_debito: '17',
  compensacion: '15',
  endoso_titulos: '19',
  otros: '20',
};

/** Códigos de tipo de identificador del comprador */
const BUYER_ID_TYPE_CODES: Record<string, string> = {
  ruc: '04',
  cedula: '05',
  pasaporte: '06',
  consumidor_final: '07',
};

/** Códigos de IVA SRI */
const IVA_CODES: Record<number, string> = {
  0: '0',
  12: '2',
  15: '4',
  [-1]: '6', // No objeto de IVA
};

/**
 * Genera el XML de factura electrónica SRI versión 2.1.0
 */
export function buildFacturaXml(input: FacturaInput): string {
  const { claveAcceso, fechaEmision, secuencial, tenant, buyer, items, paymentMethod, paymentDeadlineDays } = input;

  // Calcular totales por tarifa de IVA
  let subtotal0 = 0;
  let subtotal12 = 0;
  let subtotal15 = 0;
  let subtotalNoObj = 0;

  const detallesXml = items.map((item) => {
    const precioTotalSinImpuesto = round2((item.cantidad * item.precioUnitario) - item.descuento);
    const precioTotal = parseFloat(precioTotalSinImpuesto);

    if (item.ivaPct === 12) subtotal12 += precioTotal;
    else if (item.ivaPct === 15) subtotal15 += precioTotal;
    else if (item.ivaPct === -1) subtotalNoObj += precioTotal;
    else subtotal0 += precioTotal;

    return `<detalle>
      <codigoPrincipal>${escapeXml(item.codigoPrincipal ?? '001')}</codigoPrincipal>
      <descripcion>${escapeXml(item.descripcion)}</descripcion>
      <cantidad>${item.cantidad.toFixed(6)}</cantidad>
      <precioUnitario>${item.precioUnitario.toFixed(6)}</precioUnitario>
      <descuento>${round2(item.descuento)}</descuento>
      <precioTotalSinImpuesto>${precioTotalSinImpuesto}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${IVA_CODES[item.ivaPct] ?? '0'}</codigoPorcentaje>
          <tarifa>${item.ivaPct < 0 ? '0' : String(item.ivaPct)}</tarifa>
          <baseImponible>${precioTotalSinImpuesto}</baseImponible>
          <valor>${round2(item.ivaPct > 0 ? precioTotal * (item.ivaPct / 100) : 0)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
  }).join('\n');

  const iva12 = subtotal12 * 0.12;
  const iva15 = subtotal15 * 0.15;
  const total = subtotal0 + subtotal12 + subtotal15 + subtotalNoObj + iva12 + iva15;

  const paymentCode = PAYMENT_METHOD_CODES[paymentMethod] ?? '01';
  const buyerIdCode = BUYER_ID_TYPE_CODES[buyer.idType] ?? '05';

  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="2.1.0">
  <infoTributaria>
    <ambiente>${tenant.ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${escapeXml(tenant.razonSocial)}</razonSocial>
    <nombreComercial>${escapeXml(tenant.nombreComercial ?? tenant.razonSocial)}</nombreComercial>
    <ruc>${tenant.ruc}</ruc>
    <claveAcceso>${claveAcceso}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>${tenant.serie.slice(0, 3)}</estab>
    <ptoEmi>${tenant.serie.slice(3, 6)}</ptoEmi>
    <secuencial>${secuencial}</secuencial>
    <dirMatriz>${escapeXml(tenant.direccion)}</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${formatFechaSri(fechaEmision)}</fechaEmision>
    <dirEstablecimiento>${escapeXml(tenant.direccion)}</dirEstablecimiento>
    ${tenant.telefono ? `<contribuyenteEspecial></contribuyenteEspecial>` : ''}
    <obligadoContabilidad>NO</obligadoContabilidad>
    <tipoIdentificacionComprador>${buyerIdCode}</tipoIdentificacionComprador>
    <razonSocialComprador>${escapeXml(buyer.name)}</razonSocialComprador>
    <identificacionComprador>${buyer.id}</identificacionComprador>
    ${buyer.email ? `<correoComprador>${escapeXml(buyer.email)}</correoComprador>` : ''}
    <totalSinImpuestos>${round2(subtotal0 + subtotal12 + subtotal15 + subtotalNoObj)}</totalSinImpuestos>
    <totalDescuento>${round2(items.reduce((s, i) => s + i.descuento, 0))}</totalDescuento>
    <totalConImpuestos>
      ${subtotal0 > 0 ? `
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>0</codigoPorcentaje>
        <baseImponible>${round2(subtotal0)}</baseImponible>
        <valor>0.00</valor>
      </totalImpuesto>` : ''}
      ${subtotal12 > 0 ? `
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>2</codigoPorcentaje>
        <baseImponible>${round2(subtotal12)}</baseImponible>
        <valor>${round2(iva12)}</valor>
      </totalImpuesto>` : ''}
      ${subtotal15 > 0 ? `
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>4</codigoPorcentaje>
        <baseImponible>${round2(subtotal15)}</baseImponible>
        <valor>${round2(iva15)}</valor>
      </totalImpuesto>` : ''}
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${round2(total)}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>${paymentCode}</formaPago>
        <total>${round2(total)}</total>
        <plazo>${paymentDeadlineDays}</plazo>
        <unidadTiempo>dias</unidadTiempo>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>
    ${detallesXml}
  </detalles>
  <infoAdicional>
    ${tenant.email ? `<campoAdicional nombre="Email">${escapeXml(tenant.email)}</campoAdicional>` : ''}
    ${tenant.telefono ? `<campoAdicional nombre="Teléfono">${escapeXml(tenant.telefono)}</campoAdicional>` : ''}
    ${buyer.email ? `<campoAdicional nombre="EmailComprador">${escapeXml(buyer.email)}</campoAdicional>` : ''}
  </infoAdicional>
</factura>`;
}
