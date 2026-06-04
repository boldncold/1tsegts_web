# MonPay Deep-Link Integration — design doc (follow-on to v0)

This builds on top of the v0 manual bank-transfer flow already shipped (see `BANK_RECONCILIATION_DESIGN.md` for the original architecture and the actual v0 code under `src/lib/referenceCode.ts`, `src/lib/bankConfig.ts`, etc.).

**Goal:** replace the customer's manual "open Khan Bank app, type account number, type amount, type reference code" with a **single tap**: customer picks "MonPay" at checkout → taps the link → MonPay app opens with everything pre-filled → biometric confirm → done. Server-side webhook flips `paymentStatus → CONFIRMED` automatically, no admin action.

Reference: [developers.monpay.mn — Deep Link webhook](https://developers.monpay.mn/en/guide/deep-link/web-hook).

---

## 0. What changes vs. v0

The v0 schema, admin UI, and customer screen all stay. We're adding a third `paymentMethod` value (`monpay`) and a few new pieces:

| v0 (manual Khan Bank) | + MonPay deep link |
|---|---|
| `paymentMethod: 'cash' \| 'bank_transfer'` | + `'monpay'` |
| Customer reads bank details, types into Khan app | Customer taps a link, MonPay app opens pre-filled |
| Admin clicks "Mark Paid" after seeing transfer | MonPay webhook marks paid, no admin action |
| Reference code is for human matching | MonPay's `invoiceId` is the matching key (we keep our own ref code as a backup) |
| Works without any external account | Requires signed Mobifinance Merchant agreement + API keys |

The bank-transfer manual flow stays as a **fallback** for customers who don't have MonPay installed, or for desktop users (deep links don't work well on desktop).

---

## 1. Prerequisites (do once, outside code)

1. **Sign Merchant Agreement with Mobifinance.**
   Email `merchantservice@mobicom.mn` with subject "Developer support" → request merchant onboarding for Open API. Mobifinance covers your dev/test environment.
2. **Receive credentials:**
   - `client_id` (≈ MonPay merchant ID)
   - `client_secret` (HMAC signing key)
   - Sandbox base URL + production base URL
3. **Settle-to bank account.** MonPay deposits cleared funds into a bank account you nominate. For v1 this can stay your personal Khan Bank account that v0 uses; once volume justifies it, switch to a business account.
4. **Set up secrets in Firebase:**
   ```
   firebase functions:secrets:set MONPAY_CLIENT_ID
   firebase functions:secrets:set MONPAY_CLIENT_SECRET
   firebase functions:secrets:set MONPAY_WEBHOOK_SECRET   # if MonPay supports a configurable shared secret
   ```

---

## 2. Architecture

```
Customer at checkout, picks "MonPay"
   │
   ▼
CartDrawer calls Firebase Cloud Function: createMonpayInvoice(orderId)
   │                                                       ▲
   │                                                       │
   ▼                                                       │
Cloud Function:                                            │
  1. Reads order from Firestore                            │
  2. POST to MonPay /invoice/create with our orderId as
     external reference + amount + redirect_uri + webhook_uri
  3. MonPay returns { invoiceId, deepLink, qrUrl }         │
  4. Stores invoiceId on the order doc                     │
  5. Returns { deepLink, invoiceId } to client             │
   │                                                       │
   ▼                                                       │
Client receives deepLink → opens it via window.location    │
   │                                                       │
   ▼                                                       │
MonPay app launches (or App Store fallback if not installed)
   │
   ▼
Customer reviews + biometric confirms in MonPay app
   │
   ├──► MonPay redirects browser to redirect_uri with status query param
   │       (customer's screen flips, but DON'T trust this — webhook is canonical)
   │
   └──► MonPay POSTs webhook to your Cloud Function: monpayWebhook
            │
            ▼
         monpayWebhook:
           1. Verify HMAC signature with MONPAY_WEBHOOK_SECRET
           2. Look up order via stored invoiceId
           3. If status==PAID and amounts match → markOrderPaid()
              (same Firestore transaction from v0 admin Mark Paid)
           4. If status==FAILED → leave AWAITING_PAYMENT, customer can retry
            │
            ▼
         Firestore order.paymentStatus = 'CONFIRMED'
            │
            ▼
         Existing onSnapshot in CartContext flips customer's screen,
         shows toast, triggers regular kitchen workflow.
```

Critical principle: **trust the webhook, not the redirect.** The redirect can be spoofed, dropped (browser closed), or arrive before MonPay actually finalizes the payment. The HMAC-signed webhook is the truth.

---

## 3. New files / changes

```
src/lib/bankConfig.ts                # add MONPAY_ENABLED toggle (no creds, just feature flag for client)
src/types.ts                         # add 'monpay' to PaymentMethod
src/components/CartDrawer.tsx        # add MonPay button to payment-method picker, call invoice fn
src/components/MonpayPaymentPanel.tsx # NEW: post-checkout panel with "Open MonPay" button
src/context/LanguageContext.tsx      # add MonPay-specific translations
functions/                           # NEW Cloud Functions package
  package.json
  src/index.ts                       # exports: createMonpayInvoice, monpayWebhook
  src/createMonpayInvoice.ts
  src/monpayWebhook.ts
  src/monpayClient.ts                # thin wrapper over MonPay API
  src/markOrderPaid.ts               # shared helper, used by both admin fallback and webhook
firebase.json                        # add functions config if missing
.firebaserc                          # add if missing
```

---

## 4. Type changes

```ts
// src/types.ts
export type PaymentMethod = 'cash' | 'bank_transfer' | 'monpay';

export interface Order {
  // ... v0 fields ...

  // MonPay-specific
  monpayInvoiceId?: string;   // returned by MonPay on invoice create; matching key for webhook
  monpayDeepLink?: string;    // the URL we ask the customer to open
  monpayTxnId?: string;       // MonPay's transaction id, set when webhook arrives
}
```

---

## 5. Cloud Function: `createMonpayInvoice`

Called from `CartDrawer` right after `addDoc(orders, ...)`. Returns the deep link the customer needs to open.

```ts
// functions/src/createMonpayInvoice.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { monpayCreateInvoice } from './monpayClient.js';

export const createMonpayInvoice = onCall(
  { secrets: ['MONPAY_CLIENT_ID', 'MONPAY_CLIENT_SECRET'] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
    const { orderId } = req.data;
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId required');

    const db = getFirestore();
    const orderRef = db.doc(`orders/${orderId}`);
    const snap = await orderRef.get();
    const order = snap.data();
    if (!order) throw new HttpsError('not-found', 'order not found');
    if (order.paymentStatus !== 'AWAITING_PAYMENT') {
      throw new HttpsError('failed-precondition', 'order is not awaiting payment');
    }

    // Idempotency: if we already created an invoice for this order, return it
    if (order.monpayInvoiceId && order.monpayDeepLink) {
      return { deepLink: order.monpayDeepLink, invoiceId: order.monpayInvoiceId };
    }

    const { invoiceId, deepLink } = await monpayCreateInvoice({
      amount: order.amountMnt,
      description: `1tsegts ${order.referenceCode}`,
      // External reference — MonPay echoes this back in the webhook so we can find the order
      externalRef: orderId,
      redirectUri: `${process.env.PUBLIC_APP_URL}/payment/return?orderId=${orderId}`,
    });

    await orderRef.update({
      monpayInvoiceId: invoiceId,
      monpayDeepLink: deepLink,
    });

    return { deepLink, invoiceId };
  }
);
```

> **Note:** the exact field names (`amount` vs `amountMnt`, `description` vs `info`, `externalRef` vs `clientReference`) come from MonPay's actual API spec. Pull the Postman collection from [developers.monpay.mn](https://developers.monpay.mn/en/guide/deep-link/) to confirm before implementing.

---

## 6. Cloud Function: `monpayWebhook`

The truth-source. Verifies signature, marks order paid.

```ts
// functions/src/monpayWebhook.ts
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import { markOrderPaid } from './markOrderPaid.js';

export const monpayWebhook = onRequest(
  { secrets: ['MONPAY_WEBHOOK_SECRET'], cors: false },
  async (req, res) => {
    // MonPay deep-link webhook delivers query params: invoiceId, status, txnId, amount
    // (See developers.monpay.mn/en/guide/deep-link/web-hook)
    const { invoiceId, status, txnId, amount } = req.query as Record<string, string>;
    if (!invoiceId || !status) {
      res.status(400).send('missing required fields');
      return;
    }

    // Signature verification — confirm MonPay's exact scheme from their docs
    // before deploying. They typically sign over (invoiceId|status|txnId|amount).
    if (!verifyMonpaySignature(req)) {
      console.warn('monpay webhook: bad signature', { invoiceId });
      res.status(401).send('bad signature');
      return;
    }

    const db = getFirestore();
    // Find order by stored invoiceId
    const matches = await db.collection('orders')
      .where('monpayInvoiceId', '==', invoiceId)
      .limit(1).get();

    if (matches.empty) {
      console.warn('monpay webhook: no order for invoice', { invoiceId });
      // 200 so MonPay doesn't keep retrying — but log it
      res.status(200).send('no matching order');
      return;
    }
    const orderDoc = matches.docs[0];
    const order = orderDoc.data();

    if (status === 'PAID') {
      // Defensive: amount sanity check (MonPay returns string, our field is integer)
      const monpayAmount = parseInt(amount ?? '0', 10);
      if (monpayAmount !== order.amountMnt) {
        console.error('monpay amount mismatch', { invoiceId, expected: order.amountMnt, got: monpayAmount });
        await orderDoc.ref.update({ paymentStatus: 'MANUAL_REVIEW', monpayTxnId: txnId });
        res.status(200).send('amount mismatch — flagged for review');
        return;
      }
      await markOrderPaid(orderDoc.ref, { source: 'monpay', monpayTxnId: txnId });
    } else {
      // FAILED, CANCELLED, etc — leave as AWAITING_PAYMENT, customer can retry
      console.log('monpay webhook: non-success status', { invoiceId, status });
    }

    res.status(200).send('ok');
  }
);

function verifyMonpaySignature(req: import('express').Request): boolean {
  // TODO: implement the exact HMAC scheme MonPay uses.
  // Typically: HMAC-SHA256(secret, canonicalString) compared against header.
  // Ask Mobifinance support for the exact scheme and a reference impl.
  const secret = process.env.MONPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  // Placeholder — replace with real verification before any prod traffic
  return true;
}
```

---

## 7. Shared `markOrderPaid` helper

Used by both the admin manual button (v0) AND the MonPay webhook. Keeps the logic in one place.

```ts
// functions/src/markOrderPaid.ts
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export async function markOrderPaid(
  orderRef: FirebaseFirestore.DocumentReference,
  meta: { source: 'admin_manual' | 'monpay' | 'email_parse'; monpayTxnId?: string }
) {
  const db = getFirestore();
  await db.runTransaction(async (t) => {
    const snap = await t.get(orderRef);
    const order = snap.data();
    if (!order) return;
    // Idempotent: already confirmed → no-op (e.g. webhook fires twice)
    if (order.paymentStatus === 'CONFIRMED') return;
    if (order.paymentStatus !== 'AWAITING_PAYMENT') return; // expired, refunded, etc.

    t.update(orderRef, {
      paymentStatus: 'CONFIRMED',
      paidAt: Timestamp.now(),
      paidVia: meta.source,
      ...(meta.monpayTxnId ? { monpayTxnId: meta.monpayTxnId } : {}),
    });
  });
}
```

(Optional v1 cleanup: refactor the v0 admin "Mark Paid" button to call a Cloud Function that uses this same helper, so the audit trail and idempotency are uniform.)

---

## 8. Client-side: `MonpayPaymentPanel`

The post-checkout screen for MonPay orders. Replaces the v0 `BankPaymentPanel` for `paymentMethod === 'monpay'`.

```tsx
// src/components/MonpayPaymentPanel.tsx
import { useState, useEffect } from 'react';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { useLanguage } from '../context/LanguageContext';

export function MonpayPaymentPanel({ order }: { order: any }) {
  const { language } = useLanguage();
  const [deepLink, setDeepLink] = useState<string | null>(order.monpayDeepLink ?? null);
  const [loading, setLoading] = useState(!deepLink);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deepLink) return;
    const fn = httpsCallable<{ orderId: string }, { deepLink: string; invoiceId: string }>(
      getFunctions(), 'createMonpayInvoice'
    );
    fn({ orderId: order.id })
      .then((res) => setDeepLink(res.data.deepLink))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [order.id, deepLink]);

  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

  if (loading) return <Spinner />;
  if (error || !deepLink) {
    return (
      <FallbackToBankTransferPanel
        order={order}
        reason={language === 'en' ? 'MonPay unavailable' : 'MonPay ажиллахгүй байна'}
      />
    );
  }

  return (
    <div className="rounded-2xl border-2 border-pink-400 bg-white p-5 space-y-4">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-widest text-pink-700 font-bold">
          {language === 'en' ? 'Pay with MonPay' : 'MonPay-аар төлөх'}
        </p>
        <p className="text-2xl font-bold tabular-nums">₮{order.amountMnt.toLocaleString()}</p>
      </div>

      {isMobile ? (
        <a
          href={deepLink}
          className="block w-full py-4 bg-pink-500 hover:bg-pink-600 text-white font-bold uppercase tracking-widest rounded-full text-center transition-all"
        >
          {language === 'en' ? 'Open MonPay App' : 'MonPay аппликейшнаа нээх'}
        </a>
      ) : (
        // Desktop: deep link won't work — show QR or fallback
        <DesktopMonpayQR deepLink={deepLink} />
      )}

      <p className="text-xs text-stone-500 text-center">
        {language === 'en'
          ? "We'll confirm your order automatically once payment goes through."
          : 'Төлбөр амжилттай болсон даруйд захиалгыг автоматаар баталгаажуулна.'}
      </p>
    </div>
  );
}
```

The customer doesn't need to know about reference codes or account numbers in the MonPay path — MonPay handles all of that internally via the `invoiceId`.

---

## 9. CartDrawer changes

Add MonPay as a third button in the payment-method picker, dispatch to the right panel:

```tsx
// In the payment-method picker (3 buttons now):
<div className="grid grid-cols-3 gap-2">
  <PaymentButton method="cash" icon={Banknote} label={t('cart.payment.cash')} />
  <PaymentButton method="monpay" icon={MonpayIcon} label="MonPay" highlight />
  <PaymentButton method="bank_transfer" icon={Building2} label={t('cart.payment.bank')} />
</div>

// In the post-checkout success area:
{pendingOrderData?.paymentMethod === 'monpay' &&
 pendingOrderData?.paymentStatus === 'AWAITING_PAYMENT' && (
  <MonpayPaymentPanel order={pendingOrderData} />
)}

{pendingOrderData?.paymentMethod === 'bank_transfer' &&
 pendingOrderData?.paymentStatus === 'AWAITING_PAYMENT' && (
  <BankPaymentPanel order={pendingOrderData} />
)}
```

UX hint: make MonPay the "recommended" choice with a subtle badge — it's the lowest-friction option for any customer who has the MonPay app installed (a sizeable chunk of MN consumers).

---

## 10. Edge cases

| Case | Handling |
|---|---|
| Customer doesn't have MonPay app installed | Tapping the deep link opens the App Store / Play Store. Show a fallback: "Don't have MonPay? Pay by bank transfer instead." button that switches paymentMethod to `bank_transfer` and re-creates the order with a fresh ref code. |
| Customer cancels in MonPay app | No webhook fires (status stays AWAITING_PAYMENT). Existing 30-min expiry handles cleanup. Customer can retry by tapping the link again. |
| Webhook fires twice (MonPay retries on 5xx) | `markOrderPaid` is idempotent — re-checks `paymentStatus !== 'CONFIRMED'` inside the transaction. Second call no-ops. |
| Customer pays the wrong amount via MonPay | Shouldn't happen since MonPay enforces the invoice amount, but if it does: webhook marks `MANUAL_REVIEW` and admin sees a flag. |
| MonPay outage during checkout | `createMonpayInvoice` throws → client shows "MonPay unavailable, try bank transfer instead" with a one-tap fallback. |
| Desktop user picks MonPay | Detect via UA → render a QR (MonPay's deep link doubles as a QR target) instead of the open-app button. |
| Webhook arrives before customer's redirect | Order is already CONFIRMED. Customer's redirect lands on a "Payment confirmed!" screen via existing onSnapshot — works perfectly. |
| Refund | Out of scope for v1; MonPay supports refund API endpoints, document only. |

---

## 11. Security checklist

- [ ] HMAC verify every webhook (do NOT skip in production, regardless of how convenient)
- [ ] Webhook URL is HTTPS only — Cloud Functions URL is fine
- [ ] `MONPAY_CLIENT_SECRET` and `MONPAY_WEBHOOK_SECRET` only in Firebase Secrets, never committed
- [ ] `createMonpayInvoice` enforces `req.auth` and order ownership
- [ ] Webhook validates that the amount MonPay reports matches `order.amountMnt`
- [ ] Order's `paymentStatus` is server-only writeable (Firestore rules block client writes to that field)
- [ ] Sandbox vs production: separate Firebase project + separate MonPay credentials, no shared state

---

## 12. Migration path

1. **Today (v0 done):** customer picks Cash or Bank Transfer. Bank Transfer = manual admin Mark Paid.
2. **Sign Mobifinance Merchant agreement** (1–2 weeks process based on standard fintech onboarding pace). Get sandbox credentials.
3. **Implement** sections 5–9 above against MonPay sandbox. Test the full flow on a real phone with the MonPay app pointing at sandbox.
4. **Launch in shadow:** add MonPay as a third payment option, soft-launched. Bank Transfer manual stays as fallback. Watch the webhook delivery success rate for a week.
5. **Promote MonPay to default** (re-order the buttons, make it the recommended option with a subtle highlight). Bank Transfer demoted to a "More options" link. Cash stays first.

---

## 13. What this gets you

- **One-tap payment** for any customer with MonPay installed — match QPay's UX without QPay's onboarding queue
- **Zero admin reconciliation work** for MonPay orders — webhook does it, kitchen sees the order ready to start
- **Same backing schema** as v0 — no Firestore data model rewrite, just additive fields
- **Bank-transfer manual flow stays** as a free fallback for non-MonPay users and for desktop
- **Audit trail** — every payment lands in Firestore with `paidVia` recording the source, useful for accounting

The whole MonPay code addition is roughly: 1 Cloud Functions package, 2 functions, 1 client component, ~3 type changes. Maybe an evening's work once the credentials and exact API field names are in hand.
