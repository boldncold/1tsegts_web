/**
 * QPay v2 API client.
 *
 * Thin wrapper over QPay's HTTP API. No state of its own — all calls take an
 * access_token (obtained via `getAccessToken` from qpayTokenCache.ts).
 *
 * Spec source: docs/qpay/2026.3.17 V2 API with Ebarimt 3.0 1.xlsx
 *
 * Base URLs (from the `API` sheet):
 *   Sandbox: https://merchant-sandbox.qpay.mn
 *   Prod:    https://merchant.qpay.mn
 *
 * Configure via the QPAY_BASE_URL secret (see qpayTokenCache.ts).
 */

export interface QpayBankDeeplink {
  name: string;          // e.g. "Khan bank"
  description: string;   // e.g. "Хаан банк"
  logo: string;          // https://qpay.mn/q/logo/khanbank.png
  link: string;          // khanbank://q?qPay_QRcode=...
}

export interface QpayInvoiceResponse {
  invoice_id: string;
  qr_text: string;
  qr_image: string;       // base64 PNG
  qPay_shortUrl: string;
  qPay_deeplink: QpayBankDeeplink[];
}

export interface QpayCreateInvoiceRequest {
  invoice_code: string;
  sender_invoice_no: string;     // unique per merchant; use Firestore order id
  invoice_receiver_code: string; // 'terminal' for anonymous QR, or customer reg
  invoice_description: string;
  sender_branch_code?: string;
  amount: number;
  callback_url: string;
}

export interface QpayPaymentRow {
  payment_id: string;
  payment_status: 'NEW' | 'FAILED' | 'PAID' | 'REFUNDED' | 'CANCELLED' | string;
  payment_amount: number;
  payment_currency: string;
  payment_wallet?: string;
  payment_type: 'P2P' | 'CARD' | string;
  trx_fee?: number;
  ebarimt_customer_no?: string;
  next_payment_date?: string | null;
  next_payment_datetime?: string | null;
  // Note: QPay spells this 'card_tansactions' in the spec — typo on their side
  card_tansactions?: unknown[];
  p2p_transactions?: unknown[];
}

export interface QpayPaymentCheckResponse {
  count: number;
  paid_amount?: number;
  rows: QpayPaymentRow[];
}

export interface QpayAuthResponse {
  token_type: 'bearer';
  refresh_expires_in: number; // unix timestamp
  refresh_token: string;
  access_token: string;
  expires_in: number;         // unix timestamp
  scope: string;
  not_before_policy?: string;
  session_state?: string;
}

/**
 * POST /v2/auth/token — exchange Basic credentials for a bearer token.
 *
 * Per the `token` sheet: only call `/refresh` once per token lifetime.
 * Otherwise call this endpoint to get a fresh token.
 */
export async function qpayAuth(
  baseUrl: string,
  username: string,
  password: string,
): Promise<QpayAuthResponse> {
  const basic = Buffer.from(`${username}:${password}`).toString('base64');
  const res = await fetch(`${baseUrl}/v2/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`QPay auth failed: HTTP ${res.status} — ${body}`);
  }
  return (await res.json()) as QpayAuthResponse;
}

/**
 * POST /v2/invoice — create an invoice (the simple form).
 *
 * Returns the QR payload + bank deep links. The amount, sender_invoice_no, and
 * callback_url come from our side; invoice_code is the merchant code QPay
 * assigned us (1TSEGTS_INVOICE).
 */
export async function qpayCreateInvoice(
  baseUrl: string,
  accessToken: string,
  payload: QpayCreateInvoiceRequest,
): Promise<QpayInvoiceResponse> {
  const res = await fetch(`${baseUrl}/v2/invoice`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`QPay createInvoice failed: HTTP ${res.status} — ${body}`);
  }
  return (await res.json()) as QpayInvoiceResponse;
}

/**
 * POST /v2/payment/check — list payments for an invoice.
 *
 * The trust source: even after a callback fires, we re-call this endpoint to
 * verify payment status and amount before marking an order paid.
 */
export async function qpayPaymentCheck(
  baseUrl: string,
  accessToken: string,
  invoiceId: string,
): Promise<QpayPaymentCheckResponse> {
  const res = await fetch(`${baseUrl}/v2/payment/check`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      object_type: 'INVOICE',
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`QPay paymentCheck failed: HTTP ${res.status} — ${body}`);
  }
  return (await res.json()) as QpayPaymentCheckResponse;
}

/**
 * DELETE /v2/invoice/{invoice_id} — cancel an unpaid invoice.
 *
 * Used when an order is cancelled by the customer or expires.
 */
export async function qpayCancelInvoice(
  baseUrl: string,
  accessToken: string,
  invoiceId: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/v2/invoice/${invoiceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`QPay cancelInvoice failed: HTTP ${res.status} — ${body}`);
  }
}
