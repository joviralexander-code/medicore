/** Tipos de documentos electrónicos SRI */
export const SRI_DOC_TYPES = [
  'factura',
  'nota_credito',
  'nota_debito',
  'liquidacion_compra',
  'retencion',
] as const;
export type SriDocType = (typeof SRI_DOC_TYPES)[number];

/** Códigos de tipo de documento para clave de acceso */
export const SRI_DOC_TYPE_CODES: Record<SriDocType, string> = {
  factura: '01',
  nota_credito: '04',
  nota_debito: '05',
  liquidacion_compra: '03',
  retencion: '07',
};

/** Ambientes SRI */
export const SRI_AMBIENTES = {
  PRUEBAS: 1,
  PRODUCCION: 2,
} as const;
export type SriAmbiente = (typeof SRI_AMBIENTES)[keyof typeof SRI_AMBIENTES];

/** WS URLs del SRI */
export const SRI_WS_URLS = {
  [SRI_AMBIENTES.PRUEBAS]: {
    recepcion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    autorizacion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
  [SRI_AMBIENTES.PRODUCCION]: {
    recepcion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    autorizacion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
} as const;

/** Timeout WS SRI en ms — NO reducir, a veces tarda */
export const SRI_WS_TIMEOUT_MS = 60_000;

/** Máximo reintentos para envío al SRI */
export const SRI_MAX_RETRIES = 3;

/** Tipos de IVA disponibles en Ecuador */
export const IVA_RATES = {
  IVA_0: 0,
  IVA_12: 12,
  IVA_15: 15,
  EXENTO: -1,
} as const;

/** Longitudes según especificación SRI */
export const SRI_CLAVE_ACCESO_LENGTH = 49;
export const SRI_SECUENCIAL_LENGTH = 9;
export const SRI_SERIE_LENGTH = 6; // ej: '001001'

/** Estados de un documento SRI */
export const SRI_STATUSES = [
  'borrador',
  'firmado',
  'enviado',
  'autorizado',
  'rechazado',
  'anulado',
] as const;
export type SriStatus = (typeof SRI_STATUSES)[number];
