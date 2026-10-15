# Firebase → Convex cutover runbook

What's left of the migration, in order. **You** = the owner (accounts, credentials,
money); **Claude** = can be done by the agent. Branch: `claude/convex-migration`.
Convex project `1tsegts-497d5` in **EU (Dublin)** — ~150 ms from Ulaanbaatar vs
~225 ms for US: dev `moonlit-goat-443`, production `tame-ram-325`. The first
project (`1tsegts`, US, dev `grand-stoat-248`) is retired after cutover.

The site's canonical host is **`www.1tsegts.com`**: `1tsegts.com` answers every
path with a 307 to it, so QPay callbacks and `SITE_URL` use `www`.

## 0. Long-lead items — start now

| # | Who | What |
|---|-----|------|
| 0.1 | Done | **Production QPay accepts the `www.1tsegts.com` callback.** We asked QPay (2026-10-14) to whitelist the host; support replied (2026-10-15) that there is no host list on their side: the callback is whatever the invoice-create request sends. Proven 2026-10-14: a production invoice created with `https://www.1tsegts.com/api/qpay/callback/...` was accepted, then cancelled unpaid (order `kd7eqk2tkpnfx94ksghpvgezdh8g8cs0`, "Whitelist check (not a real order)"). **Delete that test order** (Convex dashboard → production → Data → orders) before reopening in 3.8, or it shows on the new admin board for 7 days. To re-check after a change to the callback URL: `npx convex run --prod orders:create` a one-item QPay order, `qpay:createInvoice` it with `skipQrImage: true` (an invoice back means accepted), `orders:cancel` it, then delete it. |
| 0.2 | Done | **Google OAuth client** in Google Cloud project `ai-studio-applet-webapp-730e3`, with redirect URIs `https://moonlit-goat-443.eu-west-1.convex.site/api/auth/callback/google` (dev) and `https://tame-ram-325.eu-west-1.convex.site/api/auth/callback/google` (prod). `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are on dev. |
| 0.3 | Done | **QPay sandbox env on dev** — `QPAY_BASE_URL=https://merchant-sandbox.qpay.mn` with QPay's **public test account** (`TEST_MERCHANT` / `123456`, invoice code `TEST_INVOICE`) and a generated `QPAY_CALLBACK_TOKEN`. The 1TSEGTS login is rejected by the sandbox since 2026-10 (it still works in production); don't put the real password on dev. |

## 1. Certify on dev (P5)

Run `npm run dev` locally (dev deployment, `VITE_USE_EMULATORS` is irrelevant now).

**Admin dashboard** (done 2026-10-14, signed in with Google on dev):
- [x] Cash order → "Paid in cash" → CONFIRMED, *paid by* your email, kitchen status untouched.
- [x] Unpaid QPay order offers no "Start" (server-side gate covered by tests).
- [x] Bank tab: credit with the order's `GR-` code → *matched* on save → confirm → order CONFIRMED, entry *reconciled*.
- [x] Edit a menu item's price → saved; stored images and orderCount unchanged.
- [ ] Not exercised in the UI (backend tests only): image replacement, staff add/remove, store hours.

**QPay sandbox** (done 2026-10-14 against the public test account):
- [x] QPay order → sandbox invoice with QR; callback URL accepted (production acceptance is 0.1); missing deep links handled.
- [x] Callback with a wrong token → 401; with the right token and no payment → 500 (QPay retries), order stays AWAITING_PAYMENT.
- [x] Customer cancel → invoice `OPEN` → `CANCELED` at QPay.
- [x] Storefront re-run 2026-10-15 at phone width, after the merge with `main`: menu from dev, Cola ₮3,000 → QPay → QR shown, order stored at ₮3,000 `AWAITING_PAYMENT` with its invoice; customer cancel → `cancelled` / `cancelledBy: customer`, record kept.
- [x] Expiry cron closes a lapsed order on schedule.
- [ ] **Paid path — not possible in the sandbox** (its short links 404 and there is no sandbox bank app). Covered by the 13 tests in `convex/qpay.test.ts` and proven for real by the small real order in step 3.7.

## 2. Prepare production (any day before cutover)

| # | Who | Command / action | Status / check |
|---|-----|------------------|----------------|
| 2.1 | Done | New project `1tsegts-497d5` in **EU**; production `tame-ram-325`. | ~150 ms, host `*.eu-west-1.convex.*`. |
| 2.2 | Done | `npx convex deploy` (needs a human "y"). | `/ping` → `ok`. |
| 2.3 | Done | `npx @convex-dev/auth --prod`; `SITE_URL=https://www.1tsegts.com`. | Keys set. |
| 2.4 | Done | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` on prod (same client as dev). | Match dev. |
| 2.5 | Done | Prod QPay login: `QPAY_USERNAME=1TSEGTS`, `QPAY_PASSWORD` (Secret Manager **version 1**). Already set: `QPAY_BASE_URL=https://merchant.qpay.mn`, `QPAY_INVOICE_CODE=1TSEGTS_INVOICE`, `QPAY_CALLBACK_BASE_URL=https://www.1tsegts.com/api/qpay/callback`, generated `QPAY_CALLBACK_TOKEN`. | QPay prod issued a token for `1TSEGTS`; fake callback via `www` → **401**. |
| 2.6 | Done | Merged PR #9 (`vercel.json`): SPA fallback — fixes today's 404 on direct visits to `/menu`, `/admin` — and the callback proxy. | `curl -i https://www.1tsegts.com/api/qpay/callback/wrong/x` answered by Convex; `/menu` → 200. |
| 2.7 | Done | Vercel → Settings → Environment Variables: `VITE_CONVEX_URL` = `https://tame-ram-325.eu-west-1.convex.cloud` (Production) and `https://moonlit-goat-443.eu-west-1.convex.cloud` (Preview). | — |
| 2.8 | Done | Rehearsal import into prod: menu 47/47 (33 images into prod storage). **Dry run 2026-10-15** (the real importer against live Firestore, into the test backend): menu 47/47, 0 failures; settings: no document (store hours were never saved — both sites fall back to the built-in defaults, Mon closed, Tue–Sun 11:00–19:00); orders: Firestore holds **none at all**, so the orders import is a formality unless orders arrive before cutover. | Re-run converges at cutover. |
| 2.9 | You | `npx convex deploy` from `claude/convex-migration` (answer **y**; there is no flag to skip the prompt). Repeat after every later change under `convex/`. **Due:** production predates 255ef97 (refuse deleting invoiced orders; one bank credit per order). | Deploy output lists the changed functions; `/ping` → `ok`. |

`vercel.json` (PR #9):

```json
{
  "rewrites": [
    { "source": "/api/qpay/callback/:path*", "destination": "https://tame-ram-325.eu-west-1.convex.site/qpay/callback/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## 3. Cutover (quiet hour, ~45 min)

| # | Who | Step | Check |
|---|-----|------|-------|
| 3.1 | — | Gate: 0.1 done (prod invoice created with the `www` callback), section 1 all ticked, section 2 done — 2.9 after the last `convex/` change. | — |
| 3.2 | You | Old admin → store settings → **closed until today**. New orders stop. | Storefront shows closed. |
| 3.3 | You | Drain: wait until no order is `AWAITING_PAYMENT` (QPay ≤ 20 min incl. expiry; bank transfers: confirm or let lapse ≤ 30 min). Finish or leave kitchen orders — they move over with their status. | Old dashboard shows none awaiting payment. |
| 3.4 | Claude | Final import: `node scripts/cutover-import.mjs --prod` (menu, settings, the last 7 days of orders; re-runnable, works from PowerShell). Tested against dev 2026-10-15: menu 47/47, re-run left 47 rows. From now on only the **new** dashboard is used. | Ends with `OK: nothing failed.` |
| 3.5 | You | Merge the migration PR → Vercel deploys with the prod `VITE_CONVEX_URL`. | Site loads; menu shows. |
| 3.6 | You | Sign in at `/admin`; re-add staff emails (Firestore `admin_emails` was not importable). | Dashboard loads. |
| 3.7 | Both | Smoke test: cash order → mark paid; **real** QPay order for the cheapest item → CONFIRMED automatically; kitchen board updates. | — |
| 3.8 | You | New admin → store hours → reopen. | Storefront open. |

**Rollback** (any time before 3.8, or later if needed): Vercel → Deployments →
previous production deployment → **Promote**. Firebase is untouched and takes
over again. Orders placed on Convex in between must be re-entered by hand
(Convex dashboard → Data → orders, newest first).

## 4. After cutover

- **Days 0–14:** QPay may still call the **Firebase** webhook for invoices created
  before the cutover (paid late). Check daily:
  `firebase functions:log --only qpayWebhook --project ai-studio-applet-webapp-730e3`
  — any `order paid` / `flagging for review` line is money to reconcile by hand
  in the new dashboard.
- **Day 14 — decommission Firebase:** export Firestore (console → Import/Export)
  as a backup; delete the Cloud Functions; set Firestore rules to deny-all; remove
  `functions/`, `firestore.rules`, `firebase.json`, `scripts/test-rules.mjs` and the
  `firebase*` dependencies.
- **Docs:** done in the migration PR — PROJECT.md, STACK.md, WORKFLOW.md,
  QPAY_INTEGRATION.md and CLAUDE.md describe Convex. At decommission, drop the
  Firebase-only lessons and the retired-backend note in PROJECT.md.
