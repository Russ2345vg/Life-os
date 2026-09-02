# REL-01 Freeze LifeOS v1.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the complete current LifeOS working tree as the verified, committed, annotated `v1.0.0` release checkpoint without adding product behavior.

**Architecture:** Keep npm package metadata as the single application-version source and synchronize `package-lock.json` with it. Treat all existing tracked modifications and project-shaped untracked files as user-owned release content; add only release metadata and documentation, then prove the exact tree through the R12 full gate before committing and tagging.

**Tech Stack:** Git, npm lockfile v3, React 19, TypeScript 6, Vite 8, Vitest 4, Playwright 1.62, ESLint 10, Prettier 3.

**Spec:** User-supplied `REL-01 — Freeze LifeOS v1.0.0` request attached to this Codex task.

## Global Constraints

- Release version is exactly `1.0.0`; annotated Git tag is exactly `v1.0.0`.
- Preserve every current user change; do not discard, reset, clean, checkout, revert, or rewrite history.
- Do not add Tauri, Android, installers, auto-update, dependencies, architecture refactors, design changes, or user-facing features.
- Do not push to a remote.
- Only confirmed release blockers may receive minimal repairs, each with focused regression evidence.
- R12 verification is `npm run verify` followed by `npm run test:e2e`, equivalently `npm run verify:full`.

---

### Task 1: Freeze and classify the current release scope

**Files:**

- Inspect: repository root, Git index, tracked working tree, untracked project files, `.gitignore`, `package.json`, `package-lock.json`, `docs/codex/TEST_MATRIX.md`
- Create: `docs/superpowers/plans/2026-09-02-rel-01-freeze-lifeos-v1.0.0.md`

**Interfaces:**

- Consumes: current Git branch and all user-owned working-tree changes.
- Produces: an evidence-backed allowlist consisting of project source, tests, docs, configuration, and required image assets; ignored caches/build/test output remain outside Git.

- [ ] **Step 1: Confirm the active worktree and branch**

  Run `git rev-parse --show-toplevel`, `git branch --show-current`, and `git status --short --branch`; require root `D:/LifeOS-App` and preserve the reported branch.

- [ ] **Step 2: Classify every current path**

  Run `git diff --stat`, `git diff --name-status`, `git diff --cached --stat`, `git diff --cached --name-status`, and `git status --porcelain=v1 --untracked-files=all`; record modified, untracked, staged, and deleted counts.

- [ ] **Step 3: Exclude unsafe or generated content**

  Inspect `.gitignore`; search tracked and untracked file names/content for environment files, private keys, credential/token assignments, logs, temporary files, caches, generated test reports, build output, and files larger than 5 MiB. Keep ignored files on disk and outside Git.

- [ ] **Step 4: Confirm the release allowlist**

  Accept only project files under `src`, `tests`, `docs`, `public`, repository configuration, and existing tracked release assets. Stop before staging if a secret or unexplained artifact remains.

### Task 2: Set the single application version and create release notes

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `docs/releases/v1.0.0.md`

**Interfaces:**

- Consumes: npm package name `lifeos-app`, current source/features, current date `2026-09-02`, and the verified release scope from Task 1.
- Produces: npm root package version `1.0.0` in both metadata files and factual LifeOS v1.0.0 release documentation.

- [ ] **Step 1: Update npm package metadata**

  Change only the root `"version": "0.1.0"` in `package.json` and the two root-package occurrences in `package-lock.json` to `"version": "1.0.0"`; do not change dependencies or scripts.

- [ ] **Step 2: Verify version consistency**

  Run a read-only PowerShell JSON check that asserts `package.json.version`, `package-lock.json.version`, and `package-lock.json.packages[''].version` all equal `1.0.0`.

- [ ] **Step 3: Write factual release notes**

  Create `docs/releases/v1.0.0.md` with release date, purpose, implemented sections and workflows derived from the current source/tests, design-system state, actual limitations, verification commands/results, release commit recording procedure, and tag `v1.0.0`.

- [ ] **Step 4: Check documentation formatting**

  Run `npm run format:check`; if only the two new documentation files fail, format precisely those files with the repository Prettier configuration and rerun the check.

### Task 3: Execute the R12 release gate and repair only blockers

**Files:**

- Inspect: all release files on the current tree
- Modify only if required: the minimum file set proven by a failing check and its nearest regression test

**Interfaces:**

- Consumes: the complete candidate v1.0.0 working tree.
- Produces: fresh bounded evidence for typecheck, lint, unit/integration tests, test-infrastructure, alpha, build, format, whitespace, and full browser E2E.

- [ ] **Step 1: Run the canonical fast gate**

  Run `npm run verify`; require exit code 0 and record each stage plus the reported test-file and test counts.

- [ ] **Step 2: Run the required R12 browser gate**

  Run `npm run test:e2e`; require exit code 0, record passed/skipped/failed counts, and confirm managed teardown releases port 4173.

- [ ] **Step 3: Diagnose a failure before changing code**

  If a check fails, load `lifeos-bug-repair` and `superpowers:systematic-debugging`, reproduce the smallest failing target with the bounded command from `docs/codex/TEST_MATRIX.md`, identify root cause, add or confirm regression coverage, apply the minimum fix, rerun the target, and then rerun `npm run verify` plus `npm run test:e2e`.

- [ ] **Step 4: Recheck Git hygiene**

  Run `git diff --check`, inspect `git diff`, `git diff --cached`, `git status --short`, and confirm no secret, cache, report, build output, or unrelated new file entered the release set.

### Task 4: Create and document the release commit

**Files:**

- Stage: every allowlisted current release file
- Modify after the release commit: `docs/releases/v1.0.0.md`

**Interfaces:**

- Consumes: the fully verified release candidate and Git author configuration.
- Produces: a primary commit named `release: LifeOS v1.0.0`, its immutable full SHA, and a documentation follow-up commit if recording that SHA changes the release notes.

- [ ] **Step 1: Stage the allowlisted release tree**

  Run `git add --all`, then inspect `git status --short`, `git diff --cached --stat`, `git diff --cached --name-status`, and `git diff --cached --check`. Abort the commit if any ignored/generated/secret file or unexpected deletion appears.

- [ ] **Step 2: Create the primary release commit**

  Run `git commit -m "release: LifeOS v1.0.0"`, then capture the full SHA with `git rev-parse HEAD` and short SHA with `git rev-parse --short HEAD`.

- [ ] **Step 3: Record the primary release SHA**

  Replace the release-notes commit field with the captured immutable primary SHA, stage only `docs/releases/v1.0.0.md`, confirm its cached diff, and create `docs: record LifeOS v1.0.0 release commit`.

- [ ] **Step 4: Verify the final release commit**

  Run `npm run verify` and `npm run test:e2e` on the final commit tree because the annotated tag must point to freshly verified content; record the final tag-target SHA separately from the primary release SHA documented in the notes.

### Task 5: Tag and inspect the immutable release point

**Files:**

- Create Git ref: annotated tag `v1.0.0`

**Interfaces:**

- Consumes: final verified release commit.
- Produces: local annotated tag `v1.0.0` pointing exactly to that commit and a final evidence report; no remote state changes.

- [ ] **Step 1: Confirm tag name is free and tree is clean**

  Run `git tag --list v1.0.0` and `git status --short`; require no existing tag and no remaining release changes.

- [ ] **Step 2: Create the annotated tag**

  Run `git tag -a v1.0.0 -m "LifeOS v1.0.0"` without pushing.

- [ ] **Step 3: Verify tag target and final repository state**

  Run `git show --no-patch --format=fuller v1.0.0`, `git rev-list -n 1 v1.0.0`, `git status --short --branch`, `git log --oneline -5`, and `git show --stat --oneline v1.0.0`.

- [ ] **Step 4: Produce the REL-01 report and stop**

  Report PASS only if every gate and tag assertion passed; include branch, primary release SHA, final tag-target SHA, content summary, exact test counts, file summary, release-notes path, final status, and real limitations. End with `REL-01 завершён. Готов к REL-02 — Desktop Foundation / Tauri.` and do not begin REL-02.
