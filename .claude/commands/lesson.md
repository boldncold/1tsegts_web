---
description: Capture a lesson learned into LESSONS.md
argument-hint: <what went wrong or the rule to remember>
---

Add a new lesson to LESSONS.md based on: $ARGUMENTS

Instructions:

1. If $ARGUMENTS is empty, derive the lesson from the most recent bug, mistake, or correction in this conversation.
2. Distill it into the LESSONS.md format — **Rule** first (imperative, what to do differently next time), then *Why* (one line on what actually went wrong). Be concise; one entry, not an essay.
3. Include file paths or API names in the rule when they make it actionable (e.g. "use `showAlert` from utils/dialog.ts"), but keep the rule general enough to prevent the whole class of mistake.
4. Check LESSONS.md for an existing entry covering the same mistake — if one exists, sharpen that entry instead of adding a duplicate.
5. Insert the new entry at the TOP of the "## Lessons" section (newest first).
6. If the lesson is about agent workflow rather than this codebase, note that it belongs in the vault's CLAUDE.md Lessons Learned section instead, and say so rather than adding it here.
7. Confirm with the final entry text so the user sees exactly what was recorded.
