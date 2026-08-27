# WALK-09 — Decision integration

## Approved scope

The user-requested flow is Decision → reflection preparation → active Walk → existing
completion/outcome → persisted Reentry → the original Decision. WALK-01–08 is the baseline.
Work only in `D:\LifeOS-App`; no commits/pushes, new dependencies, WALK-10 or old source trees.

## Existing contracts and ownership

- Decision owns its status, version, evidence and actual result. Walk integration has no
  Decision write command and never creates Actions or changes Goal/Project.
- Walk remains the only execution aggregate. Its `linkedEntity` identifies the Decision;
  `returnContext.origin = decision` and `returnContext.entity` own the exact return id.
- The UI's reflection mode is existing `intent = reflection`; `mode` remains the existing
  timer/stopwatch execution setting. Use the existing `decision` reflection template by default.
- Outcome remains Walk's `afterState`, `impact`, `result` and Reentry. Do not copy it into Decision.
- Existing IndexedDB mappers already persist all necessary fields: no schema/migration changes.

## Minimal implementation

`StartDecisionWalk` reads the real Decision, rejects missing/deleted sources, uses today's
date and delegates `CreateWalk` → `StartWalk`. The existing active-walk/CAS guard remains
authoritative. A failed CAS can leave a planned Walk, as in the existing generic flow;
startup is not claimed to be atomic. No unconditional cleanup is allowed.

`GetLatestWalkOutcomeForDecision` reads existing `WalkRepository.findAll()`, filters completed
linked Walks with a saved outcome and sorts by `reentry.preparedAt`, then id. Subsequent
Reentry/photo edits must not change which outcome is latest.

One compact shared Decision section exposes the secondary “Обдумать на прогулке” action and
the latest result. Wire the same section into Today and Decisions through their existing
shared details panel. Preparation and active Walk show only the Decision title and question.
Preserve an entered question; supply a decision-specific default only when blank. The default
is never written as a result.

The existing ApplicationShell section navigation plus DecisionsPage.initialDecisionId is
enough. Add typed transient launch/return requests, not a new routing architecture. Decision
availability is read again on Reentry and at primary activation; unavailable sources show
“Связанное решение больше недоступно” and “Перейти в Решения”. Draft/changed-date Decisions
open using their current planned date or the current selected date when unplanned.

For a valid Decision-origin ReturnContext, Reentry retains the original Decision for every
impact (including worse), before the generic recovery rule. Non-Decision policies, especially
Routine and free/recovery Walks, remain unchanged. Reentry is persisted before navigation.

## Verification

RED → GREEN for launch/context, source safety, duplicate active Walk, latest result ordering,
preparation/active presentation, return policy and actual UI navigation. Composition tests
reopen IndexedDB while active and pending, comparing full Decision records and unrelated
execution collections. Run scoped Decision/Walk/Routine/persistence regression, TypeScript,
lint, build, changed-file formatting, whitespace checks and bounded Playwright smoke.

Browser QA: existing LifeOS graphite/gold/green tokens; desktop and 360–430 px mobile,
keyboard/focus, touch targets, no overflow or console errors. Capture action, preparation,
active, completion, Reentry, returned result and mobile. No pixel-perfect Figma claim: an
approved Figma node was not supplied. Do not run the full Vitest suite automatically.
