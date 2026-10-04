---
name: lifeos-quality-gate
description: Use when finishing a LifeOS patch or explicitly assessing its readiness from verification evidence.
---

# LifeOS quality gate

Assess this task's patch from evidence, separately from pre-existing dirty changes.
Apply `AGENTS.md` Testing Stage Gate and `docs/codex/TEST_MATRIX.md`; this skill does not add
another test pass or permission checkpoint.

## Gate sequence

1. Read the acceptance criteria and inspect `git status --short`, `git diff --stat`, and `git diff --name-status`.
2. Separate the pre-existing dirty baseline from this task's edits. Confirm the task's edits are in scope; preserve unrelated changes. Flag unexpected generated output, secrets, diagnostics, caches and lockfile changes introduced by this task.
3. Map acceptance criteria to existing fresh evidence and identify only the missing checks.
4. Run those checks according to the matrix; record command, exit code and checked scope.
   Documentation/agent-config changes use syntax, links, formatting and decision scenarios.
   Build/test scripts, runtime config, dependencies and CI do not qualify for that exception.
5. For visual changes or UI audits, use rendered desktop/mobile and console evidence from
   `lifeos-ui-fidelity`. An audit does not authorize edits or full E2E.
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
