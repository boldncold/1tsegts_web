# PROJECT.md

Project-specific architecture and conventions for 1ЦЭГЦ (1tsegts.com) — a single-restaurant ordering web app. Seeded from the vault note 2026-07-07; when this file and the code disagree, the code wins — update this file.

## What it is

Customers browse a categorized menu (European / Asian / Mongolian / Drinks / Draft), add items (with portions + packaging) to a cart, and place **pickup** or **kiosk** orders. Payment is primarily **QPay** (one-tap via Mongolian bank apps), with cash and bank-transfer fallbacks. An `/admin` dashboard manages the menu, store hours, and incoming orders. UI is multi-language, Mongolian-first (`LanguageContext`). Live at https://www.1tsegts.com (the bare `1tsegts.com` redirects there).

## Commands

```bash
npx convex dev     # pushes convex/ to the dev deployment on every save — run beside npm run dev
npm run dev        # tsx server.ts — local dev (Express)
npm test           # vitest + convex-test — the Convex function tests
npm run lint       # tsc --noEmit (typecheck is the lint)
npm run build      # vite build
npm run preview    # vite preview
```

Env: `VITE_CONVEX_URL` (written to `.env.local` by `npx convex dev`), `GEMINI_API_KEY`, `APP_URL` — see `.env.example`. Server secrets (QPay, Google sign-in) are Convex environment variables, set per deployment.

## Deploying

Two different platforms — don't assume one covers the other:

- **Backend → Convex**, project `1tsegts-497d5` (EU): production `tame-ram-325`, dev `moonlit-goat-443`. `npx convex deploy` pushes `convex/` to production and asks for confirmation.
- **Frontend → Vercel**, built from GitHub `main`. Merging to `main` publishes it, with `VITE_CONVEX_URL` pointing at production. `vercel.json` serves the SPA on every route and proxies `/api/qpay/callback/*` to Convex.

Order matters when a change spans both: **backend → frontend**. A frontend that calls a function production doesn't have yet breaks as soon as Vercel republishes.

Firebase was the backend until 2026-10-15 and was decommissioned on 2026-10-29: its code is gone from the repo, Firestore is locked (deny-all rules, data kept), and its functions are inert with the project's billing off. Don't shut down the Google Cloud project `ai-studio-applet-webapp-730e3` — the Google sign-in client for `/admin` lives there.

## Architecture

### Routes (`src/App.tsx`)
`/` Home · `/menu` · `/about` · `/contact` · `/admin` (dashboard, rendered without the public Navbar/Footer/Cart). Unknown paths fall back to Home.

### State
React Context: `AuthContext`, `CartContext`, `LanguageContext`, `StoreSettingsContext`.

### Orders — payment vs kitchen status (critical invariant)
Defined in `src/types.ts`, mirrored by `convex/validators.ts`. An order carries two independent state machines:

- **`paymentStatus`**: `AWAITING_PAYMENT` → `CONFIRMED` / `EXPIRED` / `MANUAL_REVIEW` / `REFUNDED`
- **kitchen `status`**: `pending` → `preparing` → `ready` → `completed` / `cancelled`

**Non-cash orders must not start cooking until `paymentStatus = CONFIRMED`** — `convex/ordersAdmin.ts` refuses the kitchen move on the server. Never merge these fields or derive one from the other. Cancelling keeps the order (`cancelledBy` customer / restaurant), so a late payment can still be found.

### Menu item model
Categories; per-item `status` (`available` / `sold_out_today` / `hidden`); `portions`; `packagingPrice`; weekly `scheduledDays`; `todayOnly`; `featured`. Images live in Convex file storage (`imageRef`).

### QPay (primary payment rail)
Convex: `convex/qpay.ts` (`createInvoice` action, `qpayCallback` HTTP action, admin `refund`, the 5-minute expiry cron) and `convex/payments.ts` (every `paymentStatus` write), over the HTTP client in `convex/lib/qpayClient.ts`. Each invoice carries its callback URL, `https://www.1tsegts.com/api/qpay/callback/...`, which Vercel proxies to Convex. Full flow documented in [QPAY_INTEGRATION.md](QPAY_INTEGRATION.md); MonPay deeplink design in [MONPAY_DEEPLINK_DESIGN.md](MONPAY_DEEPLINK_DESIGN.md). Cash + bank transfer are secondary rails; `convex/bank.ts` matches bank credits to orders by their `GR-` reference code.

### Data & security
Convex holds the data (`convex/schema.ts`). There are no security rules to fall back on: every public function authorizes itself, admin paths through `requireAdmin` in [convex/lib/admin.ts](convex/lib/admin.ts). Order amounts are priced on the server from the menu (`convex/lib/orderPricing.ts`); the browser never sends one. Admin sign-in is Convex Auth with Google (`convex/auth.ts`); admins are the owner's email plus the `admins` table, managed in the dashboard.

## Conventions

- Mongolian-first UI copy; all user-facing strings go through `LanguageContext`.
- Payment logic changes require reading `QPAY_INTEGRATION.md` first.
- Origin note: scaffolded in Google AI Studio (Gemini) — expect some generated-code idioms; clean up opportunistically, don't mass-rewrite.
