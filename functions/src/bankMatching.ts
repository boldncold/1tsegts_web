/**
 * Bank-transaction matching — the single implementation.
 *
 * Was previously computeMatchStatus() inside AdminDashboard.tsx, which ran in
 * whichever admin happened to have the dashboard open. The server now owns it:
 * reconcileBankTransaction (on create) and sweepBankTransactions (every 5 min)
 * both call processTransaction() here, and the client just renders the
 * matchStatus / matchedOrderId this writes.
 *
 * Consequence worth knowing: matchedOrderId used to mean "the order this was
 * reconciled against" and is now "the order this currently matches". Read it
 * together with matchStatus === 'reconciled' if you need proof of payment.
 */

import type { Firestore } from 'firebase-admin/firestore';

export type BankTxMatchStatus =
  | 'unmatched'
  | 'matched'
  | 'amount_mismatch'
  | 'unknown_ref'
  | 'reconciled';

export interface BankTxLike {
  source?: string;
  direction?: string;
  amountMnt?: number;
  description?: string;
  matchStatus?: BankTxMatchStatus;
  matchedOrderId?: string;
}

export interface MatchResult {
  status: BankTxMatchStatus;
  orderId?: string;
}

/** Reference codes the checkout hands the customer, e.g. GR-7K2M9Q. */
const REF_CODE_RE = /GR-[A-Z2-9]{6}/i;

/** Pure given the orders it reads: works out what this transaction matches. */
export async function matchTransaction(
  db: Firestore,
  tx: BankTxLike,
): Promise<MatchResult> {
  // Reconciled is terminal — an admin or a prior run already settled it.
  if (tx.matchStatus === 'reconciled' && tx.matchedOrderId) {
    return { status: 'reconciled', orderId: tx.matchedOrderId };
  }

  const ref = tx.description?.match(REF_CODE_RE)?.[0]?.toUpperCase();
  if (!ref) return { status: 'unmatched' };

  const snap = await db
    .collection('orders')
    .where('referenceCode', '==', ref)
    .limit(1)
    .get();

  if (snap.empty) return { status: 'unknown_ref' };

  const orderDoc = snap.docs[0];
  const order = orderDoc.data();

  if (typeof order.amountMnt === 'number' && order.amountMnt !== tx.amountMnt) {
    return { status: 'amount_mismatch', orderId: orderDoc.id };
  }
  return { status: 'matched', orderId: orderDoc.id };
}

export interface ProcessOutcome {
  txId: string;
  status: BankTxMatchStatus;
  /** True when this pass changed the stored match. */
  updated: boolean;
}

/**
 * Recompute one transaction's match and persist it.
 *
 * Nothing is confirmed here. Every transaction is now entered by hand, and a
 * human-typed amount or reference can be wrong, so matching only ever produces
 * a status for the dashboard — an admin verifies the transfer and clicks
 * Confirm, which goes through confirmOrderPayment.
 *
 * Idempotent: re-running writes nothing when the computed match is unchanged.
 */
export async function processTransaction(
  db: Firestore,
  txId: string,
  tx: BankTxLike,
): Promise<ProcessOutcome> {
  const match = await matchTransaction(db, tx);

  if (match.status === 'reconciled') {
    return { txId, status: 'reconciled', updated: false };
  }

  if (tx.matchStatus === match.status && tx.matchedOrderId === match.orderId) {
    return { txId, status: match.status, updated: false };
  }

  await db.doc(`bank_transactions/${txId}`).update({
    matchStatus: match.status,
    ...(match.orderId ? { matchedOrderId: match.orderId } : {}),
  });

  return { txId, status: match.status, updated: true };
}
