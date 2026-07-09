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
 * QPay's universal deeplink base. Tapping `https://qpay.mn/q?q=<qr_text>` on a
 * phone opens the QPay app (or a bank chooser); on desktop it opens qpay.mn's
 * web handler. The `q` param is the EMV QR payload (`qr_text` from the invoice)
 * — the same code encoded in the QR image.
 *
 * Why we need it: a customer paying on their phone can't scan a QR shown on
 * that same phone, and the per-bank `khanbank://…` deeplinks only fire if that
 * exact bank app is installed. This universal link is the reliable
 * "pay on this device" action.
 */
export const QPAY_UNIVERSAL_DEEPLINK_BASE = 'https://qpay.mn/q';

/** Build the universal QPay deeplink for a given invoice `qr_text`. */
export function buildQpayUniversalLink(qrText: string): string {
  return `${QPAY_UNIVERSAL_DEEPLINK_BASE}?q=${encodeURIComponent(qrText)}`;
}

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
