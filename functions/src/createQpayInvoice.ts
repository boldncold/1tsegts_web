/**
 * Callable Cloud Function: createQpayInvoice
 *
 * Called from CartDrawer / QpayPaymentPanel after the order doc is written
 * to Firestore. Returns the QR + bank-deeplink payload that the client
 * renders.
 *
 * Idempotent: if the order already has a qpayInvoiceId stored, we return the
 * cached payload instead of hitting QPay again.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getDb } from './db.js';
import { getAccessToken, readConfigFromEnv } from './qpayTokenCache.js';
import { qpayCreateInvoice } from './qpayClient.js';

const QPAY_USERNAME = defineSecret('QPAY_USERNAME');
const QPAY_PASSWORD = defineSecret('QPAY_PASSWORD');
const QPAY_INVOICE_CODE = defineSecret('QPAY_INVOICE_CODE');
const QPAY_BASE_URL = defineSecret('QPAY_BASE_URL');
const QPAY_CALLBACK_TOKEN = defineSecret('QPAY_CALLBACK_TOKEN');
const QPAY_WEBHOOK_URL = defineSecret('QPAY_WEBHOOK_URL'); // the deployed qpayWebhook URL

/**
 * Normalize the QPAY_WEBHOOK_URL secret into a clean https origin+path — no
 * trailing slash, query, hash, or stray whitespace.
 *
 * QPay validates callback_url strictly and rejects the whole invoice with
 * `callback_url: INVALID` if it's even slightly malformed. The two classic
 * causes:
 *   1. A trailing newline/space — extremely common when the secret is piped
 *      into `firebase functions:secrets:set` instead of typed at the prompt.
 *   2. A missing scheme (e.g. "qpaywebhook-x.a.run.app" with no "https://").
 * We fix what we safely can and throw a clear, actionable error otherwise.
 */
function normalizeWebhookBase(raw: string | undefined): string {
  let base = (raw ?? '').trim();
  if (!base || base.includes('placeholder.invalid')) {
    throw new HttpsError(
      'failed-precondition',
      'QPAY_WEBHOOK_URL is not set (or still the placeholder). Set it to the ' +
        'deployed qpayWebhook URL and redeploy createQpayInvoice.',
    );
  }
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new HttpsError(
      'failed-precondition',
      `QPAY_WEBHOOK_URL is not a valid URL: "${base}"`,
    );
  }
  if (url.protocol !== 'https:') {
    throw new HttpsError(
      'failed-precondition',
      `QPAY_WEBHOOK_URL must be https, got "${url.protocol}//…"`,
    );
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export const createQpayInvoice = onCall(
  {
    region: 'asia-east1',
    secrets: [
      QPAY_USERNAME,
      QPAY_PASSWORD,
      QPAY_INVOICE_CODE,
      QPAY_BASE_URL,
      QPAY_CALLBACK_TOKEN,
      QPAY_WEBHOOK_URL,
    ],
  },
  async (req) => {
    const { orderId } = (req.data ?? {}) as { orderId?: string };
    if (!orderId) {
      throw new HttpsError('invalid-argument', 'orderId is required');
    }

    const db = getDb();
    const ref = db.doc(`orders/${orderId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', `order ${orderId} not found`);
    }
    const order = snap.data()!;

    if (order.paymentMethod !== 'qpay') {
      throw new HttpsError(
        'failed-precondition',
        'order is not a QPay order',
      );
    }
    if (order.paymentStatus !== 'AWAITING_PAYMENT') {
      throw new HttpsError(
        'failed-precondition',
        `order is in state ${order.paymentStatus}, not AWAITING_PAYMENT`,
      );
    }

    // Idempotency — return the cached QR if QPay was already called.
    if (order.qpayInvoiceId && order.qpayQrText) {
      return {
        invoice_id: order.qpayInvoiceId,
        qr_text: order.qpayQrText,
        qr_image: order.qpayQrImage,
        qPay_shortUrl: order.qpayShortUrl,
        qPay_deeplink: order.qpayDeeplinks ?? [],
      };
    }

    // Wrap the QPay round-trip so failures surface useful detail to the
    // client instead of an opaque "INTERNAL".
    try {
      const config = readConfigFromEnv();
      const webhookBase = normalizeWebhookBase(process.env.QPAY_WEBHOOK_URL);
      const accessToken = await getAccessToken(config);
      // Register a clean path-based callback: <webhook>/<token>/<orderId>.
      // qpayWebhook parses both path segments and ?query (fallback). Token comes
      // first so leaking an orderId alone doesn't expose the callback secret.
      const callbackUrl =
        `${webhookBase}/${encodeURIComponent(config.callbackToken)}` +
        `/${encodeURIComponent(orderId)}`;

      const description = (order.orderNumber
        ? `1tsegts order #${order.orderNumber}`
        : `1tsegts order ${orderId}`).slice(0, 255);

      const qpayResponse = await qpayCreateInvoice(config.baseUrl, accessToken, {
        invoice_code: config.invoiceCode,
        sender_invoice_no: orderId,
        invoice_receiver_code: 'terminal',
        invoice_description: description,
        amount: Math.round(Number(order.amountMnt ?? order.total ?? 0)),
        callback_url: callbackUrl,
      });

      // QPay's response shape is not guaranteed: deep links in particular are
      // often omitted, and the static type (qpayClient.ts) lies about it. Passing
      // `undefined` to Firestore throws "Cannot use undefined as a Firestore
      // value", which the catch below would surface as a generic "can't reach
      // QPay" error even though the invoice was created fine. Coalesce every
      // optional field to a safe, defined value before writing.
      const deeplinks = qpayResponse.qPay_deeplink ?? [];

      await ref.update({
        qpayInvoiceId: qpayResponse.invoice_id,
        qpayQrText: qpayResponse.qr_text ?? null,
        qpayQrImage: qpayResponse.qr_image ?? null,
        qpayShortUrl: qpayResponse.qPay_shortUrl ?? null,
        qpayDeeplinks: deeplinks,
      });

      // Return the same normalized shape so the client never renders an
      // undefined deeplink list.
      return { ...qpayResponse, qPay_deeplink: deeplinks };
    } catch (err) {
      // Re-throw HttpsErrors as-is.
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      // Surface the real reason (e.g. "QPay createInvoice failed: HTTP 401 — ...")
      // so the client toast/panel shows something actionable.
      throw new HttpsError('internal', message);
    }
  },
);
