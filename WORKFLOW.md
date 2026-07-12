# WORKFLOW.md

Git, testing, reviews, and releases for 1tsegts.

## Git

- Feature branches, PRs to the default branch; short kebab-case branch names.
- Small focused commits; imperative subject, body explains *why* when non-obvious.
- Never commit secrets or `.env` files. Clean up stray artifacts (e.g. `*.tmp` files) before committing.
- Multi-agent discipline: separate branches per agent/task (`claude/<task>`, `codex/<task>`).

## Local development — use the emulators, not production

Dev reads against the production Firestore burned through the free-tier daily
quota on 2026-07-09 and broke the live site. Default to the Emulator Suite:

1. Put `VITE_USE_EMULATORS=true` in `.env.local` (git-ignored).
2. Run `npm run emulators` in one terminal (imports/exports seed data from
   `emulator-data/`, also git-ignored — add a few test menu items via the
   admin UI once; they persist between runs).
3. Run `npm run dev` in another.

Remove the flag only when deliberately testing against production (e.g. QPay
sandbox flows that need the deployed webhook), and know that those reads bill.

## Testing

No automated test runner yet — verification is manual:

1. `npm run lint` (typecheck) must pass.
2. Exercise the changed flow in `npm run dev` (against the emulators, above).
3. Payment changes: test the full order → invoice → webhook → status flow against QPay sandbox before production; verify idempotency (replay the webhook).
4. Firestore rules changes: `npm run test:rules` (emulator-backed unit tests in
   `scripts/test-rules.mjs`) — add an allowed and a denied assertion for every
   rule you touch. Needs JDK 21+.

## Reviews

- Self-review the diff against the Code Review Checklist in [CLAUDE.md](CLAUDE.md) before any PR.
- Payment and Firestore-rules changes get a second opinion (Codex) — money and security are the correctness-critical domains.

## Releases

- Firebase deploy; deploy Functions before (or with) hosting when the client depends on new function behavior.
- After deploying: place a test order end-to-end (menu → cart → QPay → admin sees the order), and confirm `expirePendingQpayInvoices` still runs.
- Update the vault note (`MyAiVault/10_Projects/1tsegts.md`) when a release changes project reality.
