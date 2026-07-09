# LESSONS.md

A growing record of mistakes and the rules that prevent them. Add an entry whenever a bug, bad design choice, or workflow issue is encountered — same session, while the context is fresh. Use `/lesson`.

Format: **Rule** first (what to do differently), then *Why* (what went wrong). Newest on top.

## Lessons

- **For mobile payment redirects, centralize the launch URL and guard auto-open per invoice.**
  *Why:* QPay mobile routing was tied to the fresh invoice creation path and a manually built QR URL, so cached invoices or provider short URLs could miss the qpay.mn deeplink behavior or bounce users repeatedly after returning from payment.

- **Every terminal branch of a payment webhook must end in exactly one of: confirmed, flagged-for-human, or retryable error — "log + ack 200" is a silent money drop.**
  *Why:* qpayWebhook acked exact-amount payments that landed on EXPIRED orders with just a log line and HTTP 200; the customer's money was taken with no order and nothing for an admin to act on.

- **Gate money/kitchen actions with allowlists (`status === 'CONFIRMED'`), never blocklists of known-bad states.**
  *Why:* the admin "Start Preparing" button blocked AWAITING_PAYMENT and MANUAL_REVIEW but not EXPIRED/REFUNDED — every newly added payment state silently re-opened the gate.

- **Keep `paymentStatus` and kitchen `status` strictly separate; only server-verified paths may set `CONFIRMED`.**
  *Why:* merging payment and kitchen state (or trusting the client) lets unpaid non-cash orders reach the kitchen.

- **Don't leave editor/agent artifacts in the tree (`*.tmp`, scratch files) — delete or gitignore them immediately.**
  *Why:* a stray `AdminDashboard.tsx.tmp` lingered in `src/components/` and polluted the working tree.
