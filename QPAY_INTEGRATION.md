# QPay Integration — Deploy Guide

How to deploy and operate the QPay payment flow that's now wired into the 1tsegts checkout.

> If you're trying to **test** the QPay API itself before deploying, read `QPAY_TEST_PLAN.md` first.

---

## 1. What got built

| Layer | File(s) | What it does |
|---|---|---|
| Types | `src/types.ts`, `firebase-blueprint.json` | Add `'qpay'` to `PaymentMethod`; add `qpayInvoiceId`, `qpayQrText`, `qpayQrImage`, `qpayShortUrl`, `qpayDeeplinks`, `qpayPaymentId`, `paidVia` to `Order` |
| Client config | `src/lib/qpayConfig.ts` | `QPAY_ENABLED` feature flag, payment window minutes, bank display ordering |
| Cart UI | `src/components/CartDrawer.tsx` | QPay as primary button at checkout; Cash + Bank Transfer collapse into "Other payment methods" |
| Payment screen | `src/components/QpayPaymentPanel.tsx` | Shows QR image + bank deep-link buttons + countdown |
| Snapshot listener | `src/context/CartContext.tsx` | Surfaces QPay `CONFIRMED`/`EXPIRED` transitions as toasts |
| Cloud Functions | `functions/` | `createQpayInvoice` (callable) + `qpayWebhook` (HTTP) + shared `markOrderPaid` |

---

## 2. One-time setup

### 2.1 Install Cloud Functions deps

```bash
cd functions
npm install
```

### 2.2 Set Firebase secrets

These are read by the deployed Cloud Functions. Never commit them.

```bash
firebase functions:secrets:set QPAY_BASE_URL
# → enter: https://merchant.qpay.mn         (production, what you picked)
#   or:    https://merchant-sandbox.qpay.mn (sandbox, recommended for first test)

firebase functions:secrets:set QPAY_USERNAME
# → enter: 1TSEGTS

firebase functions:secrets:set QPAY_PASSWORD
# → enter: <the password QPay support emailed you>

firebase functions:secrets:set QPAY_INVOICE_CODE
# → enter: 1TSEGTS_INVOICE

firebase functions:secrets:set QPAY_CALLBACK_TOKEN
# → enter a random string. On macOS/Linux: `openssl rand -hex 24`.
#   On Windows PowerShell (no OpenSSL needed):
#     -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
#   This is appended to the callback URL we register with QPay; the
#   webhook rejects any inbound POST whose ?token=... doesn't match.

firebase functions:secrets:set QPAY_WEBHOOK_URL
# → enter ANY placeholder for now (e.g. "https://placeholder.invalid").
#   The Firebase CLI's codebase-wide check requires every secret that
#   any function declares to exist before the first deploy, so we set
#   a stub here and overwrite it in §2.3 once we know the real URL.
```

You'll overwrite `QPAY_WEBHOOK_URL` with the real value after the first deploy (next step).

### 2.3 First deploy (gets you the webhook URL)

```bash
firebase deploy --only functions:qpayWebhook,functions:createQpayInvoice
```

After deploy, the CLI prints the function URLs. Grab the `qpayWebhook` URL — it looks like:

```
https://qpaywebhook-<random>-as.a.run.app
```

Set it as a secret so `createQpayInvoice` knows where to point QPay's callback:

```bash
firebase functions:secrets:set QPAY_WEBHOOK_URL
# → paste the URL from the deploy output
```

Then redeploy `createQpayInvoice` so it picks up the new secret:

```bash
firebase deploy --only functions:createQpayInvoice
```

### 2.4 Verify the webhook is reachable

```bash
curl -i "https://<your-webhook-url>?order_id=test&token=wrong"
# expect: HTTP/2 401 unauthorized

curl -i "https://<your-webhook-url>?order_id=does-not-exist&token=<QPAY_CALLBACK_TOKEN>"
# expect: HTTP/2 200, body: SUCCESS
```

If the second call doesn't return 200 + `SUCCESS`, QPay will retry every real callback — fix this before going live.

---

## 3. Test end-to-end (sandbox first if possible)

1. Open the app, add an item to cart, click "Order Now".
2. Verify QPay is selected by default at the payment-method picker.
3. Confirm the order.
4. The drawer should show the QPay panel with a QR image and bank buttons.
5. Open one of the bank apps on your phone (or scan the QR), pay the amount.
6. Within ~10s the toast should pop: "QPay payment confirmed!" — the panel disappears and the regular "Active order" panel appears.
7. Check the Firestore order doc: `paymentStatus === 'CONFIRMED'`, `paidVia === 'qpay'`, `qpayPaymentId` set.
8. Check function logs:
   ```bash
   firebase functions:log --only qpayWebhook
   ```
   You should see "qpayWebhook: order marked paid".

If anything fails, the test plan (`QPAY_TEST_PLAN.md` §3 and §4) has step-by-step troubleshooting.

---

## 4. Feature flag rollout

QPay is gated by `QPAY_ENABLED` in `src/lib/qpayConfig.ts`. Recommended sequence:

1. **Day 0** — deploy with `QPAY_ENABLED = true` but **point at sandbox** (`QPAY_BASE_URL = https://merchant-sandbox.qpay.mn`). Test with your own phone.
2. **Day 1** — once sandbox works, swap `QPAY_BASE_URL` to production and redeploy. Watch the function logs and `paidVia` field for ~50 orders.
3. **Day 7** — if everything looks clean, leave it. Otherwise, set `QPAY_ENABLED = false` and rebuild the frontend — QPay disappears from the picker and the default switches back to cash. The Cloud Functions stay deployed but unused.

To fully tear out QPay (don't expect to need this), see `MONPAY_DEEPLINK_DESIGN.md` §12 — the same pattern.

---

## 5. Operational notes

### Token caching
The first request after a deploy hits `/v2/auth/token`. The result is cached in Firestore at `qpay_state/token` and re-used for ~24h. When it's within 60s of expiry, we re-auth from scratch (we don't use `/auth/refresh` because the spec warns it's one-shot).

### Callback verification
Every QPay callback hits `qpayWebhook` with `?order_id=...&token=...`. We:
1. Verify `token` matches `QPAY_CALLBACK_TOKEN` — rejects random POSTs.
2. Look up the order in Firestore and grab its `qpayInvoiceId`.
3. Call `/v2/payment/check` server-side to confirm a PAID row with matching amount.
4. Only then call `markOrderPaid` (which is idempotent — repeats are no-ops).

The webhook must return HTTP 200 + body `SUCCESS` or QPay retries.

### Idempotency
- `createQpayInvoice` reuses the cached QR if the order already has `qpayInvoiceId`.
- `qpayWebhook` re-fires on QPay retry are harmless — `markOrderPaid` short-circuits.

### Server-side expiry
The `expirePendingQpayInvoices` scheduled function runs every 5 minutes
(`Asia/Ulaanbaatar`). It finds `AWAITING_PAYMENT` QPay orders past their
`paymentExpiresAt`, cancels the invoice with QPay (`DELETE /v2/invoice/{id}`),
and flips `paymentStatus` to `EXPIRED` inside a transaction so an in-flight
`CONFIRMED` write can't be clobbered. Auth failures are non-fatal — the next
run picks the order up again.

### Refunds
Implemented end-to-end. The admin dashboard shows a **Refund** button on QPay
orders whose `paymentStatus === 'CONFIRMED'`. It calls the `refundQpayPayment`
callable (admin-verified server-side), which hits `DELETE /v2/payment/refund/{id}`
and flips the order to `REFUNDED`.

Caveat from the spec (`payment_refund` sheet): **QPay can only auto-refund CARD
payments.** P2P (bank-app QR) payments — the common case for restaurant orders —
must be reversed with a manual bank transfer. We capture `qpayPaymentType` at
confirm time, so the refund function short-circuits P2P with a clear
`P2P_NOT_REFUNDABLE` message instead of a confusing QPay error.

### Amount-mismatch handling
If QPay reports a `PAID` payment whose amount doesn't match what we billed
(partial / overpayment / stale invoice), the webhook no longer 500-loops
forever. It flips the order to `MANUAL_REVIEW` (recording expected vs observed
amount and the payment id) and acks QPay with `200 SUCCESS` so retries stop. An
admin reconciles from the dashboard.

### What's still NOT implemented yet
- QPay invoice cancellation on customer-cancelled orders (separate from the
  scheduled expiry path above). The order doc gets deleted, but the QPay
  invoice stays open. Low impact (no money has moved), but worth wiring up
  later.

---

## 6. If something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Customer sees "QPay unavailable" | `createQpayInvoice` errored. | Check function logs; usually a bad secret or QPay 401. |
| Webhook fires but order stays AWAITING_PAYMENT | The `?token=` doesn't match `QPAY_CALLBACK_TOKEN`, or `/payment/check` doesn't show PAID yet. | Logs will say. |
| Order marked paid but customer paid wrong amount | `qpayWebhook` requires `payment_amount` == `order.amountMnt`. If not, we don't mark paid — but we also don't flag it. | Future: surface to admin reconciliation queue. |
| QPay says credentials invalid | Password rotated, or sandbox vs prod mixup. | Re-set `QPAY_USERNAME` / `QPAY_PASSWORD` secrets and redeploy. |

---

## 7. Manual follow-ups (not automated)

These need GCP Console access or live testing and aren't wired up in code yet.

### Monitoring & alerting
1. **Cloud Logging metric** on `qpayWebhook` log entries with `severity=ERROR`.
   Alert if rate > 1/min for 5 min. Catches QPay outages and our own bugs.
2. **Cloud Logging metric** on `markOrderPaid` failures (`reason: bad_state:*`
   or `Firestore update failed`). Should be zero in steady state; any non-zero
   means a customer paid but the order didn't flip to `CONFIRMED`.
3. **Stale `AWAITING_PAYMENT` monitor** is already covered by
   `expirePendingQpayInvoices`, but you might still want a dashboard count of
   `EXPIRED` orders / day as a signal of customer-side flakiness or pricing
   confusion.

### Frontend / UX tests to run live
- **Cached-invoice path**: open the QPay panel twice on the same order →
  second call should return the cached QR (idempotent path in
  `createQpayInvoice.ts`, no QPay round-trip). Confirm in logs.
- **Expiry UX past the 15-min window**: leave the panel open past
  `paymentExpiresAt`. UI should surface a retry / cancel option cleanly.
- **Webhook retry idempotency**: replay one of the real webhook curls from
  Cloud Logging. Verify `markOrderPaid` short-circuits with
  `reason: already_confirmed` and no extra Firestore writes.

### Token rotation
Rotate `QPAY_CALLBACK_TOKEN` if the callback URL is ever logged externally
or the secret is shared:
```bash
firebase functions:secrets:set QPAY_CALLBACK_TOKEN
firebase deploy --only functions:qpayWebhook,functions:createQpayInvoice
```
Both functions read it, so deploy both. Note: `QPAY_USERNAME` and
`QPAY_PASSWORD` are the same across sandbox and production for this
merchant — no separate prod creds to rotate.

### Kill-switch
`QPAY_ENABLED` in `src/lib/qpayConfig.ts` is currently `true`. To soft-disable
QPay, flip to `false` and rebuild the frontend — QPay disappears from the
picker and the default switches back to cash. The Cloud Functions stay
deployed but unused. Could be promoted to an admin-settings toggle later
(Firestore-backed) if it's worth the round-trip per render.

---

## 8. Files added / changed

```
NEW  functions/                                # entire Cloud Functions package
     ├── package.json, tsconfig.json, .gitignore
     └── src/
         ├── index.ts                          # exports createQpayInvoice + qpayWebhook
         ├── qpayClient.ts                     # HTTP wrappers over QPay API
         ├── qpayTokenCache.ts                 # Firestore-backed token cache
         ├── createQpayInvoice.ts              # callable function
         ├── qpayWebhook.ts                    # HTTP onRequest function
         └── markOrderPaid.ts                  # shared paid handler

NEW  src/components/QpayPaymentPanel.tsx       # QR + bank-deeplink screen
NEW  src/lib/qpayConfig.ts                     # client-side feature flag

MOD  firebase.json                             # add functions config
MOD  firebase-blueprint.json                   # extend Order entity
MOD  src/types.ts                              # PaymentMethod + Order fields
MOD  src/firebase.ts                           # export functions + httpsCallable
MOD  src/components/CartDrawer.tsx             # QPay primary, others collapsed
MOD  src/context/CartContext.tsx               # QPay status transitions
MOD  src/context/LanguageContext.tsx           # QPay strings
```
