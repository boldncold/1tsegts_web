/**
 * Callable Cloud Function: refundQpayPayment
 *
 * Admin-only. Refunds a confirmed QPay order via DELETE /v2/payment/refund/{id}
 * and flips the order to REFUNDED.
 *
 * IMPORTANT spec caveat (`payment_refund` sheet): QPay can only auto-refund
 * CARD payments. P2P (bank-app QR) payments — the common case for restaurant
 * orders — cannot be refunded through the API; those must be reversed by a
 * manual bank transfer. We capture payment_type at confirm time (see
 * markOrderPaid / qpayWebhook) and short-circuit P2P here with a clear error so
 * the admin knows to refund by hand.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getDb } from './db.js';
import { getAccessToken, readConfigFromEnv } from './qpayTokenCache.js';
import { qpayRefundPayment, QpayApiError } from './qpayClient.js';

const QPAY_USERNAME = defineSecret('QPAY_USERNAME');
const QPAY_PASSWORD = defineSecret('QPAY_PASSWORD');
const QPAY_INVOICE_CODE = defineSecret('QPAY_INVOICE_CODE');
const QPAY_BASE_URL = defineSecret('QPAY_BASE_URL');
const QPAY_CALLBACK_TOKEN = defineSecret('QPAY_CALLBACK_TOKEN');

// Mirrors HARDCODED_OWNER_EMAIL in src/context/AuthContext.tsx.
const HARDCODED_OWNER_EMAIL = 'boldsaihanlolor@gmail.com';

/**
 * Server-side admin check. Mirrors resolveIsAdmin() in AuthContext.tsx so the
 * same people who see the admin dashboard can refund: hardcoded owner email,
 * users/{uid}.role === 'admin', or an admin_emails/{email} doc.
 */
async function assertAdmin(
  auth: { uid: string; token: { email?: string } } | undefined,
): Promise<void> {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  const email = (auth.token.email ?? '').toLowerCase();
  if (email === HARDCODED_OWNER_EMAIL) return;

  const db = getDb();
  try {
    const userSnap = await db.doc(`users/${auth.uid}`).get();
    if (userSnap.exists && userSnap.data()?.role === 'admin') return;
  } catch {
    // fall through to admin_emails check
  }
  if (email) {
    const adminSnap = await db.doc(`admin_emails/${email}`).get();
    if (adminSnap.exists) return;
  }
  throw new HttpsError('permission-denied', 'Admins only');
}

export const refundQpayPayment = onCall(
  {
    region: 'asia-east1',
    secrets: [
      QPAY_USERNAME,
      QPAY_PASSWORD,
      QPAY_INVOICE_CODE,
      QPAY_BASE_URL,
      QPAY_CALLBACK_TOKEN,
    ],
  },
  async (req) => {
    await assertAdmin(req.auth);

    const { orderId, note } = (req.data ?? {}) as {
      orderId?: string;
      note?: string;
    };
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
      throw new HttpsError('failed-precondition', 'order is not a QPay order');
    }
    if (order.paymentStatus === 'REFUNDED') {
      // Idempotent: already refunded is a success, not an error.
      return { refunded: true, alreadyRefunded: true };
    }
    if (order.paymentStatus !== 'CONFIRMED') {
      throw new HttpsError(
        'failed-precondition',
        `order is ${order.paymentStatus}, only CONFIRMED orders can be refunded`,
      );
    }
    const paymentId: string | undefined = order.qpayPaymentId;
    if (!paymentId) {
      throw new HttpsError(
        'failed-precondition',
        'order has no qpayPaymentId — nothing to refund',
      );
    }

    // P2P payments are not refundable via the QPay API (card-only). Surface a
    // dedicated code so the UI can tell the admin to refund manually.
    if (order.qpayPaymentType && order.qpayPaymentType !== 'CARD') {
      throw new HttpsError(
        'failed-precondition',
        'P2P_NOT_REFUNDABLE: QPay can only auto-refund card payments. ' +
          'Refund this bank (P2P) payment with a manual transfer.',
      );
    }

    const config = readConfigFromEnv();
    const accessToken = await getAccessToken(config);

    try {
      await qpayRefundPayment(config.baseUrl, accessToken, paymentId, note);
    } catch (err) {
      // PAYMENT_ALREADY_CANCELED means a previous attempt DID refund at QPay
      // but we crashed before recording it (order stuck CONFIRMED). Treat it
      // as success and fall through to mark REFUNDED — otherwise no retry can
      // ever reconcile the order state.
      const alreadyRefunded =
        err instanceof QpayApiError && err.code === 'PAYMENT_ALREADY_CANCELED';
      if (!alreadyRefunded) {
        if (err instanceof QpayApiError) {
          logger.error('refundQpayPayment: QPay rejected refund', {
            orderId,
            paymentId,
            code: err.code,
            status: err.status,
          });
          // Bubble QPay's error key up so the client can show it verbatim.
          throw new HttpsError('failed-precondition', `QPAY_${err.code}`);
        }
        logger.error('refundQpayPayment: refund call failed', { orderId, err });
        throw new HttpsError('internal', 'refund failed — see logs');
      }
      logger.warn(
        'refundQpayPayment: QPay reports payment already refunded — reconciling order state',
        { orderId, paymentId },
      );
    }

    // Only mark REFUNDED if the order is still CONFIRMED (don't clobber a state
    // that changed under us between the read above and now).
    await db.runTransaction(async (t) => {
      const fresh = await t.get(ref);
      if (!fresh.exists) return;
      if (fresh.data()!.paymentStatus !== 'CONFIRMED') return;
      t.update(ref, {
        paymentStatus: 'REFUNDED',
        refundedAt: new Date().toISOString(),
        refundedVia: 'qpay',
        ...(note ? { refundNote: note } : {}),
      });
    });

    logger.info('refundQpayPayment: order refunded', { orderId, paymentId });
    return { refunded: true };
  },
);
