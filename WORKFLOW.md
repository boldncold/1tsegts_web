# WORKFLOW.md

Git, testing, reviews, and releases for 1tsegts.

## Git

- Feature branches, PRs to the default branch; short kebab-case branch names.
- Small focused commits; imperative subject, body explains *why* when non-obvious.
- Never commit secrets or `.env` files. Clean up stray artifacts (e.g. `*.tmp` files) before committing.
- Multi-agent discipline: separate branches per agent/task (`claude/<task>`, `codex/<task>`).

## Local development — the dev deployment

Convex project `1tsegts-497d5` (EU) has a dev deployment (`moonlit-goat-443`)
separate from production (`tame-ram-325`), so local work never touches live data.

1. `npx convex dev` in one terminal — pushes `convex/` to the dev deployment on
   every save and keeps `.env.local` pointing at it.
2. `npm run dev` in another.

Dev uses QPay's sandbox with the public test account (see QPAY_INTEGRATION.md);
admin sign-in uses the same Google client as production.

## Testing

1. `npm run lint` (typecheck) must pass.
2. `npm test` (Convex function tests: pricing, orders, payments, admin
   authorization) must pass. For money and authorization code, check the tests
   can fail: break the rule on purpose and watch them go red.
3. Exercise the changed flow with `npm run dev` against the dev deployment.
4. Payment changes: the QPay sandbox covers invoices, callbacks, cancel and
   expiry but cannot be paid; after deploying, place one small real QPay order.

## Reviews

- Self-review the diff against the Code Review Checklist in [CLAUDE.md](CLAUDE.md) before any PR.
- Payment and authorization changes get a second opinion (Codex) — money and security are the correctness-critical domains.

## Releases

- **Backend first:** `npx convex deploy` (asks for confirmation), then merge the
  frontend to `main` — Vercel publishes it. A frontend that calls functions the
  deployment doesn't have yet breaks in production.
- After deploying: place a small real order end-to-end (menu → cart → QPay → admin
  sees it) and check the Convex logs for the 5-minute crons (QPay expiry, bank sweep).
- Update the vault note (`MyAiVault/10_Projects/1tsegts.md`) when a release changes project reality.
