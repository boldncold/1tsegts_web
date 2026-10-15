# QPay Integration

How the QPay payment flow works and how to operate it. QPay runs on **Convex**
(`convex/qpay.ts`, `convex/payments.ts`); the Firebase Cloud Functions it replaced
stay in `functions/` only until they are decommissioned (see
`docs/CONVEX_CUTOVER.md`, section 4).

---

## 1. Pieces

| Layer | File(s) | What it does |
|---|---|---|
| Order creation | `convex/orders.ts` (`create`) | Prices the order from the menu on the server (`convex/lib/orderPricing.ts`) and sets `amountMnt`, `paymentStatus: AWAITING_PAYMENT`, `paymentExpiresAt` (15 min). The browser never sends an amount. |
| Invoice | `convex/qpay.ts` (`createInvoice` action) | Bills `order.amountMnt`, stores the QR / short URL / deep links on the order. Idempotent. |
| Callback | `convex/qpay.ts` (`qpayCallback`), routed in `convex/http.ts` | Verifies the token, asks QPay `/v2/payment/check`, then confirms or flags. |
| State changes | `convex/payments.ts` | Every `paymentStatus` write: `markPaid`, `flagForReview`, `expireOrder`, `markRefunded`, `confirmPayment` (admin). Internal or admin-checked; each is one transaction. |
| Expiry | `convex/crons.ts` → `qpay.expirePendingInvoices` | Every 5 min: cancels lapsed invoices at QPay and marks orders `EXPIRED`. |
| Refund | `convex/qpay.ts` (`refund` action, admin) | CARD payments only; P2P is refused with guidance. |
| Client | `src/components/QpayPaymentPanel.tsx`, `src/context/CartContext.tsx` | Renders the invoice; `orders.track` streams payment-status changes. |
| Tests | `convex/qpay.test.ts`, `convex/admin.test.ts` | Against a fake QPay: billing, caching, every callback branch, expiry, cancel, refunds. |

---

## 2. Configuration

Convex environment variables, per deployment (dashboard → deployment →
Settings → Environment Variables, or `npx convex env set [--prod] NAME value`):

| Variable | Production | Dev |
|---|---|---|
| `QPAY_BASE_URL` | `https://merchant.qpay.mn` | `https://merchant-sandbox.qpay.mn` |
| `QPAY_USERNAME` / `QPAY_PASSWORD` | `1TSEGTS` / the merchant password | QPay's public test account `TEST_MERCHANT` / `123456` |
| `QPAY_INVOICE_CODE` | `1TSEGTS_INVOICE` | `TEST_INVOICE` |
| `QPAY_CALLBACK_TOKEN` | random secret | a different random secret |
| `QPAY_CALLBACK_BASE_URL` | `https://www.1tsegts.com/api/qpay/callback` | unset (uses the deployment's own site URL) |

- The 1TSEGTS login is **production-only**: the sandbox has rejected it since
  2026-10. Never put the real password on dev.
- **Callback URL.** QPay calls whatever `callback_url` the invoice was created with;
  support said (2026-10-15) there is no host list on their side to add us to.
  Callbacks go to our own domain, `www.1tsegts.com`, and `vercel.json` proxies
  `/api/qpay/callback/*` to the Convex production deployment. Each invoice keeps
  the URL it was created with, so on a future backend move late callbacks still
  reach us and only the rewrite changes. Use `www`: `1tsegts.com` 307-redirects
  every path, and QPay won't follow it. Production acceptance of this URL is
  checked before cutover (`docs/CONVEX_CUTOVER.md`, 0.1).
- Secrets are read once per call; changing a variable needs no redeploy.

---

## 3. Protocol notes

### Token caching
`/v2/auth/token` is called sparingly: the bearer token is cached in the
`qpayTokens` table, keyed by base URL **and** username, and reused until ~60 s
before expiry. Re-auth is from scratch — the spec makes `/refresh` one-shot.

### Callback verification
QPay calls `<base>/<token>/<orderId>` (plus a `?qpay_payment_id=` query). The
handler:
1. Rejects a wrong token (constant-time compare) with **401**.
2. Looks up the order and its `qpayInvoiceId`.
3. Calls `/v2/payment/check` server-side — the request body is never trusted.
4. Exact `PAID` amount → `markPaid` (idempotent: a repeat returns
   `already_confirmed`). Wrong amount, paid after expiry, or paid after a customer
   cancel → `flagForReview` (`MANUAL_REVIEW`) and ack. Nothing visible yet →
   **500**, so QPay retries.

QPay needs **HTTP 200 + body `SUCCESS`** to stop retrying. Every branch ends in
confirmed, flagged for a human, or a deliberate retry — never "log and ack".

### Idempotency
- `createInvoice` returns the stored invoice if the order already has one; if two
  calls race, the losing call cancels its orphaned invoice at QPay.
- Replayed callbacks change nothing.

### Cancellations and expiry
- A cancel, by the customer or the restaurant, keeps the order (`status:
  cancelled`, `cancelledBy: customer | restaurant`) and closes its invoice at
  QPay, so a late payment can still be found and flagged.
- `expirePendingInvoices` cancels lapsed invoices at QPay (best-effort) and flips
  `AWAITING_PAYMENT` → `EXPIRED` only if still awaiting — a confirmation wins.
- Once payment settles, the order's QR image is dropped (orders are kept).

### Refunds
Admin **Refund** on a `CONFIRMED` QPay order calls `DELETE
/v2/payment/refund/{payment_id}` and marks it `REFUNDED`. QPay can only refund
**CARD** payments; P2P (bank-app) payments must be reversed by a manual bank
transfer, and the function says so (`P2P_NOT_REFUNDABLE`).
`PAYMENT_ALREADY_CANCELED` from QPay is treated as success (an earlier attempt
refunded but didn't record it).

### Flagged payments (`MANUAL_REVIEW`)
A `PAID` payment that can't be auto-confirmed — wrong amount, paid after expiry,
or paid after a cancel — goes to `MANUAL_REVIEW` with the expected and observed
amounts. It stays in the dashboard's **Payments needing review** panel (whatever
the kitchen status) until an admin settles it:
- **Accept payment** (`payments.acceptReviewedPayment`) → `CONFIRMED`, so the
  kitchen can start; an order the customer had cancelled is reopened.
- **Refunded by hand** (`payments.markReviewRefunded`) → `REFUNDED` with
  `refundedVia: manual` and an optional note, for money sent back outside QPay.

Both are admin-only and only accept a `MANUAL_REVIEW` order; the review fields
stay as the audit trail (`reviewResolution`, `reviewResolvedBy`). The callback's
own confirm still refuses `MANUAL_REVIEW`, so only a person settles one.

---

## 4. Testing

- `npm test` — the QPay tests run against a fake QPay (no network).
- Dev deployment + QPay sandbox (public test account): invoices, callback-URL
  acceptance, payment check, invoice cancel and expiry all work. **The sandbox
  cannot be paid from our side** (its short links 404; there is no test bank
  app), so the paid path is proven by the tests plus a small real order in
  production after each payment-related deploy.
- Replaying a real callback: copy the callback URL from the Convex logs and
  `curl` it — the order must stay unchanged and the log say `already_confirmed`.

---

## 5. If something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Customer sees "QPay unavailable" (`QPAY_UNAVAILABLE`) | QPay auth or invoice call failed | Convex logs for `qpay.createInvoice`; check the variables above. |
| QPay error `NO_CREDENDIALS` | Credentials rejected (`NO_CREDENTIALS`, spelled right, means none were sent) | Re-copy `QPAY_PASSWORD` (Secret Manager version 1 for production). |
| `callback_url: INVALID` | Malformed callback URL. Seen once (2026-06) with a query string; the token and order id now go in path segments | Check `QPAY_CALLBACK_BASE_URL` is an absolute `https://` URL with no query string. If it still fails, send QPay support the exact URL from the Convex logs. |
| Callback hits but order stays `AWAITING_PAYMENT` | Payment not visible yet (QPay retries), or wrong `QPAY_CALLBACK_TOKEN` (401 in logs) | Logs for `qpayCallback`. |
| Order in `MANUAL_REVIEW` | Real money that couldn't be auto-confirmed | Check the expected vs observed amount in the review panel, then **Accept payment** or send the money back and mark **Refunded by hand**. |

## 6. Kill switch

`QPAY_ENABLED` in `src/lib/qpayConfig.ts` hides QPay at checkout (cash becomes
the default) after a frontend redeploy. The backend keeps handling callbacks for
existing invoices.
