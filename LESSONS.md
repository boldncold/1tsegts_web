# LESSONS.md

A growing record of mistakes and the rules that prevent them. Add an entry whenever a bug, bad design choice, or workflow issue is encountered — same session, while the context is fresh. Use `/lesson`.

Format: **Rule** first (what to do differently), then *Why* (what went wrong). Newest on top.

## Lessons

- **A rule the UI enforces (a disabled button, a hidden dish, "closed" on the cart) is a suggestion until the server function enforces it too. Keep such rules in one pure module both sides import (`convex/lib/availability.ts`), and run calendar rules on Ulaanbaatar time explicitly, never the machine's clock settings.**
  *Why:* sold-out, hidden, off-schedule and draft dishes, switched-off portions and closed-store orders were only blocked in the browser; `orders.create` accepted all of them. The client's schedule check also used `new Date().getDay()`, which on a UTC server would call 00:00–08:00 Ulaanbaatar time "yesterday".

- **Every font that sets Mongolian text must ship the `cyrillic-ext` subset — that is where Ө ө Ү ү live. Check the subset list in the Google Fonts CSS (`/* cyrillic-ext */` blocks), not the "Cyrillic" label on the font page.**
  *Why:* Playfair Display, the heading font since the AI Studio scaffold, has `cyrillic` but not `cyrillic-ext`, so every ө and ү in a heading ("төгс", "Үхрийн") was drawn by a fallback serif mid-word. It read as "lots of uneven fonts" and nobody could say why.

- **Never invent content for a real record. A missing photo, name or price stays missing and the UI shows an honest empty state — no placeholder service as a "default".**
  *Why:* the admin form saved `picsum.photos/seed/<name>` as the image of any dish added without a photo, so 8 of 40 live dishes showed forests and seascapes as food. The cuisine tiles used the same service. Placeholders from a scaffold read as real data once they reach production.

- **When records stop being deleted and are kept with a status instead (e.g. `cancelled`), re-check every UI filter and dismiss action that treated that status as "gone". And a state a human must settle needs a way to settle it in the app, tested end to end.**
  *Why:* on Firebase a cancelled order was deleted, so the review panel's `status !== 'cancelled'` filter was harmless. On Convex cancels are kept, and a payment landing after a customer cancel was flagged but hidden from the panel. The panel's "Mark paid" button had also never worked: the confirm path refuses `MANUAL_REVIEW` by design, so flagged money had no resolution at all.

- **A re-runnable import into a target that a rehearsal already filled must mirror the source — remove what the source deleted and replace what it changed — not only add. And guard the removal: never prune after a failed or empty read.**
  *Why:* the Firestore → Convex importer upserted by legacyId and reused each dish's stored photo, so at cutover a dish deleted in the old admin after the rehearsal (e.g. the AI Studio demo items) would have stayed on the new site, and a changed photo would have been ignored.

- **Before allowing a record to be deleted, ask whether money can still arrive for it, not just whether it already holds money. An issued QPay invoice can be paid until QPay closes it, and closing is best-effort.**
  *Why:* `ordersAdmin.remove` allowed deleting an unpaid order with an open invoice; a late payment would reach a callback with no order to confirm or flag — the silent money drop the webhook rule below forbids.

- **A `datetime-local` input holds local wall-clock time: build its default from local getters (`nowForDateTimeLocal` in `AdminDashboard.tsx`), never `toISOString().slice(0, 16)`, and convert to UTC with `new Date(value).toISOString()` only on save.**
  *Why:* the bank-history manual-entry form defaulted to the UTC string, which the input read as local time, so every `postedAt` left at the default was stored 8 hours early in Ulaanbaatar (an entry made at 20:42 local saved as 04:42Z).

- **Before the server starts validating a value the client sends, grep every place the UI builds it — including placeholder values the UI invents — and test the validator with those exact values, not just the documented shape.**
  *Why:* the server-side pricing in `createQpayInvoice` rejected the `'Default'` portion that `MenuSection` / `TraditionalMenuSection` put ahead of an item's real portions (meaning "base price"). For about two hours, a QPay order failed as "menu has changed" whenever it included one of the 30 items with portions at its default size.

- **`firebase.json`'s `firestore` block must name the database (`[{ "database": "<id>", "rules": …, "indexes": … }]`). Without it, `firebase deploy --only firestore:rules` targets `(default)`, and this app lives on a named database. Verify a rules deploy by exercising a rule that changed (e.g. an anonymous read it newly allows), never by the deploy's exit code.**
  *Why:* every rules deploy since the AI Studio days landed on an unused `(default)` database while the app's database kept older rules. Found because the live database refused anonymous reads of `settings/store`, which the repo allows. That rule shipped in the same commit (`0355861`) as `hasNoForgedPayment`, so the payment-field protections were never live either.

- **Never bill or confirm against an amount the browser wrote. Every order field (`items[].price`, `total`, `amountMnt`, `adminDiscountMnt`, `quantity`) is customer input: recompute the charge server-side from the menu (`priceCart` in `convex/lib/orderPricing.ts`), reject any quantity that isn't a positive integer, and honour discounts only for a verified admin caller.**
  *Why:* `firestore.rules` left `amountMnt` client-settable and `createQpayInvoice` billed it verbatim, so anyone with devtools could order ₮50,000 of food, pay ₮100, and `qpayWebhook` would confirm it as exact. A `quantity: -1` line could also cancel out another item.

- **On a named Firestore database, every Firestore trigger must pass `database:` in its options. Triggers bind to a database at DEPLOY time, unlike `getDb()` which resolves at runtime — omit it and the function silently fails to deploy while every other function in the same deploy succeeds.**
  *Why:* `reconcileBankTransaction` was written, built, and deployed with the rest of the payment work, and `firebase deploy` reported success. It simply was not in `firebase functions:list` afterwards: `onDocumentCreated` had defaulted to `(default)`, which does not exist on this project. Auto-confirm ran degraded on the 5-minute sweep alone, and nothing in the deploy output said so. Verify a deploy with `functions:list`, not with the deploy's exit code.

- **Before proposing or running a project command, confirm it against the config that implements it (`firebase.json`, `package.json` scripts, CI files) — never against the prose in `PROJECT.md` / `WORKFLOW.md`. This repo has no Firebase Hosting target: the frontend ships on Vercel from `main`, and `ai-studio-applet-webapp-730e3` only held the Firebase functions and rules.**
  *Why:* `firebase deploy --only hosting` was handed to the user on the strength of PROJECT.md's "Deployed on Firebase" and WORKFLOW.md's "deploy Functions before (or with) hosting". It cannot work — `firebase.json` declares only `firestore`, `functions` and `emulators`, `.firebaserc` is absent and there is no CI workflow. The docs describe intent; the config describes reality, and here the docs are stale.

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
