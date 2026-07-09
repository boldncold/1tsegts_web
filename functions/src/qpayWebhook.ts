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
    // We register the callback as .../<token>/<orderId>. QPay only appends a
    // `?qpay_payment_id=…` QUERY param when it calls us, never extra path
    // segments — so our two values are reliably the LAST two path segments.
    //
    // Taking the last two (rather than segments[0]/[1]) makes this robust to
    // hosting that prefixes the function name: on *.cloudfunctions.net the path
    // arrives as `/qpayWebhook/<token>/<orderId>`, while on *.run.app it's
    // `/<token>/<orderId>`. The query-string form is kept as a fallback for any
    // invoice created before this format.
    let orderId = '';
    let token = '';
    const segments = String(req.path || '').split('/').filter(Boolean);
    if (segments.length >= 2) {
      token = decodeURIComponent(segments[segments.length - 2]);
      orderId = decodeURIComponent(segments[segments.length - 1]);
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

    // QPay sends amounts as decimal strings ("100.00") — coerce before compare.
    const expectedAmount = Math.round(Number(order.amountMnt ?? order.total ?? 0));
    const paidRows = check.rows.filter((r) => r.payment_status === 'PAID');
    const exactPaid = paidRows.find(
      (r) => Math.round(Number(r.payment_amount)) === expectedAmount,
    );

    if (exactPaid) {
      // Happy path — a verified PAID row for the exact amount. Idempotent.
      const result = await markOrderPaid(orderId, {
        source: 'qpay',
        qpayPaymentId: exactPaid.payment_id,
        qpayPaymentType: exactPaid.payment_type,
        qpayPaymentWallet: exactPaid.payment_wallet,
      });

      if (!result.updated && result.reason === 'bad_state:EXPIRED') {
        // Real money landed on an order we already expired. This happens
        // because the expiry job's invoice-cancel at QPay is best-effort — the
        // QR can outlive the payment window. Never drop this silently: flag it
        // so an admin refunds or revives the order.
        logger.error('qpayWebhook: paid after expiry — flagging for review', {
          orderId,
          invoiceId,
          expectedAmount,
          qpayPaymentId: exactPaid.payment_id,
        });
        await flagForReview(orderId, {
          reason: 'qpay_paid_after_expiry',
          expectedAmountMnt: expectedAmount,
          observedAmountMnt: Math.round(Number(exactPaid.payment_amount)),
          qpayPaymentId: exactPaid.payment_id,
        });
      } else {
        // updated, already_confirmed (retry), or already under manual review —
        // all fine to ack as-is.
        logger.info('qpayWebhook: order paid', {
          orderId,
          qpayPaymentId: exactPaid.payment_id,
          updated: result.updated,
          reason: result.reason,
        });
      }
      res.status(200).send('SUCCESS');
      return;
    }

    if (paidRows.length > 0) {
      // Real money landed, but the amount doesn't match what we billed (partial,
      // over-payment, or a stale invoice). This must NEVER be dropped silently
      // and must NEVER 500-loop forever — flag the order for manual review and
      // ack QPay so it stops retrying. An admin reconciles from here.
      const observed = paidRows.map((r) => Number(r.payment_amount));
      logger.error('qpayWebhook: PAID amount mismatch — flagging for review', {
        orderId,
        invoiceId,
        expectedAmount,
        observed,
      });
      await flagForReview(orderId, {
        reason: 'qpay_amount_mismatch',
        expectedAmountMnt: expectedAmount,
        observedAmountMnt: observed[0],
        qpayPaymentId: paidRows[0].payment_id,
      });
      res.status(200).send('SUCCESS');
      return;
    }

    // No PAID row yet — QPay often fires the callback a beat before
    // /payment/check reflects settlement. A 500 makes QPay retry; that is the
    // intended transient path. (Rows that are only NEW/FAILED land here too;
    // QPay's retries are finite and the scheduled job expires the order if it is
    // never actually paid.)
    logger.info('qpayWebhook: callback fired but no PAID row yet', {
      orderId,
      invoiceId,
      rows: check.rows.length,
    });
    res.status(500).send('payment not yet visible');
  },
);

interface ReviewMeta {
  reason: string;
  expectedAmountMnt: number;
  observedAmountMnt: number;
  qpayPaymentId: string;
}

/**
 * Move an order into MANUAL_REVIEW because a real payment arrived that we can't
 * auto-confirm (wrong amount, paid after expiry, etc.). Transactional so it
 * can't race a legitimate confirm: a CONFIRMED or REFUNDED order is left alone.
 */
async function flagForReview(orderId: string, meta: ReviewMeta): Promise<void> {
  const { getDb } = await import('./db.js');
  const db = getDb();
  const ref = db.doc(`orders/${orderId}`);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return;
    const order = snap.data()!;
    if (order.paymentStatus === 'CONFIRMED' || order.paymentStatus === 'REFUNDED') {
      return;
    }
    t.update(ref, {
      paymentStatus: 'MANUAL_REVIEW',
      paymentReviewReason: meta.reason,
      paymentReviewExpectedMnt: meta.expectedAmountMnt,
      paymentReviewObservedMnt: meta.observedAmountMnt,
      qpayPaymentId: meta.qpayPaymentId,
      flaggedForReviewAt: new Date().toISOString(),
    });
  });
}
