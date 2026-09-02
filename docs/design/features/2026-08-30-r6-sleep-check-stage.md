# R6 — Sleep Check Stage («Сон»)

## Status

- Design: `APPROVED`
- Implementation: `APPROVED`
- Visual review: `APPROVED`
- Lock: `LOCKED`

The user explicitly approved moving from R5 to R6 and supplied the binding architecture, UX,
persistence, accessibility, and verification contract on 2026-08-30. The completed implementation
and visual result were explicitly approved by the user on 2026-08-31. R6 is approved and locked;
R7 has not started.

## Scope classification

R6 is a new user stage and guided flow inside the existing Evening Journey. It extends the existing
`EveningCycle`, its application commands, additive persistence record, presentation model, and
Evening Command Center. It does not create a second evening engine, route, repository, IndexedDB
store, analytics subsystem, or Recovery flow.

## Feature and user goal

After Relaxation, the user records how calm and sleep-ready they feel, answers three short questions
one at a time, performs at most one short corrective action when needed, and releases the evening.
The final result advances through the existing internal Shutdown stage.

```text
PREPARING → RELAXING → SLEEP_CHECK → SHUTDOWN → COMPLETED
```

User-facing journey:

```text
Сегодня → Осмысление → Завтра → Среда → Расслабление → Сон → Завершение → Восстановление
```

`SLEEP_CHECK` is a real persisted `EveningCycle` state. The user-facing label is «Сон».
The existing `SHUTDOWN` state and its behavior are not renamed or rewritten.

## Design contract

```text
FEATURE
→ Sleep Check stage inside the existing Evening Journey

USER GOAL
→ Confirm readiness for sleep, close one remaining issue if needed, and release the evening

EXISTING LOGIC
→ EveningCycle remains the only authoritative state machine
→ Focused application commands mutate it through the existing EveningCycleRepository and CAS
→ Relaxation completion enters SLEEP_CHECK; Sleep Check completion enters existing SHUTDOWN

PAGE/COMPONENT ARCHETYPE
→ Existing Deep Focus guided flow; one central question, not one URL per question

SECTION COLOR
→ Routine amber atmosphere; current/primary is gold; completed is green; error is red
→ No permanent violet or decorative blue accent

ATMOSPHERIC MOTIF
→ Deep graphite, restrained night/moon semantics, less gold and less visual noise than Relaxation

MAIN VISUAL CENTER
→ One active question and two large answer controls

COMPONENTS TO REUSE
→ Evening Command Center, journey navigation, EveningVisualIcon, shared button/focus language,
  history shell, and LifeOS tokens
→ One focused reusable SubjectiveRatingScale is allowed because no equivalent control exists

MOBILE BEHAVIOR
→ progress → central question → answers → corrective action/capture → CTA
→ one column, touch targets at least 44×44 px, no horizontal scroll

APPROVED REFERENCE
→ NO dedicated pixel reference; approved Deep Focus and established R5/Shutdown language apply
→ Pixel-perfect fidelity must not be claimed

TEST SCOPE
→ Domain invariants, CAS/idempotency, additive persistence/legacy, refresh recovery, presentation,
  targeted desktop/mobile flow, keyboard/focus/ARIA/reduced motion, console, and npm run verify
```

## Existing architecture to preserve

- `EveningCycle` remains the single state owner for Evening Journey stage and embedded R6 facts.
- `RelaxationSnapshot` remains the owner of R5 drink, hygiene, practice, and screen-free facts.
- `EveningCycleRepository` remains the only R6 persistence port; no R6 store or repository is added.
- Application services remain the mutation boundary. React owns only drafts and operation state.
- `PreparationPlan`, Reflection, Tomorrow, Shutdown, Day completion, and Recovery keep their owners.
- Completed history reads saved facts and never initializes or mutates a Sleep Check.
- All commands use the saved cycle `dateKey`; timestamps may cross midnight without changing identity.

## Domain model

### Subjective ratings

The closed rating type is `SubjectiveRating = 1 | 2 | 3 | 4 | 5`, where 1 is very low and 5 is
very high. Ratings are recorded atomically in two typed moments:

```text
BEFORE_RELAXATION
AFTER_RELAXATION
```

The persisted facts are:

```text
calmBefore
sleepReadinessBefore
calmAfter
sleepReadinessAfter
```

Both BEFORE ratings are collected before the active R5 controls are exposed. Both AFTER ratings are
collected after `RELAXING → SLEEP_CHECK` and before the first Sleep Check question. A pair is saved
in one aggregate mutation. Repeating the same pair is idempotent; conflicting replacement after a
successful save is rejected. Missing legacy values remain missing and are never fabricated.

### Fixed questions and answer semantics

The question identifiers and order are closed and typed:

1. `CALM_MIND`: «Голова спокойна?» — `NO` is problematic.
2. `HOLDING_THOUGHT`: «Есть что-то, что ещё держишь в голове?» — `YES` is problematic.
3. `READY_FOR_SLEEP`: «Готов переходить ко сну?» — `NO` is problematic.

Answers are typed `YES | NO`. The aggregate enforces the fixed order, exactly one initial answer per
question, and at most one retry for the question that received the corrective action. Repeating the
same command is a no-op; submitting a conflicting value for an already saved initial or retry answer
is rejected.

### Corrective action

R6 permits at most one corrective action for the whole Sleep Check. The first problematic initial
answer can receive its fixed action:

```text
CALM_MIND        → BREATHING_2_MIN
HOLDING_THOUGHT  → CAPTURE_THOUGHT
READY_FOR_SLEEP  → RELAX_5_MORE_MIN
```

The action is explicitly selected, tied to that question, completed once, and followed by exactly
one retry of that same question. Later problematic answers remain valid saved facts and do not create
a second action. A negative retried answer never blocks completion.

`CAPTURE_THOUGHT` requires a trimmed non-empty string of at most 280 characters with the prompt
«Что оставить на завтра?». The string is stored only inside the corrective-action result. R6 does
not create or call a Diary/Inbox engine. Other actions reject captured text. Repeating selection or
completion with the identical payload is idempotent; a conflicting retry cannot duplicate or replace
the saved action.

### Embedded snapshot and lifecycle

`SleepCheckSnapshot` is embedded in `EveningCycle` and stores:

- the four ratings and their two saved timestamps;
- ordered initial answers;
- the optional single corrective action, completion timestamp, and optional captured thought;
- the optional single retried answer;
- `startedAt`, `completedAt`, `createdAt`, and `updatedAt`.

The snapshot is created in `RELAXING` when BEFORE ratings are saved. `completeRelaxation` requires a
ready R5 snapshot and saved BEFORE ratings, finalizes elapsed screen-free state, starts the same R6
snapshot, and transitions to `SLEEP_CHECK` in one aggregate version. AFTER ratings and question
commands are valid only in `SLEEP_CHECK`.

The summary becomes available when AFTER ratings and all three initial answers exist and any chosen
corrective action is completed and retried once. `completeSleepCheck` records `completedAt` and
transitions `SLEEP_CHECK → SHUTDOWN` in one version. A completed snapshot is immutable through
current-flow and history paths.

### Legacy compatibility

- Missing `sleepCheck` means R6 did not exist for that saved cycle.
- Legacy `SHUTDOWN` and `COMPLETED` cycles may have no R6 snapshot and remain readable.
- New `SLEEP_CHECK` records must contain a started snapshot.
- A `SHUTDOWN`/`COMPLETED` record with R6 facts must contain a completed snapshot.
- The controlled completed-day recovery bridge may pass to `SHUTDOWN` without R6 facts; it must not
  manufacture ratings, answers, actions, or timestamps.
- An active pre-R6 `RELAXING` record remains usable: the UI requests real BEFORE ratings before the
  next R5 action/continuation instead of inventing values.

## Application commands and concurrency

A focused `SleepCheckApplicationService` uses the existing repository, injected clock,
`cloneEveningCycle`, and the same bounded two-attempt optimistic CAS pattern as R5. Its public
operations are equivalent to:

```text
getStored(dateKey)
setBeforeRatings(dateKey, calm, sleepReadiness)
setAfterRatings(dateKey, calm, sleepReadiness)
answerQuestion(dateKey, questionId, answer)
chooseCorrectiveAction(dateKey, questionId, action)
completeCorrectiveAction(dateKey, questionId, capturedThought?)
retryQuestion(dateKey, questionId, answer)
complete(dateKey)
```

Exact names may follow project conventions, but each operation is typed. After one CAS miss the
service reloads and reapplies the intent. After the second miss it returns a scoped stale/concurrent
error. Raw persistence errors are not hidden. A failed answer retains all earlier saved answers. A
failed corrective-action retry cannot create a second instance.

`RelaxationApplicationService.complete` remains the R5 continuation command but now returns a cycle
in `SLEEP_CHECK`. Existing Day completion remains legal only in `SHUTDOWN`; R6 cannot be bypassed by
the ordinary current-cycle flow.

## Additive persistence

`EveningCycleRecord` gains one optional `sleepCheck` object containing only domain facts. The mapper
strictly validates closed question/action/answer values, ratings, timestamps, ordering, and snapshot
invariants. Missing data maps to `null`.

`schemaVersion: 1`, IndexedDB database version 19, current indexes, and the existing `eveningCycles`
store remain unchanged. No database-opening rewrite occurs. This is additive record compatibility,
not R9 migration work. A destructive migration discovered during implementation is a hard stop.

The generic analytics/history projection is not expanded. Current and completed Evening journey
history reads the exact stored `EveningCycle` as R5 already does.

## Presentation and UI states

### BEFORE ratings in Relaxation

On first R5 entry, two compact 1–5 scales appear before the active Relaxation controls:

- «Насколько спокойна голова?»
- «Насколько ты готов ко сну?»

Each scale is a keyboard-operable radio group. Every option shows its number, exposes checked state,
has a selected treatment that is not color-only, and has a minimum 44×44 px target. The pair has one
save/continue action. Loading, saving, retryable error, and saved success are explicit.

### Sleep Deep Focus scene

The active stage is a single central container:

```text
СОН
Проверка перед сном
2 / 3

Есть что-то,
что ещё держишь
в голове?

[ Да ] [ Нет ]
```

After entering the stage, the same container first captures AFTER ratings, then shows exactly one
question at a time. A short token-based fade/position transition may replace content; reduced motion
removes it. Three large question cards or separate URLs are forbidden.

For the selected corrective action, the central container shows one short instruction and a single
completion control. Thought capture uses a visible label, `maxLength=280`, and a confirmation button
that remains reachable when the mobile keyboard is open. The retry then occupies the same question
container once.

When ready, the scene shows:

```text
Вечер можно отпустить

Спокойствие       4/5
Готовность ко сну 5/5

Завершить вечер →
```

The CTA runs `completeSleepCheck`, then the existing Shutdown scene becomes current.

### Required UI states

- loading with the final geometry;
- saving/disabled per in-flight operation;
- retryable read or persistence error without resetting saved facts;
- stale optimistic version with reload/retry guidance;
- AFTER-rating gate;
- active question, corrective action, capture, retry, and ready summary;
- read-only completed history;
- legacy history with no fabricated R6 data.

History stays compact: before/after rating pairs, completion statement, and whether one corrective
action was completed. It is not an analytics page.

## Mobile, accessibility, and visual language

- Validate 1600×900 and 1280×720 desktop plus 390×844 and 360×800 mobile.
- Mobile uses one column and no two-column form or horizontal scroll.
- Answer and rating targets are at least 44×44 px.
- Native button/radio semantics or equivalent ARIA expose selection, progress, labels, and disabled
  state; meaning never depends only on color.
- Focus moves to the next question heading, corrective instruction, error summary, or final summary.
- Capture has a persistent label and keyboard-safe confirmation.
- Motion respects `prefers-reduced-motion`.
- Deep graphite dominates. Gold is reserved for current selection and the primary CTA; green marks
  completed/confirmed facts; red marks real error. The scene has one visual center and few surfaces.

## Explicit non-goals

- no fatigue detection, wearables, sleep tracking, actual sleep time, sleep analytics, correlations,
  next-day recommendations, multiple notifications, or automatic required-core changes;
- no R7 short/skip architecture, R8 settings, R9 migration, R11 analytics, or Recovery rewrite;
- no second Evening, Diary, Inbox, or recommendation engine;
- no full-stage Sleep Check skip and no negative-answer completion block;
- no dependency or stack change.

## Verification strategy

```text
targeted failing R6 tests
→ minimal implementation
→ targeted R6 tests
→ targeted R6 desktop/mobile browser tests
→ npm run verify
→ STOP
```

The full Playwright suite is not automatic. Only the targeted R6 spec is run. If final discovery
requires changing shared routing/navigation resolution beyond the scoped Evening state mapping, the
technical reason must be stated before considering a full E2E run.

Required evidence covers domain invariants, application CAS/idempotency, persistence round-trip and
legacy, refresh after answer/action/retry, completed history, midnight identity, one active question,
progress 1/3–3/3, ratings, corrective action, loading/error/ready, desktop/mobile flow, keyboard,
focus, ARIA, reduced motion, touch size, overflow, and console.

## Definition of Done

- [x] R3–R5 aggregates, services, persistence, presentation, tests, and current R5 implementation audited.
- [x] R5 approval and lock recorded without R5 production changes for that status update.
- [x] R6 design contract defined and approved by the explicit user request.
- [x] Embedded EveningCycle architecture selected; second engine/repository rejected.
- [x] Additive schema-v1 persistence selected; no destructive migration required by design.
- [x] Failing tests recorded before every production behavior.
- [x] Ratings, questions, one corrective action, retry, completion, and transitions implemented.
- [x] Legacy records and partial refresh verified without fabricated facts.
- [x] Targeted R6 tests and targeted desktop/mobile browser flow pass.
- [x] `npm run verify`, Rule 38 review, console review, and final independent review pass.
- [x] Final handoff prepared as `R6 COMPLETE — WAITING FOR USER APPROVAL` without starting R7.
