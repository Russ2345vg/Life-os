---
name: lifeos-task-intake
description: Use when a LifeOS request is vague, urgent, broad, or not yet ready for implementation planning.
---

# LifeOS task intake

Turn the request into a bounded, testable task before proposing code changes.

## Intake sequence

1. State the user outcome in one sentence.
2. Describe the primary user scenario from entry point to visible result.
3. Separate constraints and explicit non-goals from assumptions.
4. Define observable acceptance criteria. Avoid implementation details unless the request fixes them.
5. Inspect the current implementation, approved references, domain contracts, and tests read-only.
6. Identify the likely affected layers and modules using `docs/codex/PROJECT_MAP.md`.
7. Record risks: domain invariants, persistence, dates, responsive layout, accessibility, and user data.
8. Select the smallest relevant checks using `docs/codex/TEST_MATRIX.md`.

Ask one concise question only when the missing answer would materially change scope, architecture, user data, or acceptance. Otherwise state the assumption and continue.

## Required output

Use these headings:

- `Задача` — outcome and current problem.
- `Сценарий` — user path and visible result.
- `Границы` — constraints, non-goals, assumptions.
- `Критерии приёмки` — observable evidence of success.
- `Затрагивается` — layers and likely modules, not a speculative file dump.
- `Риски` — concrete regressions to prevent.
- `Проверки` — targeted tests and required quality gates.
- `Готовность к плану` — `да`, or one blocking question.

Do not implement, estimate, or expand the feature during intake.
