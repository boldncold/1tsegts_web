/**
 * 1tsegts Cloud Functions — entrypoint.
 *
 * Initializes firebase-admin and re-exports each function so Firebase CLI can
 * deploy them individually.
 */

import { initializeApp } from 'firebase-admin/app';

initializeApp();

// Bump on runtime/dependency changes to force the Firebase CLI's hash-based
// change detection to redeploy every function (it otherwise skips when only
// firebase.json runtime is changed). Increment whenever you redeploy for an
// infrastructure-only reason.
export const FUNCTIONS_DEPLOY_REV = 2;

export { createQpayInvoice } from './createQpayInvoice.js';
export { qpayWebhook } from './qpayWebhook.js';
export { expirePendingQpayInvoices } from './expirePendingQpayInvoices.js';
