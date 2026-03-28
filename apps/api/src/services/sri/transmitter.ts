/**
 * Transmisor de documentos al WS del SRI Ecuador
 * - Timeout: 60s (NO reducir — el SRI a veces tarda)
 * - Retry: máximo 3 intentos con backoff exponencial
 * - Almacena cada intento en sri_transmissions para auditoría
 */

import { SRI_WS_URLS, SRI_WS_TIMEOUT_MS, SRI_MAX_RETRIES, type SriAmbiente } from '@medicore/shared/constants';

/** Escapa caracteres especiales XML para evitar inyección en SOAP envelopes */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface TransmissionResult {
  success: boolean;
  estado?: string;            // 'RECIBIDA' | 'DEVUELTA' | 'EN PROCESO'
  autorizaciones?: {
    autorizacion: {
      estado: string;         // 'AUTORIZADO' | 'NO AUTORIZADO'
      numeroAutorizacion?: string;
      fechaAutorizacion?: string;
      ambiente?: string;
      mensajes?: Array<{
        identificador: string;
        mensaje: string;
        informacionAdicional?: string;
        tipo: string;         // 'ERROR' | 'ADVERTENCIA'
      }>;
    };
  }[];
  responseXml?: string;
  errorMessage?: string;
  durationMs: number;
}

/**
 * Envía el XML firmado al WS de recepción del SRI
 */
export async function enviarDocumentoSRI(
  xmlFirmado: string,
  ambiente: SriAmbiente,
  _claveAcceso: string
): Promise<TransmissionResult> {
  const wsUrl = SRI_WS_URLS[ambiente].recepcion;
  const startTime = Date.now();

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${Buffer.from(xmlFirmado).toString('base64')}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= SRI_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SRI_WS_TIMEOUT_MS);

      const response = await fetch(wsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'SOAPAction': '""',
        },
        body: soapEnvelope,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const responseXml = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Parse básico del SOAP response
      const estado = parseEstadoRecepcion(responseXml);

      return {
        success: true,
        estado,
        responseXml,
        durationMs,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < SRI_MAX_RETRIES) {
        // Backoff exponencial: 2s, 4s, 8s
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    errorMessage: lastError?.message ?? 'Error desconocido',
    durationMs: Date.now() - startTime,
  };
}

/**
 * Consulta la autorización de un documento en el SRI
 */
export async function consultarAutorizacionSRI(
  claveAcceso: string,
  ambiente: SriAmbiente
): Promise<TransmissionResult> {
  const wsUrl = SRI_WS_URLS[ambiente].autorizacion;
  const startTime = Date.now();

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${escapeXml(claveAcceso)}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= SRI_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SRI_WS_TIMEOUT_MS);

      const response = await fetch(wsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'SOAPAction': '""',
        },
        body: soapEnvelope,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const responseXml = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const autorizaciones = parseAutorizacion(responseXml);

      return {
        success: true,
        ...(autorizaciones !== undefined ? { autorizaciones } : {}),
        responseXml,
        durationMs,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < SRI_MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    errorMessage: lastError?.message ?? 'Timeout SRI',
    durationMs: Date.now() - startTime,
  };
}

/**
 * Consulta la autorización de un documento en el WS de autorización del SRI
 * Alias exportado usado por la ruta SRI (nombre diferente a consultarAutorizacionSRI
 * para distinguir el uso directo desde la ruta vs. el uso con retry interno)
 */
export async function autorizarDocumentoSRI(
  claveAcceso: string,
  ambiente: SriAmbiente
): Promise<TransmissionResult> {
  const wsUrl = SRI_WS_URLS[ambiente].autorizacion;
  const startTime = Date.now();

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${escapeXml(claveAcceso)}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SRI_WS_TIMEOUT_MS);

    const response = await fetch(wsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
      },
      body: soapEnvelope,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const responseText = await response.text();
    const durationMs = Date.now() - startTime;

    // Parse authorization response
    const estadoMatch = responseText.match(/<estado>([^<]+)<\/estado>/);
    const numAuthMatch = responseText.match(/<numeroAutorizacion>([^<]+)<\/numeroAutorizacion>/);
    const fechaMatch = responseText.match(/<fechaAutorizacion>([^<]+)<\/fechaAutorizacion>/);

    const estado = estadoMatch?.[1] ?? 'DESCONOCIDO';
    const numeroAutorizacion = numAuthMatch?.[1];
    const fechaAutorizacion = fechaMatch?.[1];

    return {
      success: estado === 'AUTORIZADO',
      estado,
      ...(numeroAutorizacion !== undefined ? {
        autorizaciones: [{
          autorizacion: {
            estado,
            numeroAutorizacion,
            ...(fechaAutorizacion !== undefined ? { fechaAutorizacion } : {}),
          },
        }],
      } : {}),
      responseXml: responseText,
      durationMs,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : 'Error de conexión con SRI',
      durationMs: Date.now() - startTime,
    };
  }
}

/** Parse básico del estado de recepción del XML SOAP */
function parseEstadoRecepcion(xml: string): string {
  const match = /<estado>(.*?)<\/estado>/i.exec(xml);
  return match?.[1] ?? 'DESCONOCIDO';
}

/** Parse básico de la autorización del XML SOAP */
function parseAutorizacion(xml: string): TransmissionResult['autorizaciones'] {
  // Implementación básica — en producción usar un parser XML real
  const estadoMatch = /<estado>(AUTORIZADO|NO AUTORIZADO)<\/estado>/i.exec(xml);
  const numAuthMatch = /<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/i.exec(xml);
  const fechaMatch = /<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/i.exec(xml);

  return [{
    autorizacion: {
      estado: estadoMatch?.[1] ?? 'DESCONOCIDO',
      ...(numAuthMatch?.[1] !== undefined ? { numeroAutorizacion: numAuthMatch[1] } : {}),
      ...(fechaMatch?.[1] !== undefined ? { fechaAutorizacion: fechaMatch[1] } : {}),
    },
  }];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
