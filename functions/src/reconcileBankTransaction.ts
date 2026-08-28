/**
 * Firestore trigger: reconcileBankTransaction
 *
 * Fires when a bank transaction is ingested (Gmail Apps Script, Gmail API, or an
 * admin's manual entry) and matches it against orders, auto-confirming when the
 * transaction clears every guard in isAutoConfirmable().
 *
 * onDocumentCreated, deliberately not onDocumentWritten: processTransaction()
 * writes matchStatus back onto this same doc, which under onDocumentWritten
 * would re-fire this trigger and loop. Re-matching after creation — an order
 * arriving after its transfer, an amount being corrected — is
 * sweepBankTransactions' job.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getDb, DATABASE_ID } from './db.js';
import { processTransaction, type BankTxLike } from './bankMatching.js';

export const reconcileBankTransaction = onDocumentCreated(
  {
    region: 'asia-east1',
    document: 'bank_transactions/{txId}',
    // This project uses a NAMED Firestore database. Triggers bind to a database
    // at deploy time; without this the trigger targets `(default)` and does not
    // deploy at all — quietly, while the rest of the codebase deploys fine.
    database: DATABASE_ID,
  },
  async (event) => {
    const txId = event.params.txId;
    const tx = event.data?.data() as BankTxLike | undefined;

    if (!tx) {
      logger.warn('reconcileBankTransaction: no document data', { txId });
      return;
    }

    try {
      const outcome = await processTransaction(getDb(), txId, tx);
      logger.info('reconcileBankTransaction', outcome);
    } catch (err) {
      // Rethrow so the platform retries — a dropped match means a customer paid
      // and nothing confirmed.
      logger.error('reconcileBankTransaction failed', { txId, err });
      throw err;
    }
  },
);
