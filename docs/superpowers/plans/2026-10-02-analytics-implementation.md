# LifeOS Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved LifeOS analytics overview with real period metrics, source records, and life context.

**Architecture:** The application reads one readonly IndexedDB transaction into typed existing entities, then pure projectors build period reports and evidence. Presentation consumes a single replaceable report through PlannerServices, with its state encoded in the established hash route.

**Tech Stack:** TypeScript, React, IndexedDB, Vitest, existing planner CSS/tokens.

**Spec:** `docs/design/features/2026-10-02-analytics.md`; approved visual reference `docs/design/references/2026-10-02-analytics/` (user approval 2026-10-02).

## Global Constraints

- Keep existing stores, schema, sync format, and dependencies unchanged.
- No reads may generate recurrence, contributions, diary entries, or balance snapshots.
- Missing values remain distinct from recorded zero; no universal life score.
- Snapshot, KPI, chart, and evidence use one `asOf` and one committed read.
- Preserve all unrelated dirty-worktree edits.
- Runtime verification: targeted analytics tests, `npm run verify`, scoped browser E2E only when needed.

## Review Focus

- Reopened/deleted actions must disappear from completion and dependent contribution totals; archive remains.
- Overnight/paused/open sessions must be split by local day and capped at `asOf`, without counting manual aggregate time again.
- Current partial period must not compare future or ongoing days with complete past days.
- Late responses and cross-screen commits must never mix two snapshots on one screen.
- Empty, partial, and failed reads must display different states and keep source data untouched.

---

### Task 1: Snapshot and pure period report

**Files:** `src/application/ports/AnalyticsSnapshotReader.ts`, `src/application/analytics/*`, `src/infrastructure/persistence/IndexedDbAnalyticsSnapshotReader.ts`, corresponding targeted tests.

**Interfaces:** `AnalyticsSnapshotReader.read(): Promise<AnalyticsSnapshot>`; `GetAnalyticsOverview.execute({period,date,asOf}): Promise<AnalyticsOverview>`; `subscribe(listener): () => void` for stale notification.

- [x] Add pure tests for calendar periods, action validity, contributions, diary coverage, and time boundaries.
- [x] Implement period and metric projectors using existing domain rules and work-time/diary/walk functions.
- [x] Add fake-IndexedDB integration test proving one readonly transaction and no writes.
- [x] Implement typed snapshot reader with existing mappers and transaction completion.
- [x] Run targeted tests; resolve all failures.

### Task 2: Navigation and approved overview

**Files:** `src/presentation/planner-v2/PlannerNavigation.ts`, `PlannerWorkspace.tsx`, `analytics/*`, `analytics/analytics.css`, application composition/service interface, navigation and render tests.

**Interfaces:** route `analytics` with period/date/topic/day; overview receives `PlannerServices.analytics` and `onNavigate`.

- [x] Add route and rendering checks for overview, topic/day, and invalid/future date normalization.
- [x] Add route and sidebar/mobile-menu entry.
- [x] Implement approved KPI, graph, period controls, empty/loading/error/success, with responsive styles based on current tokens.
- [x] Run targeted tests and check keyboard and source-link behavior.

### Task 3: Evidence and life context

**Files:** same analytics modules; targeted calculation/render tests.

- [x] Add tests for evidence agreement with KPI, missing source, and balance monthly availability; check selected day and life context in the browser.
- [x] Implement time/actions/goals/state detail lists and source links using the same report.
- [x] Implement sphere time, goals, diary, walks, preparation and memory context without fabricated history or causality.
- [x] Run targeted tests.

### Task 4: Verification and visual review

- [x] Run `npm run verify` after targeted checks pass. Its second run stopped on transient Windows infrastructure cleanup; every stage subsequently passed, including the full infrastructure suite on a focused rerun.
- [x] Run scoped analytics E2E for route and user flow on desktop and mobile.
- [x] Compare the real screen with the approved desktop/mobile reference; check loading, empty state, focus, console, and rule 38. Error/retry was inspected in code but not induced in the browser.
- [x] Inspect `git diff --check`, owned diff, and `git status --short`; document remaining limitations.
