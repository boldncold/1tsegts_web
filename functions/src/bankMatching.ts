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
import { logger } from 'firebase-functions';
import { markOrderPaid } from './markOrderPaid.js';

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

/**
 * Minimum incoming credit (MNT) that may auto-confirm an order. Anything below
 * is treated as noise — a refund fragment, a wrong-account transfer — even if
 * the description carries a valid reference code.
 *
 * Deliberately separate from MIN_BANK_TRANSFER_AMOUNT in src/lib/bankConfig.ts:
 * that one gates which orders may *offer* bank transfer at checkout. The two
 * happen to share a value today but are different decisions.
 */
export const MIN_AUTO_CONFIRM_AMOUNT_MNT = 5000;

/**
 * Only bank-issued notifications auto-confirm. Manual entries are typed by a
 * human and can carry typos, so they get a computed matchStatus for display but
 * always wait for a human to click confirm.
 */
const AUTO_CONFIRM_SOURCES = new Set(['gmail_apps_script', 'gmail_api']);

/**
 * Allowlist, not a blocklist: a transaction auto-confirms only if it clears
 * every condition. Note `direction === 'credit'` — the client-side matcher this
 * replaces never checked it, so a debit carrying a reference code could confirm
 * an order as paid.
 */
export function isAutoConfirmable(tx: BankTxLike): boolean {
  return (
    typeof tx.source === 'string' &&
    AUTO_CONFIRM_SOURCES.has(tx.source) &&
    tx.direction === 'credit' &&
    typeof tx.amountMnt === 'number' &&
    tx.amountMnt >= MIN_AUTO_CONFIRM_AMOUNT_MNT
  );
}

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
  confirmed: boolean;
  /** Why no confirmation happened, when status was otherwise confirmable. */
  skipped?: string;
}

/**
 * Recompute one transaction's match, persist it, and auto-confirm when allowed.
 *
 * Idempotent: markOrderPaid() no-ops on an already-CONFIRMED order and writes
 * the reconciled tx state in the same transaction, so a replay costs a read.
 */
export async function processTransaction(
  db: Firestore,
  txId: string,
  tx: BankTxLike,
): Promise<ProcessOutcome> {
  const match = await matchTransaction(db, tx);

  if (match.status === 'reconciled') {
    return { txId, status: 'reconciled', confirmed: false, skipped: 'already_reconciled' };
  }

  // Persist the computed status so the dashboard can render without matching.
  if (tx.matchStatus !== match.status || tx.matchedOrderId !== match.orderId) {
    await db.doc(`bank_transactions/${txId}`).update({
      matchStatus: match.status,
      ...(match.orderId ? { matchedOrderId: match.orderId } : {}),
    });
  }

  if (match.status !== 'matched' || !match.orderId) {
    return { txId, status: match.status, confirmed: false };
  }
  if (!isAutoConfirmable(tx)) {
    return { txId, status: match.status, confirmed: false, skipped: 'not_auto_confirmable' };
  }

  const result = await markOrderPaid(match.orderId, {
    source: 'email_parse',
    bankTxId: txId,
  });

  if (!result.updated) {
    logger.warn('bank auto-confirm refused', {
      txId,
      orderId: match.orderId,
      reason: result.reason,
    });
  }

  return {
    txId,
    status: result.updated ? 'reconciled' : match.status,
    confirmed: result.updated,
    ...(result.updated ? {} : { skipped: result.reason ?? 'mark_order_paid_refused' }),
  };
}
