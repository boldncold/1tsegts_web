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
| 0.3 | You | **QPay sandbox env on dev** (Convex dashboard → dev → Settings → Environment Variables): `QPAY_BASE_URL=https://merchant-sandbox.qpay.mn`, `QPAY_INVOICE_CODE=1TSEGTS_INVOICE`, `QPAY_USERNAME`, `QPAY_PASSWORD`, `QPAY_CALLBACK_TOKEN` (new random string, not the Firebase one). |

## 1. Certify on dev (P5)

Run `npm run dev` locally (dev deployment, `VITE_USE_EMULATORS` is irrelevant now).

**Admin dashboard** (needs 0.2) — sign in at `/admin`, then:
- [ ] Edit a menu item and replace its image → the menu page shows the new image.
- [ ] Add a cash order from the storefront → "Mark paid" → order shows *paid by* your email.
- [ ] Place a QPay order, try "Start preparing" before paying → refused.
- [ ] Bank tab: add a credit whose memo has a bank-transfer order's `GR-` code → *matched* → confirm → order CONFIRMED, entry *reconciled*.
- [ ] Staff: add and remove an admin email; store hours: save → storefront reflects them.

**QPay sandbox** (needs 0.3):
- [ ] QPay order → QR/bank links appear (no `callback_url: INVALID`; if sandbox also enforces the whitelist, ask QPay to add `grand-stoat-248.convex.site` or test through a tunnel).
- [ ] Pay in sandbox → order flips to CONFIRMED within seconds; customer toast fires.
- [ ] Replay the callback (URL is in the Convex logs for `qpay.createInvoice`'s invoice; `curl` it) → order unchanged, log says `already_confirmed`.
- [ ] Let one order expire (15 min + ≤5 min cron) → EXPIRED; invoice cancelled at QPay.
- [ ] Cancel an unpaid QPay order from the storefront → invoice cancelled at QPay.

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
