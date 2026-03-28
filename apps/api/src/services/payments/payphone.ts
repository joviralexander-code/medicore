/**
 * PayPhone — pasarela de pagos Ecuador
 * Documentación: https://payphone.com.ec/docs
 */

import { env } from '../../config/env';

const PAYPHONE_BASE = 'https://pay.payphonetransfer.com';

export interface PayphoneCheckoutPayload {
  amount: number;         // En centavos (USD * 100)
  amountWithTax: number;
  amountWithoutTax: number;
  tax: number;
  service: number;
  tip: number;
  currency: string;       // 'USD'
  storeId: string;
  reference: string;      // Referencia interna (ej: tenant_id + plan)
  clientTransactionId: string;  // UUID único por transacción
  responseUrl: string;    // URL de confirmación server-to-server
  cancellationUrl: string;
}

export interface PayphoneCheckoutResponse {
  paymentUrl: string;
  transactionId: number;
  clientTransactionId: string;
}

export interface PayphoneConfirmPayload {
  id: number;
  clientTransactionId: string;
}

export interface PayphoneConfirmResponse {
  statusCode: number;     // 1 = aprobada, 2 = cancelada, 3 = error
  transactionStatus: string;
  amount: number;
  currency: string;
  authorizationCode?: string;
}

export async function createPayphoneCheckout(
  payload: PayphoneCheckoutPayload
): Promise<PayphoneCheckoutResponse> {
  const res = await fetch(`${PAYPHONE_BASE}/api/button/Prepare`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.PAYPHONE_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPhone error ${res.status}: ${text}`);
  }

  return res.json() as Promise<PayphoneCheckoutResponse>;
}

export async function confirmPayphoneTransaction(
  payload: PayphoneConfirmPayload
): Promise<PayphoneConfirmResponse> {
  const res = await fetch(`${PAYPHONE_BASE}/api/button/Confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.PAYPHONE_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPhone confirm error ${res.status}: ${text}`);
  }

  return res.json() as Promise<PayphoneConfirmResponse>;
}

/** Calcular amount en centavos para un precio en USD */
export function toCents(usd: number): number {
  return Math.round(usd * 100);
}
