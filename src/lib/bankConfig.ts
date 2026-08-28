/**
 * Bank account details shown to customers when they pick "Bank Transfer" at checkout.
 *
 * v0: hardcoded constants. Replace the placeholder values below with your
 * real Khan Bank personal-account info before testing.
 *
 * Future: move these to Firestore /settings/bank so the admin can edit them
 * without redeploying.
 */

export const BANK_DETAILS = {
  bankName: {
    en: 'Khan Bank',
    mn: 'Хаан банк',
  },
  accountNumber: '0000000000', // ← REPLACE with your Khan Bank account number
  accountHolder: 'BOLDSAIHAN',  // ← REPLACE with the name on the account, exactly as Khan shows it
} as const;

/** Minutes a bank-transfer order has to be paid before it expires. */
export const PAYMENT_WINDOW_MINUTES = 30;

/**
 * Minimum order total (MNT) to allow paying by bank transfer.
 * Inter-bank transfers in MN cost the customer ~₮300–500 in fees, so very
 * small orders aren't worth paying this way — push customers to cash instead.
 *
 * NOTE: nothing enforces this at checkout yet — the bank-transfer option is
 * offered regardless of total.
 *
 * The auto-confirm floor is a separate decision and lives server-side as
 * MIN_AUTO_CONFIRM_AMOUNT_MNT in functions/src/bankMatching.ts.
 */
export const MIN_BANK_TRANSFER_AMOUNT = 5000;
