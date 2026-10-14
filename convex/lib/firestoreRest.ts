/**
 * Minimal Firestore REST reader for the one-off Firebase → Convex import.
 *
 * Unauthenticated, with the public web API key from firebase-applet-config.json,
 * so security rules apply: only publicly readable collections can be read (on
 * the live database that is menu and orders — settings is refused). That is
 * deliberate — no service-account key has to exist anywhere for the migration.
 */

export type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { referenceValue: string }
  | { bytesValue: string }
  | { geoPointValue: { latitude: number; longitude: number } };

export interface FirestoreSource {
  projectId: string;
  databaseId: string;
  apiKey: string;
}

export interface FirestoreDoc {
  id: string;
  data: Record<string, unknown>;
}

interface RestDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

/** Firestore's typed JSON → plain JS. Timestamps stay ISO strings, as the app stores them. */
export function decodeValue(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  if ("referenceValue" in value) return value.referenceValue;
  if ("bytesValue" in value) return value.bytesValue;
  return value.geoPointValue;
}

export function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  );
}

function toDoc(doc: RestDocument): FirestoreDoc {
  return {
    id: decodeURIComponent(doc.name.slice(doc.name.lastIndexOf("/") + 1)),
    data: decodeFields(doc.fields ?? {}),
  };
}

function documentsUrl(source: FirestoreSource): string {
  return (
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(source.projectId)}` +
    `/databases/${encodeURIComponent(source.databaseId)}/documents`
  );
}

async function runQuery(
  source: FirestoreSource,
  structuredQuery: Record<string, unknown>,
): Promise<FirestoreDoc[]> {
  const url = new URL(`${documentsUrl(source)}:runQuery`);
  url.searchParams.set("key", source.apiKey);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    throw new Error(`Firestore REST ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const rows = (await res.json()) as { document?: RestDocument }[];
  return rows.flatMap((row) => (row.document ? [toDoc(row.document)] : []));
}

/**
 * Every document in a collection (one read billed per document).
 *
 * Uses RunQuery, as the web SDK does, not ListDocuments: the production rules
 * refuse the REST list endpoint for the same collection the SDK can query.
 */
export function listCollection(
  source: FirestoreSource,
  collection: string,
): Promise<FirestoreDoc[]> {
  return runQuery(source, { from: [{ collectionId: collection }] });
}

/** Documents whose string `field` is >= `min` — e.g. orders since an ISO date. */
export function queryCollectionFrom(
  source: FirestoreSource,
  collection: string,
  field: string,
  min: string,
): Promise<FirestoreDoc[]> {
  return runQuery(source, {
    from: [{ collectionId: collection }],
    where: {
      fieldFilter: {
        field: { fieldPath: field },
        op: "GREATER_THAN_OR_EQUAL",
        value: { stringValue: min },
      },
    },
  });
}
