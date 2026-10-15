# STACK.md

Stack guidelines: React 19, Vite 6, TypeScript, Tailwind CSS v4, React Router 7, Convex (database, server functions, auth, file storage), QPay, Gemini. Project specifics live in [PROJECT.md](PROJECT.md).

## React + Vite

- Function components with typed props; extract a component once a pattern appears twice.
- State lives in the existing Contexts (`Auth`, `Cart`, `Language`, `StoreSettings`) — don't add a state library for problems Context already solves.
- Router 7: routes declared in `src/App.tsx`; admin routes render without public chrome.
- Vite env vars must be prefixed `VITE_` to reach the client — anything so prefixed is public; secrets stay server-side (Convex environment variables).

## Tailwind CSS v4

- Utility classes in JSX; use `clsx` + `tailwind-merge` for conditional/variant styling.
- v4 is CSS-first config (no `tailwind.config.js` by default) — theme tokens live in CSS.

## Convex

- **Every public function is the security boundary.** Any browser can call any
  exported `query` / `mutation` / `action`, so each one authorizes itself —
  `requireAdmin` from `convex/lib/admin.ts` for admin paths. Client-side checks
  are UX only; there are no security rules to fall back on.
- Validate arguments with `v` validators. Shared validators live in
  `convex/validators.ts` and mirror `src/types.ts` — change both together.
- **Mutations are transactions** (Convex retries them on conflict); **actions**
  call external APIs and write through internal mutations. Money logic and
  third-party secrets live in server functions, never the client.
- Query through indexes (`withIndex`); don't `.collect()` a table that grows.
- Internal-only functions use `internalQuery` / `internalMutation` /
  `internalAction`. Webhook handlers must be idempotent — QPay retries.
- Tests: `npm test` (vitest + convex-test) — add an "allowed" and a "refused"
  case for every authorization rule you touch.

## Payments (QPay)

- Read [QPAY_INTEGRATION.md](QPAY_INTEGRATION.md) before touching payment code.
- Never trust the client about payment state — only the QPay callback (`convex/qpay.ts`) and `markPaid` / admin `confirmPayment` (`convex/payments.ts`) may set `paymentStatus = CONFIRMED`. Order amounts are priced on the server (`convex/lib/orderPricing.ts`).
- Handle amounts as integers (MNT has no decimals in practice); log every state transition.

## TypeScript

- `npm run lint` = `tsc --noEmit`; keep it clean.
- Shared types live in `src/types.ts` — extend there, don't fork local copies.

## Gemini (`@google/genai`)

- `GEMINI_API_KEY` is server-side only — never expose it via a `VITE_` var or client bundle.
