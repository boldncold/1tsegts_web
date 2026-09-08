/**
 * Shared "order is paid" handler.
 *
 * Used by:
 *   - qpayWebhook (QPay callback path)
 *   - confirmOrderPayment (admin "Mark Paid" / bank-tx confirm path)
 *   - monpayWebhook (planned, see MONPAY_DEEPLINK_DESIGN.md)
 *
 * Idempotent: re-running with the same order produces no extra writes.
 *
 * When meta.bankTxId is supplied, the bank_transactions doc is reconciled in the
 * SAME transaction as the order. Splitting them would let a crash leave a
 * CONFIRMED order against an unreconciled tx, which the matcher would then see
 * as still-confirmable.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from './db.js';

// 'email_parse' was the Gmail-ingestion path and has been removed. Historical
// order docs may still carry it (and the older 'auto_email_match'); nothing
// reads paidVia, it is audit data.
export type PaidSource = 'qpay' | 'monpay' | 'admin_manual';

export interface PaidMeta {
  source: PaidSource;
  qpayPaymentId?: string;
  // QPay payment type ('P2P' | 'CARD') and wallet, captured at confirm time so
  // the refund path can tell whether QPay can auto-refund (CARD only) without a
  // second round-trip to the API.
  qpayPaymentType?: string;
  qpayPaymentWallet?: string;
  monpayTxnId?: string;
  bankTxId?: string;
  // Who confirmed, for admin-initiated confirmations. Taken from the caller's
  // verified auth token — never from anything the browser sends — so the order
  // carries a trustworthy record of which staff member took the money.
  paidByUid?: string;
  paidByEmail?: string;
}

export async function markOrderPaid(
  orderId: string,
  meta: PaidMeta,
): Promise<{ updated: boolean; reason?: string }> {
  const db = getDb();
  const ref = db.doc(`orders/${orderId}`);

  const txRef = meta.bankTxId ? db.doc(`bank_transactions/${meta.bankTxId}`) : null;

  return db.runTransaction(async (t) => {
    // Firestore requires every read before any write, so both docs are read up
    // front even though the tx doc is only written on the success path.
    const snap = await t.get(ref);
    const txSnap = txRef ? await t.get(txRef) : null;

    if (!snap.exists) return { updated: false, reason: 'order_not_found' };
    const order = snap.data()!;

    // Already paid — webhook retries are normal, no-op.
    if (order.paymentStatus === 'CONFIRMED') {
      return { updated: false, reason: 'already_confirmed' };
    }

    // Cash orders carry no paymentStatus at all: the customer pays the cashier
    // in person, so there is no invoice to await and nothing to expire. Those
    // are confirmable straight from "no payment state" when a cashier marks
    // them paid. Kept narrow deliberately — a cash order that has since been
    // EXPIRED or REFUNDED still fails the check below.
    const isUnpaidCashOrder =
      order.paymentMethod === 'cash' && order.paymentStatus == null;

    if (!isUnpaidCashOrder && order.paymentStatus !== 'AWAITING_PAYMENT') {
      return { updated: false, reason: `bad_state:${order.paymentStatus}` };
    }

    t.update(ref, {
      paymentStatus: 'CONFIRMED',
      paidAt: Timestamp.now().toDate().toISOString(),
      paidVia: meta.source,
      ...(meta.qpayPaymentId ? { qpayPaymentId: meta.qpayPaymentId } : {}),
      ...(meta.qpayPaymentType ? { qpayPaymentType: meta.qpayPaymentType } : {}),
      ...(meta.qpayPaymentWallet ? { qpayPaymentWallet: meta.qpayPaymentWallet } : {}),
      ...(meta.monpayTxnId ? { monpayTxnId: meta.monpayTxnId } : {}),
      ...(meta.bankTxId ? { matchedTxId: meta.bankTxId } : {}),
      ...(meta.paidByUid ? { paidByUid: meta.paidByUid } : {}),
      ...(meta.paidByEmail ? { paidBy: meta.paidByEmail } : {}),
    });

    // Reconcile the bank transaction alongside the order. Guarded on existence:
    // a stale tx id shouldn't fail an otherwise valid confirmation.
    if (txRef && txSnap?.exists) {
      t.update(txRef, {
        matchStatus: 'reconciled',
        matchedOrderId: orderId,
      });
    }

    return { updated: true };
  });
}
