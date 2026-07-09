# STACK.md

Stack guidelines: React 19, Vite 6, TypeScript, Tailwind CSS v4, React Router 7, Firebase (Firestore + Cloud Functions), QPay, Gemini. Project specifics live in [PROJECT.md](PROJECT.md).

## React + Vite

- Function components with typed props; extract a component once a pattern appears twice.
- State lives in the existing Contexts (`Auth`, `Cart`, `Language`, `StoreSettings`) — don't add a state library for problems Context already solves.
- Router 7: routes declared in `src/App.tsx`; admin routes render without public chrome.
- Vite env vars must be prefixed `VITE_` to reach the client — anything so prefixed is public; secrets stay server-side (Functions config / server env).

## Tailwind CSS v4

- Utility classes in JSX; use `clsx` + `tailwind-merge` for conditional/variant styling.
- v4 is CSS-first config (no `tailwind.config.js` by default) — theme tokens live in CSS.

## Firebase

- **Firestore rules are the security boundary** — every collection needs explicit rules; client-side checks are UX only. Test rule changes before deploying.
- Structure reads for the UI: prefer targeted queries over fetching collections and filtering client-side.
- **Cloud Functions** (Node 22) own all money logic and third-party secrets. Webhook handlers must be idempotent — QPay may retry.
- Keep functions small and single-purpose; shared logic in a helpers module.

## Payments (QPay)

- Read [QPAY_INTEGRATION.md](QPAY_INTEGRATION.md) before touching payment code.
- Never trust the client about payment state — only `qpayWebhook` / `markOrderPaid` (server-verified) may set `paymentStatus = CONFIRMED`.
- Handle amounts as integers (MNT has no decimals in practice); log every state transition.

## TypeScript

- `npm run lint` = `tsc --noEmit`; keep it clean.
- Shared types live in `src/types.ts` — extend there, don't fork local copies.

## Gemini (`@google/genai`)

- `GEMINI_API_KEY` is server-side only — never expose it via a `VITE_` var or client bundle.
