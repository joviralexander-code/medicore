import { SRI_CLAVE_ACCESO_LENGTH, SRI_DOC_TYPE_CODES, type SriDocType, type SriAmbiente } from '../constants/sri';

export interface ClaveAccesoParams {
  fechaEmision: Date;        // Fecha del documento
  tipoComprobante: SriDocType;
  ruc: string;               // RUC del emisor (13 dígitos)
  ambiente: SriAmbiente;
  serie: string;             // Ej: '001001'
  secuencial: string | number; // Número de secuencia (se padea a 9 dígitos)
  codigoNumerico: string;    // 8 dígitos aleatorios (parte de la clave)
}

/**
 * Calcula el dígito verificador usando el algoritmo Módulo 11
 * según la especificación técnica del SRI Ecuador.
 */
export function calcularDigitoVerificador(numero: string): number {
  const factores = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  let factorIndex = 0;

  for (let i = numero.length - 1; i >= 0; i--) {
    const digito = parseInt(numero[i] ?? '0', 10);
    const factor = factores[factorIndex % factores.length] ?? 2;
    suma += digito * factor;
    factorIndex++;
  }

  const residuo = suma % 11;

  if (residuo === 0) return 0;
  if (residuo === 1) return 1;
  return 11 - residuo;
}

/**
 * Genera la clave de acceso de 49 dígitos según especificación SRI.
 *
 * Estructura (48 dígitos + 1 verificador):
 * DDMMAAAA (8) + tipoDoc (2) + RUC (13) + ambiente (1) + serie (6) + secuencial (9) + codigoNumerico (8) + tipoEmision (1)
 * Total: 8+2+13+1+6+9+8+1 = 48 + 1 verificador = 49
 */
export function generarClaveAcceso(params: ClaveAccesoParams): string {
  const { fechaEmision, tipoComprobante, ruc, ambiente, serie, secuencial, codigoNumerico } = params;

  const dd = String(fechaEmision.getDate()).padStart(2, '0');
  const mm = String(fechaEmision.getMonth() + 1).padStart(2, '0');
  const yyyy = String(fechaEmision.getFullYear());

  const tipoDoc = SRI_DOC_TYPE_CODES[tipoComprobante];
  const secuencialPadded = String(secuencial).padStart(9, '0');
  const codigoNumericopadded = codigoNumerico.padStart(8, '0');
  const tipoEmision = '1'; // Normal

  const clave48 = [
    dd + mm + yyyy,       // 8
    tipoDoc,              // 2
    ruc,                  // 13
    String(ambiente),     // 1
    serie,                // 6
    secuencialPadded,     // 9
    codigoNumericopadded, // 8
    tipoEmision,          // 1
  ].join('');

  if (clave48.length !== 48) {
    throw new Error(
      `Clave de acceso inválida: longitud esperada 48, obtenida ${clave48.length}. Verificar parámetros.`
    );
  }

  const verificador = calcularDigitoVerificador(clave48);
  const claveCompleta = clave48 + String(verificador);

  if (claveCompleta.length !== SRI_CLAVE_ACCESO_LENGTH) {
    throw new Error(`Clave de acceso final inválida: longitud ${claveCompleta.length}`);
  }

  return claveCompleta;
}

/**
 * Valida que una clave de acceso sea correcta
 */
export function validarClaveAcceso(clave: string): boolean {
  if (clave.length !== SRI_CLAVE_ACCESO_LENGTH) return false;
  if (!/^\d+$/.test(clave)) return false;

  const clave48 = clave.slice(0, 48);
  const verificadorEsperado = calcularDigitoVerificador(clave48);
  const verificadorActual = parseInt(clave[48] ?? '-1', 10);

  return verificadorEsperado === verificadorActual;
}

/**
 * Genera un código numérico aleatorio de 8 dígitos para la clave de acceso
 */
export function generarCodigoNumerico(): string {
  return Math.floor(Math.random() * 99_999_999)
    .toString()
    .padStart(8, '0');
}
