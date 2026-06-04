# QPay v2 Payment Flow — Test Plan

A working plan for testing QPay v2 integration end-to-end before wiring it into the customer checkout. Built from the spec sent by `support@qpay.mn` on 20 May 2026 (attachments: `2026.3.17 V2 API with Ebarimt 3.0 1.xlsx` + `QPay API v2.postman_collection 12 2.json`, copied into `C:\Users\Hitech\OneDrive\Documents\qpay\`).

> Status today: design-only. No `functions/` directory yet. v0 ships cash + manual bank transfer (Khan). QPay is the second machine-driven payment provider planned — MonPay deep-link is its sibling (see `MONPAY_DEEPLINK_DESIGN.md`). This plan is for **testing the QPay API itself**, before any code lands in this repo.

---

## 0. Environments and credentials

| | Sandbox (use for all testing) | Production |
|---|---|---|
| Base URL | `https://merchant-sandbox.qpay.mn` | `https://merchant.qpay.mn` |
| Username | `1TSEGTS` (from QPay onboarding email) | same |
| Password | `wwpdNTrD` (from QPay onboarding email — rotate before prod) | same |
| Invoice code | `1TSEGTS_INVOICE` | same |

**Always start in sandbox.** The xlsx `API` sheet lists both base URLs. Same credentials work against both — QPay flips behaviour by host. Never run a destructive test (cancel, refund) against `merchant.qpay.mn` until the sandbox version of the same test has passed.

Store the creds in:

```
firebase functions:secrets:set QPAY_USERNAME       # 1TSEGTS
firebase functions:secrets:set QPAY_PASSWORD       # wwpdNTrD
firebase functions:secrets:set QPAY_INVOICE_CODE   # 1TSEGTS_INVOICE
firebase functions:secrets:set QPAY_BASE_URL       # https://merchant-sandbox.qpay.mn for now
```

Once prod is approved, rotate the password (ask QPay support for a fresh one) and set the prod secret separately on the prod Firebase project.

---

## 1. The eight endpoints we care about

From the `API` sheet of the spec — these are the only ones we'll touch in v1:

| # | Endpoint | Method | Auth | Purpose |
|---|---|---|---|---|
| 1 | `/v2/auth/token` | POST | Basic (user:pass) | Get JWT access_token + refresh_token |
| 2 | `/v2/auth/refresh` | POST | Bearer (refresh_token) | Extend an expired access_token |
| 3 | `/v2/invoice` | POST | Bearer | Create an invoice; returns QR + bank deep-links |
| 4 | `/v2/invoice/{invoice_id}` | DELETE | Bearer | Cancel an unpaid invoice |
| 5 | `/v2/payment/check` | POST | Bearer | List payments for an invoice (the polling fallback) |
| 6 | `/v2/payment/{payment_id}` | GET | Bearer | Read a single payment by ID |
| 7 | `/v2/payment/cancel/{payment_id}` | DELETE | Bearer | Cancel a P2P payment (same-day) |
| 8 | `/v2/payment/refund/{payment_id}` | DELETE | Bearer | Refund a card payment |

Out of scope for v1: `/v2/payment/list` (admin/reporting), `/v2/ebarimt_v3/create` (Ebarimt receipts — needs separate D-Tax onboarding).

---

## 2. End-to-end happy-path flow (the thing we're really testing)

This is the sequence the customer will live through. Everything below is in service of proving this works.

```
   ┌──────────────────┐
   │ Customer picks   │
   │ "QPay" at        │
   │ checkout         │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────────────────────────────────────┐
   │ Backend (Cloud Function): createQpayInvoice      │
   │  1. POST /v2/auth/token (or use cached token)    │
   │  2. POST /v2/invoice with:                       │
   │        invoice_code      = QPAY_INVOICE_CODE     │
   │        sender_invoice_no = <Firestore orderId>   │
   │        amount            = order.amountMnt       │
   │        callback_url      = our webhook + ?...    │
   │  3. Save { invoice_id, qr_text, qPay_shortUrl,   │
   │           qPay_deeplink[] } on the order doc     │
   │  4. Return them to client                        │
   └────────┬─────────────────────────────────────────┘
            │
            ▼
   ┌──────────────────┐   mobile  ┌──────────────────────┐
   │ Customer screen  │──────────►│ Bank app deeplink    │
   │  shows QR (img)  │   desktop │ from qPay_deeplink[] │
   │  + bank buttons  │──────────►│ QR scanned from      │
   └────────┬─────────┘           │ qr_image             │
            │                     └──────────────────────┘
            │                              │
            ▼                              ▼
   ┌──────────────────────────────────────────────────┐
   │ Customer pays in their bank app                  │
   └────────┬─────────────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────────────┐
   │ QPay → our callback_url                           │
   │ (canonical signal — see §5)                       │
   │ We respond: HTTP 200 + body "SUCCESS"             │
   │ Webhook handler:                                  │
   │   • POST /v2/payment/check to verify              │
   │     (don't trust the callback alone)              │
   │   • If row.payment_status == PAID and             │
   │     row.payment_amount == order.amountMnt:        │
   │       markOrderPaid()                             │
   │   • paymentStatus → CONFIRMED                     │
   └────────┬─────────────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────────────┐
   │ onSnapshot in CartContext flips the customer's   │
   │ screen automatically — no polling                 │
   └──────────────────────────────────────────────────┘
```

The same principle as MonPay: **the webhook is the truth, the redirect is just UX.** Verify everything server-side.

---

## 3. Phase 1 — manual API smoke test (no code in this repo yet)

Goal: prove the credentials work, learn the exact response shapes, and confirm sandbox can simulate a paid invoice.

Use Postman (import the JSON collection) **or** the curl commands below. Both run against sandbox.

### 3.1 Get a token

```bash
curl -X POST 'https://merchant-sandbox.qpay.mn/v2/auth/token' \
  -u '1TSEGTS:wwpdNTrD'
```

Expect a JSON response with `token_type`, `access_token`, `refresh_token`, `expires_in`, `refresh_expires_in`, `scope`. `expires_in` is a Unix timestamp (per the `token` sheet), not "seconds from now".

Save `access_token` into an env var:

```bash
TOKEN="<paste access_token here>"
```

**Acceptance:** HTTP 200, response has all 8 fields listed in the `token` sheet.

### 3.2 Create a simple invoice

```bash
curl -X POST 'https://merchant-sandbox.qpay.mn/v2/invoice' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "invoice_code": "1TSEGTS_INVOICE",
    "sender_invoice_no": "TEST-001",
    "invoice_receiver_code": "terminal",
    "invoice_description": "1tsegts test order 001",
    "sender_branch_code": "MAIN",
    "amount": 100,
    "callback_url": "https://YOUR-NGROK-URL.ngrok.io/qpay/callback?order_id=TEST-001"
  }'
```

Notes:
- `sender_invoice_no` **must be unique per merchant** (xlsx warning on `invoice_create` row 2). For tests use a timestamp or short uuid prefix.
- `invoice_receiver_code = "terminal"` is the convention for anonymous QR-pay (no specific customer). For known customers later, pass their phone/regnumber.
- `amount: 100` MNT is the minimum useful test amount; QPay sandbox accepts any positive decimal.
- `callback_url` must be reachable from the public internet. For local testing, run [`ngrok http 5001`](https://ngrok.com/) against the Functions emulator and paste the https URL here. **Do not** put `localhost` or a private IP — QPay's callback won't reach it.

**Acceptance:** HTTP 200, response contains:
- `invoice_id` (uuid)
- `qr_text` (the EMV-MPM QR payload — used to render our own QR)
- `qr_image` (base64 PNG — easier than rendering qr_text ourselves)
- `qPay_shortUrl` (short link, opens QPay app)
- `qPay_deeplink` array — one entry per bank with `name`, `description`, `logo`, `link`. About 17 banks per the `bank_code` sheet.

Save `invoice_id` into `INV` for the next steps.

### 3.3 Simulate a payment (sandbox-specific)

QPay sandbox provides a way to mark an invoice as "paid" without an actual bank transfer. Two options — try in order:

**Option A — Sandbox web UI.** Most QPay sandbox environments have a "Pay" button on the sandbox merchant portal — log in at `https://merchant-sandbox.qpay.mn/` with the same credentials and look for the test-pay UI on the invoice list. Ask QPay support (`tergel.t@qpay.mn`) if you can't find it.

**Option B — Real test bank.** If sandbox doesn't expose a mock-pay, install one of the bank apps in test mode (Khan Bank "QPay" demo flow), open the deeplink from `qPay_deeplink[0].link` on a phone, confirm. This costs a real ₮100 but routes through sandbox infra, not your bank account.

### 3.4 Verify payment via check

```bash
curl -X POST 'https://merchant-sandbox.qpay.mn/v2/payment/check' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "object_type": "INVOICE",
    "object_id": "'"$INV"'",
    "offset": { "page_number": 1, "page_limit": 100 }
  }'
```

**Acceptance:**
- Before paying: `{"count": 0, "rows": []}`
- After paying: `count >= 1`, `paid_amount === 100`, `rows[0].payment_status === "PAID"`, `rows[0].payment_amount === 100`, `rows[0].payment_type === "P2P"`, and one of `p2p_transactions` or `card_tansactions` (note QPay's spelling: `card_tansactions`) is populated.

Status values per the `payment_check` sheet: `NEW` (created), `FAILED` (declined), `PAID` (success). Anything else is a flag-for-review case.

### 3.5 Confirm callback fires

If your `callback_url` was reachable, QPay should also have POSTed to it within ~5–10s of the payment. The callback's HTTP body is documented as "the payment id appended via query string" in `callback URL` sheet; we'll confirm exact shape during this step. **Required response:** HTTP 200 + body literal `SUCCESS`. Anything else triggers QPay's retry queue.

For local testing, watch the ngrok inspector at `http://localhost:4040` — you'll see the inbound POST. Capture the full request (URL, headers, body) into `docs/qpay/callback-sample.txt` so we know what to parse.

### 3.6 Cancel an unpaid invoice

```bash
curl -X DELETE "https://merchant-sandbox.qpay.mn/v2/invoice/$INV" \
  -H "Authorization: Bearer $TOKEN"
```

**Acceptance:** HTTP 200. Calling `payment/check` afterward should not flip the status — cancellation only blocks future payments.

### 3.7 Refresh an expired token

```bash
curl -X POST 'https://merchant-sandbox.qpay.mn/v2/auth/refresh' \
  -H "Authorization: Bearer $REFRESH_TOKEN"
```

Per the `token` sheet warning, **only call refresh once per token lifetime**. The new access_token has a new `expires_in`. Re-running refresh on an already-refreshed token is documented as causing issues.

---

## 4. Phase 2 — automated test cases

After Phase 1 establishes everything works manually, codify the cases below. They run against sandbox. The Cloud Function code lives in a `functions/` package (to be added — same shape as the planned MonPay package in `MONPAY_DEEPLINK_DESIGN.md` §3).

Recommended runner: **Vitest** (already in the project's React/TS toolchain via Vite). Place tests at `functions/test/qpay/*.test.ts`. Each test gets its own fresh access_token (don't share state across tests).

### Test matrix

| # | Case | Expected outcome |
|---|---|---|
| **Auth** | | |
| A1 | Token with valid Basic creds | 200, returns `access_token` and `refresh_token`, `token_type === "bearer"` |
| A2 | Token with wrong password | 401 `AUTHENTICATION_FAILED` (per `error_message` sheet) |
| A3 | Token with no Authorization header | 401 `NO_CREDENDIALS` |
| A4 | Refresh once per token | 200, new access_token issued |
| A5 | Refresh twice in a row | second call fails / token revoked (confirm exact behaviour during testing) |
| **Invoice — happy** | | |
| I1 | Create simple invoice, amount=100 | 200, valid `invoice_id`, `qr_image` is base64 PNG that decodes, `qPay_deeplink` has ≥10 entries |
| I2 | Create invoice with `invoice_receiver_data` (name+email+phone) | 200, same shape |
| I3 | Create invoice with `allow_partial=true, minimum_amount=50` | 200, customer can pay 50 instead of 100 |
| **Invoice — error** | | |
| I4 | Duplicate `sender_invoice_no` | 409 `INVOICE_CODE_REGISTERED` (or similar — see error_message sheet) |
| I5 | Missing `amount` and no `minimum_amount` | 400 `VALIDATION_ERROR` |
| I6 | `amount: 0` | 400 `INVALID_AMOUNT` or `MIN_AMOUNT_ERR` |
| I7 | `amount: 999999999` (above ceiling) | 400 `MAX_AMOUNT_ERR` |
| I8 | Unknown `invoice_code` | 400 `INVOICE_CODE_INVALID` |
| **Payment check** | | |
| P1 | Check unpaid invoice | 200, `count: 0, rows: []` |
| P2 | Check after sandbox-pay | 200, `count: 1`, `payment_status: "PAID"`, `payment_amount` matches |
| P3 | Check non-existent invoice_id | 422 `INVOICE_NOTFOUND` |
| P4 | Check with `object_type: "ORDER"` (wrong) | 400 `INVALID_OBJECT_TYPE` |
| **Cancel / refund** | | |
| C1 | Cancel unpaid invoice | 200 |
| C2 | Cancel already-paid invoice | 409 `INVOICE_PAID` |
| C3 | Cancel already-cancelled invoice | 409 `INVOICE_ALREADY_CANCELED` |
| C4 | Refund a paid card payment | 200 (only relevant for CARD type; P2P refunds go through different flow) |
| **Callback** | | |
| W1 | Sandbox-pay an invoice → callback arrives within 10s | callback received, our handler returns 200 + "SUCCESS" |
| W2 | Callback handler returns 500 once | QPay retries (confirm retry policy — likely 3 attempts) |
| W3 | Callback handler returns non-"SUCCESS" body | confirm QPay retries (per warning in `callback URL` sheet) |
| W4 | Replay a callback with a manipulated `payment_id` | our handler refuses to mark paid (always re-fetches via `/payment/check` and compares amount + invoice_id) |
| **Reconciliation logic (our code)** | | |
| R1 | Callback fires, amount matches order | order.paymentStatus → CONFIRMED |
| R2 | Callback fires, amount mismatches order | order.paymentStatus → MANUAL_REVIEW |
| R3 | Callback fires twice (QPay retries) | idempotent — second call no-ops (markOrderPaid checks `paymentStatus !== 'CONFIRMED'` inside transaction) |
| R4 | Callback fires after order expired | leave EXPIRED, log to `reconciliation_queue` |
| R5 | Callback fires for an invoice_id we don't know | 200 to QPay, log to `reconciliation_queue` (don't loop) |

### What "automated" really means

For tests that depend on a real bank-app payment (P2, W-series, R-series), you'll need a fixture that:
1. Creates an invoice via our code.
2. Calls a sandbox-pay helper that QPay sandbox exposes (confirm with QPay support which endpoint or admin action triggers a mock pay).
3. Waits up to ~15s for either the callback or polls `/payment/check` as a fallback.

If sandbox-pay isn't programmable, run those tests **manually** before each release. Mark them as `it.skip(...)` with a comment, plus a `pnpm test:manual-qpay` script that prints the steps.

---

## 5. Trust model — why we don't trust the callback alone

The `callback URL` sheet documents the format but **not a signature**. QPay v2 doesn't HMAC-sign callbacks (unlike MonPay). That means anyone who guesses our callback URL can POST to it.

Therefore, the callback handler must **never** mark an order paid based on the callback body alone. It must:

1. Pull `invoice_id` (or `payment_id`) from the callback.
2. Call `/v2/payment/check` server-side with our Bearer token.
3. Verify `payment_status === "PAID"` **and** `payment_amount === order.amountMnt`.
4. Only then mark the order paid in a Firestore transaction (same `markOrderPaid` helper as the MonPay design — §7 of `MONPAY_DEEPLINK_DESIGN.md`).

This double-check costs one extra HTTPS call per payment but is non-negotiable. Add a TODO to ask QPay support whether v2 supports a configurable shared secret for callback auth — would simplify this.

---

## 6. Things to ask QPay support before going live

Email `tergel.t@qpay.mn`, cc `support@qpay.mn`:

1. **Sandbox mock-pay endpoint or admin action.** Is there a way to programmatically mark a sandbox invoice as PAID? (Needed for CI tests.)
2. **Callback signature.** Does v2 support a shared-secret or HMAC for callback authenticity? If yes, how do we configure it?
3. **Callback retry policy.** How many retries on non-200? Over what interval? (Affects how loud we should make our error path.)
4. **Production password rotation.** The password in the email is presumably temporary — confirm we can rotate it via merchant portal.
5. **`invoice_receiver_code = "terminal"`.** Is this the correct value for anonymous QR-pay (no specific receiver), or should we always pass a customer regnumber/phone?
6. **Per-merchant rate limits.** Token endpoint, invoice creation — what's the cap?
7. **Settlement.** When do paid funds land in our bank account, and which bank/account do they go to? (Needed for accounting + reconciliation against our bank statement ingestion.)
8. **Ebarimt 3.0.** The xlsx covers `/v2/ebarimt_v3/create`. Confirm we *don't* need to issue Ebarimt receipts ourselves if QPay does it for us — clarify which party owns the receipt issuance for restaurant orders under ₮100k.

---

## 7. What lands in this repo after testing

Following the same shape as `MONPAY_DEEPLINK_DESIGN.md` §3, expect:

```
src/types.ts                          # add 'qpay' to PaymentMethod, add qpayInvoiceId / qpayPaymentId / qpayQrText fields to Order
src/components/QpayPaymentPanel.tsx   # NEW — post-checkout screen: shows QR + bank deeplinks
src/lib/qpayBanks.ts                  # static metadata (icons, display names) for the qPay_deeplink array
src/context/LanguageContext.tsx       # QPay-specific MN/EN strings
functions/                            # NEW Cloud Functions package
  src/index.ts                        # exports: createQpayInvoice, qpayWebhook, getQpayToken (internal)
  src/qpayClient.ts                   # thin wrapper: auth, createInvoice, paymentCheck, cancelInvoice
  src/createQpayInvoice.ts            # callable from CartDrawer
  src/qpayWebhook.ts                  # onRequest; verifies via /payment/check; calls markOrderPaid
  src/qpayTokenCache.ts               # cache access_token in Firestore so we don't hit /auth/token per request
  src/markOrderPaid.ts                # SHARED helper across qpay/monpay/bank-transfer (deduped from MonPay design)
docs/qpay/                            # checked in: the email's xlsx + postman collection
QPAY_INTEGRATION.md                   # short user-facing doc; this file (test plan) gets cross-linked
firebase-blueprint.json               # extend Order: qpayInvoiceId, qpayPaymentId, qpayQrText
firestore.rules                       # already covered by §2 of BANK_RECONCILIATION_DESIGN.md
```

---

## 8. Order of operations (concrete checklist)

```
[  ] Copy the two attachment files into docs/qpay/ in this repo
     (they live in OneDrive\Documents\qpay today)
[  ] Import the Postman collection into Postman; set
     { username: 1TSEGTS, password: wwpdNTrD,
       host_merchant_v2: https://merchant-sandbox.qpay.mn,
       port_merchant_v2: '' }
[  ] Step through §3.1–3.7 by hand, capture each response into docs/qpay/samples/
[  ] Confirm callback shape via ngrok (§3.5) — write callback-sample.txt
[  ] Email QPay support with the §6 questions
[  ] Once Phase 1 is green, scaffold functions/ package per MonPay design
[  ] Implement qpayClient.ts against sandbox; replicate §3 as unit tests
[  ] Implement createQpayInvoice + qpayWebhook callable/handlers
[  ] Run §4 test matrix against sandbox
[  ] Add QpayPaymentPanel + CartDrawer button (gated by feature flag QPAY_ENABLED)
[  ] Manual end-to-end test from a real phone with a real bank app, sandbox-mode
[  ] Rotate production credentials with QPay
[  ] Flip QPAY_ENABLED to true in prod; soft-launch alongside bank-transfer (which stays as fallback)
[  ] Watch /payment/check success rate for 1 week before promoting QPay to default
```

---

## 9. References

- `MONPAY_DEEPLINK_DESIGN.md` — sibling design doc, same trust model and `markOrderPaid` pattern.
- `BANK_RECONCILIATION_DESIGN.md` — original payment plumbing; `paymentMethod` enum already includes `'qpay'`.
- `docs/qpay/2026.3.17 V2 API with Ebarimt 3.0 1.xlsx` — official QPay v2 spec from QPay support.
- `docs/qpay/QPay API v2.postman_collection 12 2.json` — runnable request samples for every endpoint above.
