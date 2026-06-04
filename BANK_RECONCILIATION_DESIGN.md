# Bank Transfer Reconciliation — adapted for the 1tsegts (Grand) stack

This is the bank-transfer reconciliation design rewritten to fit **this** project:
React + Vite + Express + **Firebase Firestore + Firebase Auth + Cloud Functions**, running on Cloud Run via AI Studio.

It plugs into the existing `Order` entity (see `firebase-blueprint.json`) and the `pendingOrderId` flow already in `CartContext.tsx`, so customers get a live "payment received" update without polling the page.

---

## 0. What changes vs. the original sketch

| Original | Adapted for this project |
|---|---|
| PostgreSQL schema with `CREATE TABLE` | Firestore collections + composite indexes |
| `SELECT … FOR UPDATE` row locks | Firestore **transactions** (`runTransaction`) |
| Standalone Node polling worker | **Cloud Function** on a `pubsub.schedule()` trigger |
| Express webhook for bank callback | Cloud Function HTTPS trigger (`onRequest`) |
| Customer polls `/api/order/:id` | Existing `onSnapshot(doc(db,'orders',id))` in `CartContext` does it for free |
| New `orders` table | Extend the existing `Order` entity with payment fields |
| Reference like `ORD-K7P3M9` in the bank description | Same idea, but stored on the `orders` doc |

The customer-facing flow stays the same as today — they create an order, see a "pending" screen — except now that screen displays bank details + a reference code, and `CartContext`'s existing `onSnapshot` listener flips the screen the moment a Cloud Function marks the order paid.

---

## 1. Extended `Order` schema

Update `firebase-blueprint.json` `Order` entity with payment fields. Existing `status` stays the kitchen status; add a separate `paymentStatus` so payment and fulfillment don't collide.

```jsonc
"Order": {
  "properties": {
    // ... existing fields ...
    "paymentMethod":     { "type": "string", "enum": ["cash", "bank_transfer", "qpay"] },
    "paymentStatus":     { "type": "string", "enum": ["AWAITING_PAYMENT", "CONFIRMED", "EXPIRED", "MANUAL_REVIEW", "REFUNDED"] },
    "referenceCode":     { "type": "string" },               // e.g. "GR-K7P3M9"
    "amountMnt":         { "type": "integer" },              // integer MNT, mirrors total
    "paymentExpiresAt":  { "type": "string", "format": "date-time" },
    "matchedTxId":       { "type": "string" },               // doc id in /bank_transactions
    "paidAt":            { "type": "string", "format": "date-time" }
  }
}
```

Important: keep `status` (kitchen) and `paymentStatus` (money) **separate**. An order can be `paymentStatus=CONFIRMED` while `status=preparing`. The kitchen should never start cooking until `paymentStatus === 'CONFIRMED'`.

---

## 2. New Firestore collections

```
/orders/{orderId}                  # existing, extended above
/bank_transactions/{txId}          # NEW: every credit on the merchant account
/reconciliation_queue/{itemId}     # NEW: things ops needs to look at
/polling_state/{accountNumber}     # NEW: cursor for the polling worker
```

### `/bank_transactions/{txId}`

```ts
interface BankTransaction {
  bankTxId: string;          // unique per bank, used as the doc id (dedup key)
  amountMnt: number;         // integer MNT
  description: string;       // raw memo from the bank
  senderAccount: string;
  senderName: string;
  postedAt: Timestamp;
  matchedOrderId: string | null;
  status: 'UNMATCHED' | 'MATCHED' | 'NEEDS_REVIEW';
  createdAt: Timestamp;
}
```

Use the bank's transaction id as the **document id**. Firestore writes with the same id are idempotent — perfect for re-poll safety.

### `/reconciliation_queue/{itemId}`

```ts
interface ReconciliationItem {
  bankTxId: string;
  candidateOrderId: string | null;
  reason: 'AMOUNT_MISMATCH' | 'UNKNOWN_REF' | 'AMOUNT_ONLY_MATCH'
        | 'AMBIGUOUS_AMOUNT' | 'NO_MATCH' | 'DOUBLE_PAYMENT';
  notes?: string;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string; // admin uid
}
```

### `/polling_state/{accountNumber}`

Cursor for the bank polling Cloud Function — last successful poll time and last seen tx id.

### Firestore composite indexes

In `firestore.indexes.json` (create if missing):

```json
{
  "indexes": [
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "paymentStatus", "order": "ASCENDING" },
        { "fieldPath": "referenceCode", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "paymentStatus", "order": "ASCENDING" },
        { "fieldPath": "amountMnt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "paymentStatus", "order": "ASCENDING" },
        { "fieldPath": "paymentExpiresAt", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### Security rules

In `firestore.rules`:

```
match /bank_transactions/{txId} {
  allow read, write: if false;       // only the Cloud Function service account
}
match /reconciliation_queue/{itemId} {
  allow read, write: if request.auth.token.admin == true;
}
match /polling_state/{acct} {
  allow read, write: if false;
}
match /orders/{orderId} {
  // customer can read their own order to watch paymentStatus flip
  allow read: if request.auth != null && resource.data.userId == request.auth.uid;
  // payment fields are server-only — never let the client touch them
  allow update: if request.auth.token.admin == true
                || (request.auth != null
                    && !affectsPaymentFields(request.resource.data, resource.data));
}

function affectsPaymentFields(after, before) {
  return after.paymentStatus != before.paymentStatus
      || after.matchedTxId    != before.matchedTxId
      || after.paidAt         != before.paidAt
      || after.amountMnt      != before.amountMnt;
}
```

---

## 3. Reference code generation (client or callable function)

Drop-in for `src/lib/referenceCode.ts`. Uses a typo-safe alphabet (no `0/O`, `1/I/L`):

```ts
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateReferenceCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = 'GR-';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}
```

Prefix is `GR-` (Grand) so it's recognizable in the bank statement description.

> The collision odds for 6 chars over 31 symbols are negligible at restaurant volume, but make `referenceCode` unique by relying on a transactional `getDoc`+`setDoc` check inside the order-create function.

---

## 4. Order creation — new Cloud Function

`functions/src/createBankTransferOrder.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { generateReferenceCode } from './referenceCode.js';

const PAYMENT_WINDOW_MINUTES = 30;

export const createBankTransferOrder = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const db = getFirestore();

  const { items, total, customerName, phone, orderType, kioskNumber, notes } = req.data;
  if (!Array.isArray(items) || !total || total <= 0) {
    throw new HttpsError('invalid-argument', 'bad order');
  }

  // Generate a unique reference. Loop until the doc id is free in the index.
  let ref = generateReferenceCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const dupe = await db.collection('orders')
      .where('referenceCode', '==', ref)
      .where('paymentStatus', '==', 'AWAITING_PAYMENT')
      .limit(1).get();
    if (dupe.empty) break;
    ref = generateReferenceCode();
  }

  const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000);
  const docRef = db.collection('orders').doc();

  await docRef.set({
    items,
    total,
    customerName,
    phone,
    orderType,
    kioskNumber: kioskNumber ?? null,
    notes: notes ?? '',
    status: 'pending',
    timestamp: Timestamp.now(),
    userId: req.auth.uid,
    paymentMethod: 'bank_transfer',
    paymentStatus: 'AWAITING_PAYMENT',
    referenceCode: ref,
    amountMnt: Math.round(total),
    paymentExpiresAt: Timestamp.fromDate(expiresAt),
    matchedTxId: null,
    paidAt: null,
  });

  return {
    orderId: docRef.id,
    referenceCode: ref,
    amountMnt: Math.round(total),
    expiresAt: expiresAt.toISOString(),
    bankInstructions: {
      bankName: 'Khan Bank',
      accountNumber: process.env.MERCHANT_ACCOUNT,
      accountHolder: 'Grand LLC',
      memo: ref,
    },
  };
});
```

The client calls this via `httpsCallable(functions, 'createBankTransferOrder')` and feeds the returned `orderId` into the existing `setPendingOrderId(...)` in `CartContext`. The existing `onSnapshot` listener on `/orders/{orderId}` will then surface every status change to the UI in real time — no polling.

---

## 5. Bank polling — scheduled Cloud Function

`functions/src/pollBank.ts`:

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { fetchKhanBankStatement, type RawTx } from './bankClient.js';
import { reconcile } from './reconcile.js';

const ACCOUNT = process.env.MERCHANT_ACCOUNT!;

export const pollBank = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'Asia/Ulaanbaatar', secrets: ['BANK_API_KEY'] },
  async () => {
    const db = getFirestore();
    const stateRef = db.doc(`polling_state/${ACCOUNT}`);
    const state = (await stateRef.get()).data();
    const since = state?.lastPolledAt?.toDate() ?? new Date(Date.now() - 24 * 3600_000);

    let txs: RawTx[];
    try {
      txs = await fetchKhanBankStatement({ account: ACCOUNT, from: since, to: new Date() });
    } catch (err) {
      console.error('bank api error', err);
      return; // don't update cursor on failure — we'll retry next minute
    }

    for (const tx of txs) {
      // Idempotent: doc id == bank's tx id, second insert is a no-op
      const txDocRef = db.collection('bank_transactions').doc(tx.id);
      const existing = await txDocRef.get();
      if (existing.exists) continue;

      const stored = {
        bankTxId: tx.id,
        amountMnt: tx.amount,
        description: tx.description ?? '',
        senderAccount: tx.senderAccount ?? '',
        senderName: tx.senderName ?? '',
        postedAt: Timestamp.fromDate(tx.postedAt),
        matchedOrderId: null,
        status: 'UNMATCHED' as const,
        createdAt: FieldValue.serverTimestamp(),
      };
      await txDocRef.set(stored);
      await reconcile(txDocRef.id, stored);
    }

    await stateRef.set({ lastPolledAt: Timestamp.now() }, { merge: true });
  }
);
```

Why scheduled, not the `pollLoop` from the original?
Cloud Run / Cloud Functions are stateless and may scale to zero — you can't keep a long-running `setInterval`. `onSchedule` gives you exactly-one-instance-per-tick semantics for free.

---

## 6. The matcher — reused, but in Firestore transactions

`functions/src/reconcile.ts`:

```ts
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const REF_REGEX = /GR-[A-Z2-9]{6}/;

export async function reconcile(txDocId: string, tx: {
  amountMnt: number; description: string;
}) {
  const db = getFirestore();
  const ref = tx.description.match(REF_REGEX)?.[0];

  // Layer 1: exact match on reference + amount
  if (ref) {
    const snap = await db.collection('orders')
      .where('referenceCode', '==', ref)
      .where('paymentStatus', '==', 'AWAITING_PAYMENT')
      .limit(1).get();

    if (!snap.empty) {
      const orderDoc = snap.docs[0];
      if (orderDoc.data().amountMnt === tx.amountMnt) {
        return markPaid(orderDoc.ref.id, txDocId);
      }
      return flagForReview(txDocId, 'AMOUNT_MISMATCH', orderDoc.ref.id);
    }
    return flagForReview(txDocId, 'UNKNOWN_REF', null);
  }

  // Layer 2: amount-only match
  const candidates = await db.collection('orders')
    .where('paymentStatus', '==', 'AWAITING_PAYMENT')
    .where('amountMnt', '==', tx.amountMnt)
    .get();

  if (candidates.size === 1) {
    return flagForReview(txDocId, 'AMOUNT_ONLY_MATCH', candidates.docs[0].id);
  }
  if (candidates.size > 1) {
    return flagForReview(txDocId, 'AMBIGUOUS_AMOUNT', null);
  }
  return flagForReview(txDocId, 'NO_MATCH', null);
}

async function markPaid(orderId: string, txDocId: string) {
  const db = getFirestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const txRef = db.doc(`bank_transactions/${txDocId}`);

  await db.runTransaction(async (t) => {
    const [orderSnap, txSnap] = await Promise.all([t.get(orderRef), t.get(txRef)]);
    const order = orderSnap.data();
    if (!order || order.paymentStatus !== 'AWAITING_PAYMENT') {
      // Race: someone else (or a re-poll) already claimed it
      t.set(db.collection('reconciliation_queue').doc(), {
        bankTxId: txDocId,
        candidateOrderId: orderId,
        reason: 'DOUBLE_PAYMENT',
        createdAt: Timestamp.now(),
      });
      t.update(txRef, { status: 'NEEDS_REVIEW' });
      return;
    }
    t.update(orderRef, {
      paymentStatus: 'CONFIRMED',
      matchedTxId: txDocId,
      paidAt: Timestamp.now(),
      // NOTE: leave `status` alone — kitchen workflow stays as-is
    });
    t.update(txRef, { status: 'MATCHED', matchedOrderId: orderId });
  });
}

async function flagForReview(
  txDocId: string,
  reason: string,
  candidateOrderId: string | null,
) {
  const db = getFirestore();
  await db.collection('reconciliation_queue').add({
    bankTxId: txDocId,
    candidateOrderId,
    reason,
    createdAt: Timestamp.now(),
  });
  await db.doc(`bank_transactions/${txDocId}`).update({ status: 'NEEDS_REVIEW' });
}
```

The Firestore transaction gives you the same race-free guarantee as `SELECT … FOR UPDATE` in Postgres.

---

## 7. Expiry — also a scheduled function

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export const expirePendingPayments = onSchedule(
  { schedule: 'every 5 minutes' },
  async () => {
    const db = getFirestore();
    const stale = await db.collection('orders')
      .where('paymentStatus', '==', 'AWAITING_PAYMENT')
      .where('paymentExpiresAt', '<', Timestamp.now())
      .get();

    const batch = db.batch();
    stale.docs.forEach((d) => batch.update(d.ref, {
      paymentStatus: 'EXPIRED',
      status: 'cancelled',           // reflect on the kitchen side too
    }));
    if (!stale.empty) await batch.commit();
  }
);
```

Because `CartContext` already listens to the order doc, the customer's UI will auto-flip to "expired" with no extra wiring.

> Note: the existing 20-minute timer in `CartContext` is currently a **client-side guess** that just clears `pendingOrderId` from `localStorage`. With this server-side expiry, the truth lives in Firestore. Consider stretching the local timer to match `PAYMENT_WINDOW_MINUTES + 5` so the client doesn't drop a still-valid pending order.

---

## 8. Client-side wiring (changes in `src/`)

### `CheckoutForm` (or wherever the order is created today)

Replace direct `addDoc(collection(db,'orders'), ...)` with a callable:

```ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const createOrder = httpsCallable<OrderInput, {
  orderId: string;
  referenceCode: string;
  amountMnt: number;
  expiresAt: string;
  bankInstructions: { bankName: string; accountNumber: string; accountHolder: string; memo: string };
}>(functions, 'createBankTransferOrder');

async function placeOrder(input: OrderInput) {
  const { data } = await createOrder(input);
  setPendingOrderId(data.orderId);
  navigate(`/payment/${data.orderId}`, { state: data });
}
```

### New `PaymentPendingScreen.tsx`

A view that the customer sits on while paying:

```tsx
import { useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

export default function PaymentPendingScreen() {
  const { pendingOrderData } = useCart();   // already lives behind onSnapshot
  const { language } = useLanguage();

  if (!pendingOrderData) return <LoadingSpinner />;

  if (pendingOrderData.paymentStatus === 'CONFIRMED') {
    return <PaymentSuccessScreen order={pendingOrderData} />;
  }
  if (pendingOrderData.paymentStatus === 'EXPIRED') {
    return <PaymentExpiredScreen />;
  }

  return (
    <div className="bg-stone-950 text-stone-100 p-6">
      <h1>{language === 'mn' ? 'Гүйлгээ хүлээгдэж байна' : 'Awaiting payment'}</h1>
      <BankDetailsCard
        bank={pendingOrderData.bankInstructions?.bankName}
        account={pendingOrderData.bankInstructions?.accountNumber}
        memo={pendingOrderData.referenceCode}
        amount={pendingOrderData.amountMnt}
      />
      <CountdownTo to={pendingOrderData.paymentExpiresAt} />
    </div>
  );
}
```

The `paymentStatus === 'CONFIRMED'` flip happens **automatically** thanks to the existing `onSnapshot` in `CartContext` — no refresh, no polling.

### `CartContext` — small extension

In the existing `useEffect` (line 45–83), watch `paymentStatus` in addition to `status`:

```ts
if (orderData.paymentStatus === 'CONFIRMED') {
  toast.success(language === 'mn'
    ? 'Төлбөр амжилттай! Захиалга баталгаажлаа.'
    : 'Payment confirmed! Your order is in.');
}
if (orderData.paymentStatus === 'EXPIRED') {
  setPendingOrderId(null);
  toast.error(language === 'mn'
    ? 'Гүйлгээний хугацаа дууслаа. Дахин захиалгаа өгнө үү.'
    : 'Payment window expired. Please reorder.');
}
```

---

## 9. Ops console for the reconciliation queue

A simple admin route at `/admin/reconciliation` that lists `/reconciliation_queue` items with `resolvedAt == null`. Each row shows the bank tx, the candidate order (if any), and three buttons: **Approve match**, **Refund**, **Ignore**.

Each action is a callable function so security stays server-side:

```ts
export const resolveReconciliation = onCall(async (req) => {
  if (!req.auth?.token.admin) throw new HttpsError('permission-denied', 'admin only');
  const { itemId, action, orderId } = req.data;
  // approve → markPaid(orderId, txId); refund → mark tx REFUNDED; ignore → close item
});
```

---

## 10. Edge cases — same checklist, different mechanics

| Case | Where it's handled here |
|---|---|
| Customer pays twice | `markPaid` transaction's status re-check → `DOUBLE_PAYMENT` queue item |
| Wrong amount (off by ₮100) | Layer 1 matches ref, amount differs → `AMOUNT_MISMATCH` queue item |
| No memo / wrong ref | Layer 2 amount-only; if unique, queue for human approval |
| Order expired then paid | `expirePendingPayments` already moved order to `EXPIRED`; matcher finds no `AWAITING_PAYMENT` order → `UNKNOWN_REF` queue item |
| Polling crashes | Cursor not advanced → next tick re-fetches same window; `bank_tx_id` as Firestore doc id makes inserts idempotent |
| Two functions overlap | Cloud Scheduler guarantees one execution per tick; transactions cover the rest |
| Bank API rate limit | Catch + early return; don't update cursor; Cloud Scheduler retries on the next tick |
| Bank settlement delay | 30-min `paymentExpiresAt` is generous for inter-bank in MN |

---

## 11. Pre-build checklist (Mongolia-specific)

- [ ] Open a **Grand LLC** business account at the chosen bank (Khan Bank is the most-used dev API in MN today)
- [ ] Sign API access agreement; get `client_id`, `client_secret`
- [ ] Confirm whether they offer a **webhook** for incoming credits — if yes, replace `pollBank` with an `onRequest` HTTPS function and skip the scheduler entirely
- [ ] Decide currency precision: MNT has no minor units, store as integer
- [ ] Add `MERCHANT_ACCOUNT` and bank API secrets via `firebase functions:secrets:set`
- [ ] Cloud Function region: `asia-east1` is the closest GA region; `asia-northeast1` (Tokyo) also fine
- [ ] Add a **failed-payment** UX path so customers can retry with a fresh ref code (don't reuse the expired one)

---

## 12. Files to create / modify

```
firebase-blueprint.json                 # extend Order entity (section 1)
firestore.rules                         # add rules from section 2
firestore.indexes.json                  # add composite indexes from section 2
src/lib/referenceCode.ts                # NEW (section 3)
src/components/PaymentPendingScreen.tsx # NEW (section 8)
src/components/BankDetailsCard.tsx      # NEW
src/components/CountdownTo.tsx          # NEW
src/context/CartContext.tsx             # extend onSnapshot (section 8)
src/components/CheckoutForm.tsx         # call createBankTransferOrder (section 8)
functions/                              # NEW Cloud Functions package
  src/index.ts                          # exports the 4 functions
  src/createBankTransferOrder.ts        # section 4
  src/pollBank.ts                       # section 5
  src/reconcile.ts                      # section 6
  src/expirePendingPayments.ts          # section 7
  src/resolveReconciliation.ts          # section 9
  src/bankClient.ts                     # NEW: thin wrapper over the bank's API
  src/referenceCode.ts                  # mirror of src/lib/referenceCode.ts
```

---

## 13. Why this beats QPay-as-only-option for Grand

- **Near-zero per-tx fee** — customer pays the inter-bank fee (~₮300), restaurant pays nothing
- **Universal coverage** — every Mongolian bank user can pay
- **No third-party dependency** — Khan Bank goes down? Add TDB next month, same matcher
- **Real-time UX is already wired** — Firestore `onSnapshot` flips the customer's screen on payment with zero extra code
- **Audit trail** — every credit on the merchant account is logged in `/bank_transactions`, matched or not

Recommended rollout: ship with **one bank** (Khan), keep cash as a fallback in `paymentMethod`, watch the reconciliation queue volume for the first week, then add a second bank account or layer in QPay QR for one-tap UX.
