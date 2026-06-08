/**
 * HTTP Cloud Function: qpayWebhook
 *
 * QPay calls our callback_url when a payment lands. The spec doesn't define
 * an HMAC signature, so:
 *   1. We add ?token=<secret> to the callback URL we register with QPay, and
 *      reject any inbound request missing or mismatching that token.
 *   2. We never trust the request body — we always call /v2/payment/check
 *      server-side with our Bearer token to verify the payment.
 *
 * Per the spec's `callback URL` sheet: we must return HTTP 200 + literal body
 * "SUCCESS". Any other shape triggers QPay's retry loop.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getAccessToken, readConfigFromEnv } from './qpayTokenCache.js';
import { qpayPaymentCheck } from './qpayClient.js';
import { markOrderPaid } from './markOrderPaid.js';

const QPAY_USERNAME = defineSecret('QPAY_USERNAME');
const QPAY_PASSWORD = defineSecret('QPAY_PASSWORD');
const QPAY_INVOICE_CODE = defineSecret('QPAY_INVOICE_CODE');
const QPAY_BASE_URL = defineSecret('QPAY_BASE_URL');
const QPAY_CALLBACK_TOKEN = defineSecret('QPAY_CALLBACK_TOKEN');

export const qpayWebhook = onRequest(
  {
    region: 'asia-east1',
    secrets: [
      QPAY_USERNAME,
      QPAY_PASSWORD,
      QPAY_INVOICE_CODE,
      QPAY_BASE_URL,
      QPAY_CALLBACK_TOKEN,
    ],
    cors: false,
  },
  async (req, res) => {
    // Prefer path segments — QPay PROD rejects callback URLs with a query
    // string as INVALID, so we register the callback as
    //   .../qpayWebhook/<token>/<orderId>
    // Query-string form (.../qpayWebhook?order_id=…&token=…) is kept as a
    // fallback for any invoice created before the format change.
    let orderId = '';
    let token = '';
    const segments = String(req.path || '').split('/').filter(Boolean);
    if (segments.length >= 2) {
      token = decodeURIComponent(segments[0]);
      orderId = decodeURIComponent(segments[1]);
    } else {
      orderId = String(req.query.order_id ?? '');
      token = String(req.query.token ?? '');
    }

    if (!orderId || !token) {
      logger.warn('qpayWebhook: missing order_id or token', {
        path: req.path,
        query: req.query,
      });
      res.status(400).send('bad request');
      return;
    }

    const config = readConfigFromEnv();
    if (token !== config.callbackToken) {
      logger.warn('qpayWebhook: bad callback token', { orderId });
      res.status(401).send('unauthorized');
      return;
    }

    // Look up the order, find its invoice_id, ask QPay for the payment status.
    const { getDb } = await import('./db.js');
    const db = getDb();
    const ref = db.doc(`orders/${orderId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      logger.warn('qpayWebhook: order not found', { orderId });
      // Still return SUCCESS so QPay stops retrying for an unknown order.
      res.status(200).send('SUCCESS');
      return;
    }
    const order = snap.data()!;
    const invoiceId: string | undefined = order.qpayInvoiceId;
    if (!invoiceId) {
      logger.warn('qpayWebhook: order has no qpayInvoiceId', { orderId });
      res.status(200).send('SUCCESS');
      return;
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken(config);
    } catch (err) {
      logger.error('qpayWebhook: failed to get access token', err);
      // 500 so QPay retries — this is a transient failure on our side.
      res.status(500).send('server error');
      return;
    }

    let check;
    try {
      check = await qpayPaymentCheck(config.baseUrl, accessToken, invoiceId);
    } catch (err) {
      logger.error('qpayWebhook: paymentCheck failed', err);
      res.status(500).send('server error');
      return;
    }

    // Find the first PAID row that matches our amount.
    const expectedAmount = Math.round(Number(order.amountMnt ?? order.total ?? 0));
    const paid = check.rows.find(
      (r) => r.payment_status === 'PAID' && Math.round(r.payment_amount) === expectedAmount,
    );

    if (!paid) {
      logger.info('qpayWebhook: callback fired but no matching PAID row yet', {
        orderId,
        invoiceId,
        rows: check.rows.length,
      });
      // QPay sometimes fires callback slightly before /payment/check sees it.
      // Returning 500 makes QPay retry; safer than marking paid.
      res.status(500).send('payment not yet visible');
      return;
    }

    // Mark the order paid (idempotent).
    const result = await markOrderPaid(orderId, {
      source: 'qpay',
      qpayPaymentId: paid.payment_id,
    });

    if (result.updated) {
      logger.info('qpayWebhook: order marked paid', {
        orderId,
        qpayPaymentId: paid.payment_id,
      });
    } else {
      logger.info('qpayWebhook: order not updated', {
        orderId,
        reason: result.reason,
      });
    }

    res.status(200).send('SUCCESS');
  },
);
