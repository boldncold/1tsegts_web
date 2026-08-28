/**
 * Scheduled Cloud Function: sweepBankTransactions
 *
 * Runs every 5 minutes over transactions that aren't reconciled yet and
 * re-matches them. Three jobs:
 *
 *   1. The transaction-before-order case. A transfer can land before its order
 *      exists (unknown_ref); the create trigger has already fired and won't fire
 *      again, so only a sweep can pick it up once the order appears.
 *   2. Backstop for a failed or dropped trigger. Since the client-side
 *      auto-confirm loop is gone, nobody's browser is retrying any more.
 *   3. Self-healing after deploy — statuses written by the old client matcher
 *      converge on the first pass.
 *
 * Logs every pass including empty ones: a sweep that examined nothing and a
 * sweep that never ran look identical otherwise, and that is exactly the
 * failure nobody is watching for now.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getDb } from './db.js';
import { processTransaction, type BankTxLike } from './bankMatching.js';

// Bounded so a backlog can't turn one pass into an unbounded read bill.
const SWEEP_LIMIT = 200;

const OPEN_STATUSES = ['unmatched', 'matched', 'amount_mismatch', 'unknown_ref'];

export const sweepBankTransactions = onSchedule(
  {
    region: 'asia-east1',
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Ulaanbaatar',
  },
  async () => {
    const db = getDb();

    const snap = await db
      .collection('bank_transactions')
      .where('matchStatus', 'in', OPEN_STATUSES)
      .limit(SWEEP_LIMIT)
      .get();

    if (snap.empty) {
      logger.info('sweepBankTransactions: examined 0, nothing open');
      return;
    }

    let confirmed = 0;
    const skipped: Record<string, number> = {};

    for (const d of snap.docs) {
      try {
        const outcome = await processTransaction(db, d.id, d.data() as BankTxLike);
        if (outcome.confirmed) confirmed += 1;
        if (outcome.skipped) skipped[outcome.skipped] = (skipped[outcome.skipped] ?? 0) + 1;
      } catch (err) {
        // One bad transaction must not abort the pass.
        skipped.error = (skipped.error ?? 0) + 1;
        logger.error('sweepBankTransactions: transaction failed', { txId: d.id, err });
      }
    }

    logger.info('sweepBankTransactions', {
      examined: snap.size,
      confirmed,
      skipped,
      // Says out loud that coverage was cut short rather than looking complete.
      truncated: snap.size === SWEEP_LIMIT,
    });
  },
);
