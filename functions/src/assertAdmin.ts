/**
 * Shared server-side admin check.
 *
 * Mirrors resolveIsAdmin() in src/context/AuthContext.tsx so the same people who
 * see the admin dashboard can perform admin-only server actions: hardcoded owner
 * email, users/{uid}.role === 'admin', or an admin_emails/{email} doc.
 *
 * Used by: refundQpayPayment, confirmOrderPayment.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './db.js';

// Mirrors HARDCODED_OWNER_EMAIL in src/context/AuthContext.tsx.
const HARDCODED_OWNER_EMAIL = 'boldsaihanlolor@gmail.com';

export type CallableAuth = { uid: string; token: { email?: string } } | undefined;

export async function assertAdmin(auth: CallableAuth): Promise<void> {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  const email = (auth.token.email ?? '').toLowerCase();
  if (email === HARDCODED_OWNER_EMAIL) return;

  const db = getDb();
  try {
    const userSnap = await db.doc(`users/${auth.uid}`).get();
    if (userSnap.exists && userSnap.data()?.role === 'admin') return;
  } catch {
    // fall through to admin_emails check
  }
  if (email) {
    const adminSnap = await db.doc(`admin_emails/${email}`).get();
    if (adminSnap.exists) return;
  }
  throw new HttpsError('permission-denied', 'Admins only');
}
