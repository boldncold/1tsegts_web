/**
 * QPay-related client-side config.
 *
 * Credentials and API URLs live in Cloud Functions secrets — NOT here.
 * This file only holds feature flags and presentation metadata (bank logo
 * fallbacks, ordering preference).
 */

/**
 * QPay is the primary payment option. Flip this to false to demote it back
 * behind cash + bank transfer for a soft-rollback.
 */
export const QPAY_ENABLED = true;

/**
 * Minutes a QPay invoice has to be paid before it expires.
 * Mirrors PAYMENT_WINDOW_MINUTES in bankConfig.ts. After this, the order
 * server-side expiry job (planned) will flip paymentStatus to EXPIRED.
 */
export const QPAY_PAYMENT_WINDOW_MINUTES = 15;

/**
 * Preferred display order for bank deeplinks. QPay returns ~17 banks; users
 * are most likely to have one of these on their phone. Banks not in this list
 * are appended at the end alphabetically.
 *
 * Match by `name` string from QpayBankDeeplink.
 */
export const QPAY_BANK_DISPLAY_ORDER = [
  'Khan bank',
  'Golomt bank',
  'State bank',
  'Xac bank',
  'Trade and Development bank of Mongolia',
  'Capital bank',
  'M bank',
  'Most money',
  'Toki app',
];
