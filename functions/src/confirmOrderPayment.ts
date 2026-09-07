/**
 * Callable Cloud Function: confirmOrderPayment
 *
 * Admin-only. The single client-reachable path for flipping an order to
 * paymentStatus = CONFIRMED. Replaces the direct Firestore write the admin
 * dashboard used to perform, which had no state guard and ran outside a
 * transaction — an admin could confirm an EXPIRED or REFUNDED order.
 *
 * All the real work lives in markOrderPaid(), which qpayWebhook also uses, so
 * there is exactly one definition of "this order is paid".
 *
 * Returns markOrderPaid's result rather than throwing on a refusal: the caller
 * needs to tell "already confirmed" (benign — the webhook won the race) apart
 * from "bad state" (an admin believes money arrived for a written-off order).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { assertAdmin } from './assertAdmin.js';
import { markOrderPaid, type PaidSource } from './markOrderPaid.js';

// The only source an admin-initiated confirmation may claim. 'qpay' / 'monpay'
// are webhook-only and deliberately not reachable from here.
const ALLOWED_SOURCES: PaidSource[] = ['admin_manual'];

export interface ConfirmOrderPaymentRequest {
  orderId: string;
  /** Reconciles this bank_transactions doc in the same transaction. */
  bankTxId?: string;
  /** Defaults to 'admin_manual' (a human clicked confirm). */
  source?: PaidSource;
}

export const confirmOrderPayment = onCall<ConfirmOrderPaymentRequest>(
  { region: 'asia-east1' },
  async (req) => {
    await assertAdmin(req.auth);

    const { orderId, bankTxId, source } = req.data ?? ({} as ConfirmOrderPaymentRequest);

    if (typeof orderId !== 'string' || !orderId.trim()) {
      throw new HttpsError('invalid-argument', 'orderId is required');
    }
    if (bankTxId !== undefined && (typeof bankTxId !== 'string' || !bankTxId.trim())) {
      throw new HttpsError('invalid-argument', 'bankTxId must be a non-empty string');
    }
    if (source !== undefined && !ALLOWED_SOURCES.includes(source)) {
      throw new HttpsError('invalid-argument', `source must be one of ${ALLOWED_SOURCES.join(', ')}`);
    }

    // Attribution comes from the verified auth token, never from req.data —
    // the whole point of routing this through a callable is that the browser
    // does not get to author payment facts, and "who took the money" is one.
    const result = await markOrderPaid(orderId, {
      source: source ?? 'admin_manual',
      ...(bankTxId ? { bankTxId } : {}),
      ...(req.auth?.uid ? { paidByUid: req.auth.uid } : {}),
      ...(req.auth?.token?.email ? { paidByEmail: req.auth.token.email } : {}),
    });

    // Every confirmation attempt is a money event — log the outcome either way.
    logger.info('confirmOrderPayment', {
      orderId,
      bankTxId: bankTxId ?? null,
      source: source ?? 'admin_manual',
      uid: req.auth?.uid,
      updated: result.updated,
      reason: result.reason ?? null,
    });

    return result;
  },
);
