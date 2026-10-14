# LESSONS.md

A growing record of mistakes and the rules that prevent them. Add an entry whenever a bug, bad design choice, or workflow issue is encountered — same session, while the context is fresh. Use `/lesson`.

Format: **Rule** first (what to do differently), then *Why* (what went wrong). Newest on top.

## Lessons

- **Before the server starts validating a value the client sends, grep every place the UI builds it — including placeholder values the UI invents — and test the validator with those exact values, not just the documented shape.**
  *Why:* the server-side pricing in `createQpayInvoice` rejected the `'Default'` portion that `MenuSection` / `TraditionalMenuSection` put ahead of an item's real portions (meaning "base price"). For about two hours, a QPay order failed as "menu has changed" whenever it included one of the 30 items with portions at its default size.

- **Never bill or confirm against an amount the browser wrote. Every order field (`items[].price`, `total`, `amountMnt`, `adminDiscountMnt`, `quantity`) is customer input: recompute the charge server-side from the menu (`priceOrderItems` in `functions/src/orderPricing.ts`), reject any quantity that isn't a positive integer, and honour discounts only for a verified admin caller.**
  *Why:* `firestore.rules` left `amountMnt` client-settable and `createQpayInvoice` billed it verbatim, so anyone with devtools could order ₮50,000 of food, pay ₮100, and `qpayWebhook` would confirm it as exact. A `quantity: -1` line could also cancel out another item.

- **On any custom pointer-drag surface, kill native drag on nested `<img>` and `<a>` (`draggable={false}` + a `dragstart` preventDefault on the container), and swallow the click that ends a drag.**
  *Why:* the featured-dishes belt only dragged from the lower part of a card — the top was bare `<img>`, whose native HTML drag-and-drop preempted the pointer stream, while the bottom was covered by the text overlay. The `<a>` CTA card had the mirror bug: a drag ending on it still fired a click and navigated to /menu.

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
