/**
 * Shared "order is paid" handler.
 *
 * Used by:
 *   - qpayWebhook (QPay callback path)
 *   - createBankTransferOrder admin "Mark Paid" path (future)
 *   - monpayWebhook (planned, see MONPAY_DEEPLINK_DESIGN.md)
 *
 * Idempotent: re-running with the same order produces no extra writes.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from './db.js';

export type PaidSource = 'qpay' | 'monpay' | 'admin_manual' | 'email_parse';

export interface PaidMeta {
  source: PaidSource;
  qpayPaymentId?: string;
  monpayTxnId?: string;
  bankTxId?: string;
}

export async function markOrderPaid(
  orderId: string,
  meta: PaidMeta,
): Promise<{ updated: boolean; reason?: string }> {
  const db = getDb();
  const ref = db.doc(`orders/${orderId}`);

  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return { updated: false, reason: 'order_not_found' };
    const order = snap.data()!;

    // Already paid — webhook retries are normal, no-op.
    if (order.paymentStatus === 'CONFIRMED') {
      return { updated: false, reason: 'already_confirmed' };
    }
    // Order moved past AWAITING_PAYMENT (expired, refunded, cancelled).
    if (order.paymentStatus !== 'AWAITING_PAYMENT') {
      return { updated: false, reason: `bad_state:${order.paymentStatus}` };
    }

    t.update(ref, {
      paymentStatus: 'CONFIRMED',
      paidAt: Timestamp.now().toDate().toISOString(),
      paidVia: meta.source,
      ...(meta.qpayPaymentId ? { qpayPaymentId: meta.qpayPaymentId } : {}),
      ...(meta.monpayTxnId ? { monpayTxnId: meta.monpayTxnId } : {}),
      ...(meta.bankTxId ? { matchedTxId: meta.bankTxId } : {}),
    });

    return { updated: true };
  });
}
