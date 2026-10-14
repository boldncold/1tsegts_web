# Firebase → Convex cutover runbook

What's left of the migration, in order. **You** = the owner (accounts, credentials,
money); **Claude** = can be done by the agent. Branch: `claude/convex-migration`.
Dev deployment: `grand-stoat-248` (US). Production: a new deployment in **EU
(Dublin)** — measured ~140 ms from Ulaanbaatar vs ~225 ms for US.

## 0. Long-lead items — start now

| # | Who | What |
|---|-----|------|
| 0.1 | You | **QPay callback whitelist for `1tsegts.com`.** Send `docs/qpay/callback-whitelist-email-1tsegts-domain.md`. Production QPay rejects unknown callback hosts (`callback_url: INVALID`), so this must be confirmed **before** cutover. |
| 0.2 | You | **Google OAuth client** (Google Cloud Console → project `ai-studio-applet-webapp-730e3` → APIs & Services → Credentials → OAuth client ID → Web application). Authorized redirect URIs: `https://grand-stoat-248.convex.site/api/auth/callback/google` now, plus the production one from step 2.2 later. Put the ID/secret on the dev deployment as `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. |
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
- [x] QPay order → sandbox invoice with QR; callback URL accepted (the sandbox does not enforce the whitelist); missing deep links handled.
- [x] Callback with a wrong token → 401; with the right token and no payment → 500 (QPay retries), order stays AWAITING_PAYMENT.
- [x] Customer cancel → invoice `OPEN` → `CANCELED` at QPay.
- [x] Expiry cron closes a lapsed order on schedule.
- [ ] **Paid path — not possible in the sandbox** (its short links 404 and there is no sandbox bank app). Covered by the 13 tests in `convex/qpay.test.ts` and proven for real by the small real order in step 3.7.

## 2. Prepare production (any day before cutover)

| # | Who | Command / action | Check |
|---|-----|------------------|-------|
| 2.1 | You | Create the production deployment in **EU** (dashboard → project `1tsegts` → Production; if no region choice is offered for this project, create a new project in the EU region and use that). | Dashboard shows region EU. |
| 2.2 | Claude | `npx convex deploy` (pushes functions + schema to prod) | `Convex functions ready`. |
| 2.3 | Claude | `npx @convex-dev/auth --prod --web-server-url https://1tsegts.com` | Sets `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS` on prod. |
| 2.4 | You | Add `https://<prod>.convex.site/api/auth/callback/google` to the OAuth client; set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` on prod. | — |
| 2.5 | You | Prod QPay env: `QPAY_BASE_URL=https://merchant.qpay.mn`, `QPAY_INVOICE_CODE`, `QPAY_USERNAME`, `QPAY_PASSWORD`, new `QPAY_CALLBACK_TOKEN`, and `QPAY_CALLBACK_BASE_URL=https://1tsegts.com/api/qpay/callback`. | `npx convex env list --prod` shows the names. |
| 2.6 | Claude | Add `vercel.json` with the callback rewrite (below) in a small PR to `main`; you merge. Harmless before cutover. | `curl -i https://1tsegts.com/api/qpay/callback/wrong/x` → **401** (from Convex). |
| 2.7 | You | Vercel → Settings → Environment Variables: `VITE_CONVEX_URL` = `https://<prod>.convex.cloud` (Production) and `https://grand-stoat-248.convex.cloud` (Preview). | — |
| 2.8 | Claude | Rehearsal import into prod: menu + settings (see step 3.4 command). Re-runnable; the cutover run converges. | Report: menu `failed: []`. |

```json
{
  "rewrites": [
    {
      "source": "/api/qpay/callback/:path*",
      "destination": "https://<prod>.convex.site/qpay/callback/:path*"
    }
  ]
}
```

## 3. Cutover (quiet hour, ~45 min)

| # | Who | Step | Check |
|---|-----|------|-------|
| 3.1 | — | Gate: 0.1 confirmed by QPay, section 1 all ticked, section 2 done. | — |
| 3.2 | You | Old admin → store settings → **closed until today**. New orders stop. | Storefront shows closed. |
| 3.3 | You | Drain: wait until no order is `AWAITING_PAYMENT` (QPay ≤ 20 min incl. expiry; bank transfers: confirm or let lapse ≤ 30 min). Finish or leave kitchen orders — they move over with their status. | Old dashboard shows none awaiting payment. |
| 3.4 | Claude | Final import: `npx convex run --prod migrations/firestoreImport:importPublicData '{"source":{…firebase-applet-config…},"collections":["menu","settings","orders"],"ordersSinceDays":7}'`. From now on only the **new** dashboard is used. | All `failed: []`. |
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
  `firebase*` dependencies; ask QPay to drop the old callback host.
- **Docs** (in the cutover PR or right after): PROJECT.md, STACK.md, WORKFLOW.md,
  QPAY_INTEGRATION.md and CLAUDE.md's architecture principles still describe
  Firebase (Firestore rules as the boundary → server-side checks in
  `convex/lib/admin.ts`; Cloud Functions → `convex/qpay.ts` / `payments.ts`;
  emulators → the dev deployment; `npm test` runs the Convex tests).
