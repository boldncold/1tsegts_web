# PROJECT.md

Project-specific architecture and conventions for 1ЦЭГЦ (1tsegts.com) — a single-restaurant ordering web app. Seeded from the vault note 2026-07-07; when this file and the code disagree, the code wins — update this file.

## What it is

Customers browse a categorized menu (European / Asian / Mongolian / Drinks / Draft), add items (with portions + packaging) to a cart, and place **pickup** or **kiosk** orders. Payment is primarily **QPay** (one-tap via Mongolian bank apps), with cash and bank-transfer fallbacks. An `/admin` dashboard manages the menu, store hours, and incoming orders. UI is multi-language, Mongolian-first (`LanguageContext`). Live at https://1tsegts.com.

## Commands

```bash
npm run dev        # tsx server.ts — local dev (Express)
npm run build      # vite build
npm run preview    # vite preview
npm run lint       # tsc --noEmit (typecheck is the lint)
```

Env: `GEMINI_API_KEY`, `APP_URL` — see `.env.example`. Deployed on Firebase.

## Architecture

### Routes (`src/App.tsx`)
`/` Home · `/menu` · `/about` · `/contact` · `/admin` (dashboard, rendered without the public Navbar/Footer/Cart). Unknown paths fall back to Home.

### State
React Context: `AuthContext`, `CartContext`, `LanguageContext`, `StoreSettingsContext`.

### Orders — payment vs kitchen status (critical invariant)
Defined in `src/types.ts`. An order carries two independent state machines:

- **`paymentStatus`**: `AWAITING_PAYMENT` → `CONFIRMED` / `EXPIRED` / `MANUAL_REVIEW` / `REFUNDED`
- **kitchen `status`**: `pending` → `preparing` → `ready` → `completed` / `cancelled`

**Non-cash orders must not start cooking until `paymentStatus = CONFIRMED`.** Never merge these fields or derive one from the other.

### Menu item model
Categories; per-item `status` (`available` / `sold_out_today` / `hidden`); `portions`; `packagingPrice`; weekly `scheduledDays`; `todayOnly`; `featured`.

### QPay (primary payment rail)
Cloud Functions (Node 22): `createQpayInvoice`, `qpayWebhook`, `markOrderPaid`, `refundQpayPayment`, `expirePendingQpayInvoices`, plus token caching (`qpayTokenCache`). Full flow documented in [QPAY_INTEGRATION.md](QPAY_INTEGRATION.md); MonPay deeplink design in [MONPAY_DEEPLINK_DESIGN.md](MONPAY_DEEPLINK_DESIGN.md). Cash + bank transfer are secondary rails.

### Data & security
Firestore holds the data; [firestore.rules](firestore.rules) is the security boundary. Admin auth uses Firebase Auth (`signInWithRedirect`).

## Conventions

- Mongolian-first UI copy; all user-facing strings go through `LanguageContext`.
- Payment logic changes require reading `QPAY_INTEGRATION.md` first.
- Origin note: scaffolded in Google AI Studio (Gemini) — expect some generated-code idioms; clean up opportunistically, don't mass-rewrite.
