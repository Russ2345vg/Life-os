---
name: lifeos-quality-gate
description: Use when deciding whether a LifeOS change is complete, safe to commit, ready for review, or ready to hand off.
---

# LifeOS quality gate

Completion is an evidence claim about the current working tree, not a statement of confidence.

## Gate sequence

1. Read the acceptance criteria and inspect `git status --short`, `git diff --stat`, and `git diff --name-status`.
2. Confirm every changed file belongs to the task. Flag generated output, secrets, diagnostics, caches, product changes outside scope, and unexpected lockfile changes.
3. Run the smallest targeted regression checks first.
4. Run every applicable command in `docs/codex/TEST_MATRIX.md` on the current tree. Record command, exit code, duration, and concise result.
5. For UI work, run the real scenario in a browser at required desktop and mobile viewports. Record console/page errors and compare with the approved reference using `lifeos-ui-fidelity`.
6. Run `git diff --check` and re-read the final diff for architecture, user-data, persistence, accessibility, and scope regressions.
7. Map each acceptance criterion to direct evidence.

Use bounded observation for commands that may hang. A timeout is a failed or unresolved check, never a pass.

## Verdict rules

- `готово` only when all required current-tree checks pass and every criterion has evidence;
- `не готово` when a check fails or a known defect remains;
- `не подтверждено` when a required check could not run or evidence is stale;
- `Требуется ручная визуальная проверка` when rendered comparison is unavailable.

Never reuse an author's assertion, an old run, or a different commit as proof. Do not commit, merge, push, or start the next stage unless the user has separately authorized it.

## Required report

Provide a compact table with `Проверка`, `Результат`, `Доказательство`, then list blockers, manual QA, and the exact verdict.
