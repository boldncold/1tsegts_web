/**
 * QPay v2 API client — ported from functions/src/qpayClient.ts.
 *
 * Thin wrapper over QPay's HTTP API with no state of its own; every call takes
 * an access token (getQpayAccessToken in convex/qpay.ts).
 *
 * Spec source: docs/qpay/2026.3.17 V2 API with Ebarimt 3.0 1.xlsx
 * Base URLs: https://merchant-sandbox.qpay.mn (sandbox), https://merchant.qpay.mn (prod)
 */

export interface QpayBankDeeplink {
  name: string; // e.g. "Khan bank"
  description: string; // e.g. "Хаан банк"
  logo: string;
  link: string; // khanbank://q?qPay_QRcode=...
}

/**
 * QPay's response shape is not guaranteed: deep links in particular are often
 * omitted. Every optional field is typed as such so callers coalesce.
 */
export interface QpayInvoiceResponse {
  invoice_id: string;
  qr_text?: string;
  qr_image?: string; // base64 PNG
  qPay_shortUrl?: string;
  qPay_deeplink?: QpayBankDeeplink[];
}

export interface QpayCreateInvoiceRequest {
  invoice_code: string;
  sender_invoice_no: string; // unique per merchant: the order id
  invoice_receiver_code: string; // 'terminal' for an anonymous QR
  invoice_description: string;
  amount: number;
  callback_url: string;
}

export interface QpayPaymentRow {
  payment_id: string;
  payment_status: "NEW" | "FAILED" | "PAID" | "PARTIAL" | "REFUNDED" | "CANCELLED" | string;
  // QPay sends amounts as decimal STRINGS ("100.00") despite the spec's
  // "decimal" type. Always coerce with Number() before comparing.
  payment_amount: number | string;
  payment_currency?: string;
  payment_wallet?: string;
  payment_type?: "P2P" | "CARD" | string;
}

export interface QpayPaymentCheckResponse {
  count: number;
  paid_amount?: number;
  rows: QpayPaymentRow[];
}

export interface QpayAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // unix timestamp (seconds), not a duration
  refresh_expires_in: number;
}

async function failure(res: Response, what: string): Promise<Error> {
  const body = await res.text().catch(() => "");
  return new Error(`QPay ${what} failed: HTTP ${res.status} — ${body.slice(0, 500)}`);
}

/** POST /v2/auth/token — Basic credentials for a bearer token. */
export async function qpayAuth(
  baseUrl: string,
  username: string,
  password: string,
): Promise<QpayAuthResponse> {
  const res = await fetch(`${baseUrl}/v2/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw await failure(res, "auth");
  return (await res.json()) as QpayAuthResponse;
}

/** POST /v2/invoice — create an invoice; returns the QR payload and bank deep links. */
export async function qpayCreateInvoice(
  baseUrl: string,
  accessToken: string,
  payload: QpayCreateInvoiceRequest,
): Promise<QpayInvoiceResponse> {
  const res = await fetch(`${baseUrl}/v2/invoice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await failure(res, "createInvoice");
  return (await res.json()) as QpayInvoiceResponse;
}

/**
 * POST /v2/payment/check — the trust source. A callback only says "look";
 * this is what says whether money actually arrived, and how much.
 */
export async function qpayPaymentCheck(
  baseUrl: string,
  accessToken: string,
  invoiceId: string,
): Promise<QpayPaymentCheckResponse> {
  const res = await fetch(`${baseUrl}/v2/payment/check`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "INVOICE",
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  });
  if (!res.ok) throw await failure(res, "paymentCheck");
  return (await res.json()) as QpayPaymentCheckResponse;
}

/** DELETE /v2/invoice/{id} — cancel an unpaid invoice. A 404 counts as done. */
export async function qpayCancelInvoice(
  baseUrl: string,
  accessToken: string,
  invoiceId: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/v2/invoice/${encodeURIComponent(invoiceId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) throw await failure(res, "cancelInvoice");
}
