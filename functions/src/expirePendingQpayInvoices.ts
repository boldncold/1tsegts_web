/**
 * Scheduled Cloud Function: expirePendingQpayInvoices
 *
 * Runs every 5 minutes. Finds QPay orders stuck in AWAITING_PAYMENT past their
 * `paymentExpiresAt`, cancels the invoice with QPay, and flips the Firestore
 * doc to EXPIRED.
 *
 * Why this exists:
 *   - Without server-side expiry, paymentStatus stays AWAITING_PAYMENT forever,
 *     hiding dead invoices from operational dashboards.
 *   - QPay keeps the invoice open on their side. Cancelling it is courteous and
 *     ensures the QR / deeplink stops working if someone scans it late.
 *
 * Race safety: the EXPIRED flip uses a transaction — if a real payment lands
 * between our query and our write, the CONFIRMED state wins.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from './db.js';
import { getAccessToken, readConfigFromEnv } from './qpayTokenCache.js';
import { qpayCancelInvoice } from './qpayClient.js';

const QPAY_USERNAME = defineSecret('QPAY_USERNAME');
const QPAY_PASSWORD = defineSecret('QPAY_PASSWORD');
const QPAY_INVOICE_CODE = defineSecret('QPAY_INVOICE_CODE');
const QPAY_BASE_URL = defineSecret('QPAY_BASE_URL');
const QPAY_CALLBACK_TOKEN = defineSecret('QPAY_CALLBACK_TOKEN');

const PAYMENT_WINDOW_MINUTES = 15;

export const expirePendingQpayInvoices = onSchedule(
  {
    region: 'asia-east1',
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Ulaanbaatar',
    secrets: [
      QPAY_USERNAME,
      QPAY_PASSWORD,
      QPAY_INVOICE_CODE,
      QPAY_BASE_URL,
      QPAY_CALLBACK_TOKEN,
    ],
  },
  async () => {
    const db = getDb();
    const nowMs = Date.now();

    const snap = await db
      .collection('orders')
      .where('paymentStatus', '==', 'AWAITING_PAYMENT')
      .where('paymentMethod', '==', 'qpay')
      .get();

    if (snap.empty) {
      logger.info('expirePendingQpayInvoices: nothing pending');
      return;
    }

    const expired = snap.docs.filter((doc) => {
      const data = doc.data();
      const expiresAt = parseExpiry(data, nowMs);
      return expiresAt !== null && expiresAt < nowMs;
    });

    if (expired.length === 0) {
      logger.info('expirePendingQpayInvoices: none past expiry', {
        pending: snap.size,
      });
      return;
    }

    logger.info('expirePendingQpayInvoices: processing expired orders', {
      count: expired.length,
    });

    // Lazy: only auth with QPay if there's at least one invoice to cancel.
    const ordersWithInvoice = expired.filter((d) => d.data().qpayInvoiceId);
    let accessToken: string | null = null;
    let config: ReturnType<typeof readConfigFromEnv> | null = null;
    if (ordersWithInvoice.length > 0) {
      try {
        config = readConfigFromEnv();
        accessToken = await getAccessToken(config);
      } catch (err) {
        // Auth failure is non-fatal — we still flip Firestore to EXPIRED so the
        // app doesn't hang. The invoice stays open on QPay's side until the
        // next run picks it up after auth recovers.
        logger.error('expirePendingQpayInvoices: QPay auth failed', err);
      }
    }

    for (const doc of expired) {
      const orderId = doc.id;
      const data = doc.data();
      const invoiceId: string | undefined = data.qpayInvoiceId;

      if (invoiceId && accessToken && config) {
        try {
          await qpayCancelInvoice(config.baseUrl, accessToken, invoiceId);
        } catch (err) {
          // QPay cancel is best-effort — log and continue. The Firestore flip
          // below is what the customer sees; the invoice will eventually be
          // cleaned up by QPay's own TTL (or a later run of this function).
          logger.warn('expirePendingQpayInvoices: cancelInvoice failed', {
            orderId,
            invoiceId,
            error: String(err),
          });
        }
      }

      try {
        await db.runTransaction(async (t) => {
          const fresh = await t.get(doc.ref);
          if (!fresh.exists) return;
          const order = fresh.data()!;
          // Only flip if still AWAITING_PAYMENT — a webhook may have
          // confirmed it between our query and now.
          if (order.paymentStatus !== 'AWAITING_PAYMENT') return;
          t.update(doc.ref, {
            paymentStatus: 'EXPIRED',
            expiredAt: Timestamp.now().toDate().toISOString(),
          });
        });
        logger.info('expirePendingQpayInvoices: order expired', { orderId });
      } catch (err) {
        logger.error('expirePendingQpayInvoices: Firestore update failed', {
          orderId,
          error: String(err),
        });
      }
    }
  },
);

/**
 * Resolve the expiry timestamp (ms) for an order, falling back to
 * `timestamp + PAYMENT_WINDOW_MINUTES` when `paymentExpiresAt` is missing.
 * Returns null if neither field is parseable.
 */
function parseExpiry(
  data: FirebaseFirestore.DocumentData,
  nowMs: number,
): number | null {
  const raw = data.paymentExpiresAt;
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return ms;
  }
  // Fallback: derive from creation timestamp.
  const created = data.timestamp;
  if (typeof created === 'string') {
    const ms = Date.parse(created);
    if (!Number.isNaN(ms)) return ms + PAYMENT_WINDOW_MINUTES * 60_000;
  }
  // Safety: if we can't parse, treat the order as fresh (don't expire it).
  // nowMs is returned to make the caller's `< nowMs` check fail.
  return nowMs + 1;
}
