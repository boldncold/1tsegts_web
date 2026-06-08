/**
 * QPay access-token cache, backed by Firestore.
 *
 * The QPay `/auth/token` endpoint should be called sparingly — the spec warns
 * that refresh is one-shot per token. We cache the access_token in Firestore
 * (collection `qpay_state`, doc `token`) and re-use it until ~60s before it
 * expires, then re-auth from scratch.
 *
 * Required secrets (set with `firebase functions:secrets:set`):
 *   QPAY_USERNAME       — merchant username (e.g. 1TSEGTS)
 *   QPAY_PASSWORD       — merchant password
 *   QPAY_INVOICE_CODE   — merchant invoice code (e.g. 1TSEGTS_INVOICE)
 *   QPAY_BASE_URL       — https://merchant.qpay.mn  (or sandbox URL)
 *   QPAY_CALLBACK_TOKEN — random string we add to the callback URL as a query
 *                         param; we verify it on the webhook to reject random
 *                         POSTs (QPay v2 doesn't sign callbacks).
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from './db.js';
import { qpayAuth, type QpayAuthResponse } from './qpayClient.js';

const TOKEN_DOC = 'qpay_state/token';
const REAUTH_BUFFER_SECONDS = 60;

export interface QpayConfig {
  baseUrl: string;
  username: string;
  password: string;
  invoiceCode: string;
  callbackToken: string;
}

export function readConfigFromEnv(): QpayConfig {
  const baseUrl = process.env.QPAY_BASE_URL;
  const username = process.env.QPAY_USERNAME;
  const password = process.env.QPAY_PASSWORD;
  const invoiceCode = process.env.QPAY_INVOICE_CODE;
  const callbackToken = process.env.QPAY_CALLBACK_TOKEN;

  if (!baseUrl || !username || !password || !invoiceCode || !callbackToken) {
    throw new Error(
      'QPay config missing. Set QPAY_BASE_URL, QPAY_USERNAME, QPAY_PASSWORD, ' +
      'QPAY_INVOICE_CODE, QPAY_CALLBACK_TOKEN via firebase functions:secrets:set',
    );
  }
  return { baseUrl, username, password, invoiceCode, callbackToken };
}

interface CachedToken {
  access_token: string;
  refresh_token: string;
  expires_at: Timestamp; // when access_token becomes unusable
  refresh_expires_at: Timestamp;
  cached_at: Timestamp;
  base_url?: string;     // which QPay env this token was issued against
}

export async function getAccessToken(config: QpayConfig): Promise<string> {
  const db = getDb();
  const ref = db.doc(TOKEN_DOC);
  const snap = await ref.get();
  const now = Date.now();

  if (snap.exists) {
    const data = snap.data() as CachedToken;
    const expiresAtMs = data.expires_at.toMillis();
    // Treat a missing base_url field as "unknown env" — force re-auth. The
    // field is new; legacy cache entries (from before the prod→sandbox
    // migration) lack it and must not be trusted.
    const sameEnv = data.base_url === config.baseUrl;
    if (sameEnv && expiresAtMs - now > REAUTH_BUFFER_SECONDS * 1000) {
      return data.access_token;
    }
  }

  // Re-auth. Don't try to refresh — spec says refresh is one-shot per token,
  // and we'd rather burn a fresh auth than risk a revoked refresh.
  const fresh = await qpayAuth(config.baseUrl, config.username, config.password);
  await ref.set(toCached(fresh, config.baseUrl));
  return fresh.access_token;
}

function toCached(r: QpayAuthResponse, baseUrl: string): CachedToken {
  // QPay returns Unix timestamps (seconds) in expires_in / refresh_expires_in.
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: Timestamp.fromMillis(r.expires_in * 1000),
    refresh_expires_at: Timestamp.fromMillis(r.refresh_expires_in * 1000),
    cached_at: Timestamp.now(),
    base_url: baseUrl,
  };
}
