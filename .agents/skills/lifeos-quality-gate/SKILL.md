---
name: lifeos-quality-gate
description: Use when deciding whether a LifeOS change is complete, safe to commit, ready for review, or ready to hand off.
---

# LifeOS quality gate

Completion is an evidence claim about the current working tree, not a statement of confidence.
Apply the scope and Testing Stage Gate in `AGENTS.md`; command details live in `TEST_MATRIX.md`.

## Gate sequence

1. Read the acceptance criteria and inspect `git status --short`, `git diff --stat`, and `git diff --name-status`.
2. Separate the pre-existing dirty baseline from this task's edits. Confirm the task's edits are in scope; preserve unrelated changes. Flag unexpected generated output, secrets, diagnostics, caches and lockfile changes introduced by this task.
3. Select the smallest meaningful checks for the changed behavior. Documentation, skills and agent config use syntax, links, scoped formatting and realistic decision scenarios; no product suite is required for that scope.
4. For code changes, run targeted checks then one `npm run verify`; it excludes E2E. Add `npm run test:e2e` only under Testing Stage Gate (required for R9/R10/R12). Do not separately duplicate verify stages without a diagnostic reason. Record command, exit code and concise evidence.
5. For UI implementation or audit, inspect the real scenario at required desktop/mobile viewports, console/page errors and the approved image or Figma reference using `lifeos-ui-fidelity`. An audit does not authorize edits or full E2E.
6. Run `git diff --check` and re-read the final diff for architecture, user-data, persistence, accessibility, and scope regressions.
7. Map each acceptance criterion to direct evidence.

Use bounded observation for commands that may hang. A timeout is a failed or unresolved check, never a pass.

## Verdict rules

- `готово` only when all required current-tree checks pass and every criterion has evidence;
- `не готово` when a check fails or a known defect remains;
- `не подтверждено` when a required check could not run or evidence is stale;
- `Требуется ручная визуальная проверка` when rendered comparison is unavailable.

A successful run from this task remains evidence while its relevant code and environment are
unchanged. A new message, review or report does not require another run. An author's assertion,
old log or different code is not evidence; name any uncertainty about freshness. Report unrelated
baseline failures separately without fixing them outside scope or claiming the whole tree passed.

Continue already-authorized work after the applicable gate. Stop at an explicit stage boundary
or unresolved required check. Commit, merge, push and publication need the relevant user authority;
the skill does not grant it or require asking twice when it already exists.

## Required report

Lead with the result, then verification evidence and actual limitations. Use short Russian
paragraphs for a small patch; use `Проверка`, `Результат`, `Доказательство` in a table for multiple
gates when useful. Include blockers/manual QA only when applicable and give the scoped verdict.
