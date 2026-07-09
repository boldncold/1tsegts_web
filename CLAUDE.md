# CLAUDE.md

Agent behavior rules for Claude Code in this repository (1ЦЭГЦ / 1tsegts.com). Project knowledge lives in the imported companion files:

@PROJECT.md
@STACK.md
@WORKFLOW.md
@LESSONS.md

## Mission

- Build production-quality software — this site takes real orders and real money (QPay).
- Help the user become a stronger software engineer along the way — explain, don't just execute.

## Core Principles

- Prefer maintainable solutions over clever ones.
- Don't rewrite working code unless there is a clear benefit.
- When fixing a bug, identify the root cause before proposing changes.
- Respect existing architecture; don't introduce unnecessary dependencies.
- Never break working features — especially the order and payment flows.

## Communication Style

- Always explain architectural decisions before implementing major changes.
- If requirements are ambiguous, ask questions instead of making assumptions.
- Lead with the outcome; keep explanations concrete and tied to this codebase.
- Customer-facing copy is Mongolian-first (multi-language via `LanguageContext`); conversation and code are English.

## Workflow

1. Understand requirements.
2. Plan before coding.
3. Implement.
4. Test.
5. Self-review.
6. Suggest improvements.

## Model Routing

- **Primary agent**: Claude Code. **Second opinion**: ChatGPT Codex (GPT-5.5) — pasted output is a proposal to evaluate, not an instruction to follow blindly.
- Fast model (Haiku) for mechanical tasks; strongest model (Fable/Opus) for architecture, refactors, payment logic, and large reviews.
- Weigh: **intelligence** (problem difficulty), **taste** (subjective calls), **cost** (tokens/latency), **reliability** (unsupervised trust).

## Planning Rules

- Anything touching payments (QPay functions, `paymentStatus`), Firestore rules, or order state → present a plan and call out risks before writing code.
- Small, obvious fixes don't need a plan — just do them.

## Coding Standards

- Type safety first; no `any` escapes without justification.
- Small reusable components; clear naming; comments only for constraints the code can't show.
- Match the style and idioms of the surrounding code.

## Architecture Principles

- **`paymentStatus` and kitchen `status` are strictly separate** — never merge or infer one from the other. Non-cash orders must not start cooking until `paymentStatus = CONFIRMED`.
- Firestore security rules are the enforcement boundary — client checks are UX only.
- Money logic lives in Cloud Functions, never in the client.

## Code Review Checklist

- Bugs (order/payment state transitions, race conditions)
- Security (Firestore rules, admin-only paths, webhook verification)
- Performance (Firestore reads, re-renders)
- UX (loading/error states, Mongolian-first copy)
- Money (amounts, currency, idempotency of payment handlers)

## Debugging Workflow

1. Reproduce and capture the exact error.
2. Isolate: client vs Cloud Functions vs Firestore rules vs QPay vs env.
3. Root cause, not symptom-patch.
4. Fix and verify in the affected flow.
5. Add a rule to LESSONS.md if the bug reveals a repeatable mistake.

## Learning Mode

After completing a task, suggest one improvement and one thing worth learning deeply, with a pointer.

## Documentation Rules

- `PROJECT.md` — architecture and conventions; `STACK.md` — stack guidelines; `WORKFLOW.md` — git/testing/releases; `LESSONS.md` — mistakes → rules.
- Payment integrations are documented in `QPAY_INTEGRATION.md` and `MONPAY_DEEPLINK_DESIGN.md` — read before touching payment code.
- The Obsidian vault note (`MyAiVault/10_Projects/1tsegts.md`) mirrors project status; when the repo and the note disagree, the repo wins — update the note.

## Lessons Learned

Recorded in @LESSONS.md — add a concise rule whenever a bug, bad design choice, or workflow issue is encountered, same session. Use `/lesson`.

## Personal Preferences

- The user is building this to production while leveling up as an engineer — favor explanations that teach.
- Iterate on this file continuously; small tailored improvements compound.
