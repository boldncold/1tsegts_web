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
      const webhookBase = process.env.QPAY_WEBHOOK_URL!;
      if (!webhookBase || webhookBase.includes('placeholder.invalid')) {
        throw new HttpsError(
          'failed-precondition',
          'QPAY_WEBHOOK_URL is still the placeholder. Update the secret to the deployed qpayWebhook URL and redeploy createQpayInvoice.',
        );
      }
      const accessToken = await getAccessToken(config);
      // QPay PROD rejected the previous "?order_id=…&token=…" form as
      // callback_url: INVALID. Some merchant configs only accept a clean URL
      // with no query string. Encode both values into path segments instead;
      // qpayWebhook parses them from req.path. Token comes first so leaking
      // an orderId alone doesn't expose the callback secret.
      const trimmedWebhook = webhookBase.replace(/\/+$/, '');
      const callbackUrl =
        `${trimmedWebhook}/${encodeURIComponent(config.callbackToken)}` +
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

      await ref.update({
        qpayInvoiceId: qpayResponse.invoice_id,
        qpayQrText: qpayResponse.qr_text,
        qpayQrImage: qpayResponse.qr_image,
        qpayShortUrl: qpayResponse.qPay_shortUrl,
        qpayDeeplinks: qpayResponse.qPay_deeplink,
      });

      return qpayResponse;
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
