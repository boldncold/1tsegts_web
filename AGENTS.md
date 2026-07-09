# AGENTS.md

Instructions for coding agents (ChatGPT Codex and others) working in this repository — 1ЦЭГЦ (1tsegts.com), a restaurant ordering web app originally scaffolded in Google AI Studio (Gemini).

**Start by reading these files — they are the project documentation:**

1. [CLAUDE.md](CLAUDE.md) — behavior rules (mission, principles, planning rules, review checklist). They apply to every agent, not just Claude.
2. [PROJECT.md](PROJECT.md) — architecture: routes, contexts, the payment-vs-kitchen status invariant, menu model, QPay functions.
3. [STACK.md](STACK.md) — React 19 / Vite 6 / Tailwind v4 / Firebase / QPay guidelines.
4. [WORKFLOW.md](WORKFLOW.md) — git, testing, releases.
5. [LESSONS.md](LESSONS.md) — accumulated rules from past mistakes. If you cause or find a new one, add it there.

Non-negotiables:

- `paymentStatus` and kitchen `status` are separate state machines; non-cash orders must not start cooking until `paymentStatus = CONFIRMED`.
- Money logic and secrets live in Cloud Functions, never the client. `GEMINI_API_KEY` must never reach the client bundle.
- Firestore rules are the security boundary; client checks are UX only.
- Read [QPAY_INTEGRATION.md](QPAY_INTEGRATION.md) before touching payment code.
- Customer-facing copy is Mongolian-first via `LanguageContext`.
