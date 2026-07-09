/**
 * Shared Firestore handle for Cloud Functions.
 *
 * The client app (src/firebase.ts) writes to a NAMED Firestore database
 * (`firestoreDatabaseId` in firebase-applet-config.json), not the implicit
 * `(default)` database. Cloud Functions must read/write the same named
 * database, otherwise lookups for client-written docs return "not found".
 *
 * Set the FIRESTORE_DATABASE_ID env var at deploy time (or rely on the
 * baked-in fallback, which mirrors firebase-applet-config.json).
 */

import { getFirestore, Firestore } from 'firebase-admin/firestore';

const FALLBACK_DATABASE_ID = 'ai-studio-c9d0a348-c974-424c-a7d7-b422ac0da613';

let cached: Firestore | null = null;

export function getDb(): Firestore {
  if (cached) return cached;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || FALLBACK_DATABASE_ID;
  cached = getFirestore(databaseId);
  // External payloads (QPay invoice/payment responses) routinely omit optional
  // fields. Without this, writing such a field as `undefined` throws "Cannot use
  // undefined as a Firestore value" and aborts the whole operation. Drop
  // undefined values instead so a missing optional field is simply not written.
  // Must be set once, before the instance is first used — getDb caches, so this
  // runs exactly once.
  cached.settings({ ignoreUndefinedProperties: true });
  return cached;
}
