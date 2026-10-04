# Day Autopilot implementation plan

**Goal:** Add an explainable, preview-first and atomically applied schedule builder to Today.

**Architecture:** A deterministic domain planner produces time proposals from lightweight action
inputs. An application service reads LifeAction, capacity, sessions and sleep observations, then
applies accepted proposals through one JournalUnitOfWork transaction. PlannerToday renders the
workflow and asks PlannerWorkspace to refresh after a successful apply.

**Stack:** TypeScript, React, IndexedDB, Vitest, Playwright, existing planner CSS.

1. Add failing domain tests for ordering the main action, fitting around locked windows, reserve,
   unknown estimates, deferral and rebuild behavior. Implement the pure planner.
2. Add failing application tests for preview composition, stale versions and active-session guards.
   Implement DayAutopilotService and its public contract.
3. Add failing IndexedDB coverage proving an active session or concurrent action edit aborts the
   whole batch. Extend JournalUnitOfWork with the narrow transactional guard.
4. Add component tests for ready, preview, empty, error and apply states. Implement the Today card,
   wire it through PlannerServices/composition, and refresh Today after apply.
5. Add local responsive styles using existing effective tokens and current page archetype.
6. Run targeted tests, `test:fast` for shared application/domain changes, one `verify`, scoped Today
   E2E, then desktop/mobile visual, keyboard and console QA. Inspect diff/status before completion.
