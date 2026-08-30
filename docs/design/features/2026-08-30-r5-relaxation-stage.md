# R5 — Relaxation Stage («Расслабление»)

## Status

- Design: `APPROVED IN CHAT`
- Written specification: `PENDING USER REVIEW`
- Implementation: `NOT STARTED`
- Visual review: `NOT STARTED`
- Lock: `UNLOCKED`

The architecture, readiness gate, persistent default-practice behavior, screen-free durations, and
UI contract were accepted by the user on 2026-08-30. This document must be reviewed by the user
before implementation planning begins.

## Scope classification

R5 is a new stage inside the existing Evening Journey. It extends the existing `EveningCycle`
state machine, application commands, additive persistence record, presentation model, and Evening
Command Center UI. It does not create a new section, route, repository, IndexedDB store, settings
subsystem, or parallel source of evening state.

R5 ends when the Relaxation stage can transition to the existing Shutdown stage. Sleep Check,
before/after ratings, and all other R6 behavior are explicit non-goals.

## Feature

Insert a separate Relaxation stage between Environment and Shutdown:

```text
PREPARING → RELAXING → SHUTDOWN
```

The stage guides a transition from work into a calm state through four actions:

```text
напиток → гигиена → без экранов → расслабляющая практика
```

This order is recommended, not enforced. All four actions remain available throughout the active
stage, and the user may complete them in another sequence.

## User goal

Before ending the day, deliberately leave the active working state and enter a calmer state without
being forced into a rigid sequence or an obligatory timer.

## Design contract

```text
FEATURE
→ Separate Relaxation stage between Environment and Shutdown

USER GOAL
→ Transition from working mode into a calm state without a rigid action order

EXISTING LOGIC
→ EveningCycle remains the authoritative state and state machine
→ Application commands remain the mutation boundary and use optimistic CAS
→ R4 Environment completion or allowed emergency skip enters RELAXING

PAGE/COMPONENT ARCHETYPE
→ Deep Focus guided flow inside the existing Evening Command Center
→ Recommended order is visible, while every action remains independently available

SECTION COLOR
→ Routine amber atmosphere
→ current/primary is gold; completed is green; skipped is explicit neutral; error is red

ATMOSPHERIC MOTIF
→ Existing Evening/Routine graphite atmosphere with restrained warm rhythmic lines fading into calm

MAIN VISUAL CENTER
→ Selected relaxation practice, its duration, and its optional timer

COMPONENTS TO REUSE
→ EveningCommandCenter and existing journey navigation
→ EveningVisualIcon, button hierarchy, status language, focus treatment, and LifeOS tokens

MOBILE BEHAVIOR
→ Status, drink/hygiene, screen-free, practice, then a full-width continuation CTA
→ Touch targets at least 44×44 px and no unnecessary horizontal scrolling

APPROVED REFERENCE
→ NO dedicated R5 visual reference is required
→ The approved Deep Focus archetype and established R4/final-scene visual language are authoritative
→ Pixel-perfect fidelity must not be claimed without a dedicated rendered reference

TEST SCOPE
→ Domain transitions and invariants, application commands, additive mapper/repository compatibility,
  persistence and refresh, history, modes, optional timer, manual completion, conscious screen-free
  skip, saved default practice, desktop/mobile browser QA, accessibility, and browser console
```

## Existing architecture to preserve

- `EveningCycle` remains the only authoritative Evening Journey state machine.
- `EveningCycleApplicationService` and focused application commands remain the mutation boundary.
- `EveningCycleRepository` remains the only persistence port for R5 state.
- `EveningCycleRecord` remains an additive schema-version-1 record. R5 does not create a new store
  or bump the IndexedDB database version.
- `PreparationPlan` and `PreparationService` remain the only owners of R4 Environment data.
- Environment completion remains atomic through the existing `PreparationUnitOfWork`; its target
  state changes from `SHUTDOWN` to `RELAXING`.
- UI state may hold drafts, the current display time, loading state, or retry state, but React does
  not mutate the domain object or persistence directly.
- Timer display is derived from persisted timestamps. No per-second writes are allowed.
- Completed Evening history reads stored facts and does not manufacture R5 state for legacy cycles.

## Alternatives considered

### Selected: embed the R5 snapshot in `EveningCycle`

Add the `RELAXING` state and an optional immutable relaxation snapshot to `EveningCycle`. This is
consistent with the existing embedded Reflection data, keeps transition invariants and versioning
in one aggregate, and avoids a new store or repository. The latest stored default-practice value is
copied into a new R5 snapshot when the stage is initialized.

### Rejected: separate `RelaxationPlan` aggregate and repository

A separate plan would isolate the data but introduce a new store, a second optimistic version,
cross-aggregate transition coordination, additional history reconciliation, and a database upgrade
for a compact one-evening snapshot.

### Rejected: global settings subsystem plus an evening session

A general settings subsystem would be the cleanest future home for many preferences, but LifeOS
does not currently have that source. Creating it only for one default practice would expand R5 into
a separate platform capability and still require synchronization with the active evening session.

## Domain model

### Evening state

Add `RELAXING` to `EveningCycleState` between `PREPARING` and `SHUTDOWN`.

- normal Environment completion transitions `PREPARING → RELAXING`;
- the existing allowed Preparation skip in a special mode transitions `PREPARING → RELAXING` and
  keeps the existing skip record for `PREPARING`;
- only a ready R5 snapshot may transition `RELAXING → SHUTDOWN`;
- repeated commands with an already persisted outcome are idempotent where the intended outcome is
  identical;
- a conflicting transition or conflicting terminal outcome returns a domain error.

### Relaxation practices

The canonical practice catalog is a closed typed set:

```text
READING
BREATHING
STRETCHING
MEDITATION
CALM_MUSIC
```

User-facing labels are:

- чтение;
- дыхание;
- растяжка;
- медитация;
- спокойная музыка.

The initial built-in default is `READING`.

### Persistent default and current-evening choice

The relaxation snapshot stores both:

- the default practice effective for future evenings;
- the selected practice for this evening.

When a new R5 snapshot is initialized, the application reads the latest prior cycle that contains a
valid relaxation default. If none exists, it uses `READING`. A current-evening replacement changes
only `selectedPractice`. Choosing «Сделать практикой по умолчанию» changes both the selected
practice and the default copied forward to later evenings.

The latest-default lookup must:

- consider only cycles strictly before the current cycle date;
- select deterministically by date;
- ignore legacy cycles without R5 data;
- never copy current-evening completion, timer, or screen-free outcomes;
- keep the built-in default when no prior value exists;
- avoid creating a second preference source.

### Duration

Relaxation practice duration is an integer from 5 through 20 minutes. The UI offers presets 5, 10,
15, and 20 minutes and permits a manual integer value within the same range.

- `NORMAL` initializes at 15 minutes;
- `QUICK` and `EMERGENCY` initialize at 5 minutes;
- the user may change the value within 5–20 minutes in every mode;
- changing practice or duration while the practice timer is active clears only the practice timer;
- changing practice or duration after practice completion is rejected.

### Drink and hygiene

The snapshot stores nullable completion timestamps for drink and hygiene. Each action can be
completed independently and in any order. Repeating the same completion command is idempotent and
must not rewrite its original timestamp.

R5 does not add custom drink types, quantities, hygiene sub-checklists, skip reasons, undo, or
analytics for these actions.

### Optional practice timer

The practice timer stores only its start timestamp. Its target is the saved practice duration.

- starting the timer is optional;
- starting an already active timer is idempotent;
- remaining time is derived from `startedAt`, the saved duration, and the current clock;
- reaching zero does not complete the practice;
- `Отметить выполненным` is available without starting the timer and while the timer is active;
- manual completion stores `practiceCompletedAt` and stops the active timer for presentation;
- completion never occurs merely because the UI interval fired;
- refresh reconstructs the same elapsed/remaining state from persisted facts.

### Screen-free window

The screen-free action stores a typed state and timestamps:

```text
PENDING
ACTIVE
SKIPPED
COMPLETED
```

It also stores the selected duration:

- standard window: 25 minutes;
- shortened window: 10 minutes.

Behavior:

- `NORMAL` initializes with 25 minutes;
- `QUICK` and `EMERGENCY` initialize with 10 minutes;
- `Начать` stores `startedAt` and enters `ACTIVE`;
- `Сократить` changes the total window to 10 minutes before or after starting;
- shortening an active standard window keeps the original `startedAt`;
- if at least 10 minutes have already elapsed, shortening makes the window eligible for completion;
- `Пропустить сегодня` stores `SKIPPED` and `skippedAt` without marking success;
- a skip is conscious, persisted, visible in history, and non-blocking;
- an active window is treated as elapsed when `now >= startedAt + duration`;
- pressing the final R5 continuation command persists `COMPLETED` and `completedAt` when the saved
  window has elapsed;
- refresh reconstructs active/elapsed state without a per-second persistence write.

Skipping after a completed screen-free window, restarting a skipped window, or expanding a
shortened window is outside R5.

### Readiness

R5 is ready only when all of the following are true:

- drink has a completion timestamp;
- hygiene has a completion timestamp;
- practice has a completion timestamp;
- screen-free is already `SKIPPED`, or its active saved window has elapsed.

The sequence in which these facts were created is irrelevant. A running practice timer does not
block manual practice completion. An active but not elapsed screen-free window blocks the
transition. The final command atomically records an elapsed screen-free window as `COMPLETED` and
transitions `RELAXING → SHUTDOWN` in the same `EveningCycle` optimistic save.

## Application flow

R5 extends the existing evening-cycle application boundary; it does not introduce an engine or a
second repository.

```text
enterRelaxation(cycleDate)
→ choosePractice(cycleDate, practice, persistAsDefault)
→ setPracticeDuration(cycleDate, minutes)
→ completeDrink(cycleDate)
→ completeHygiene(cycleDate)
→ startPracticeTimer(cycleDate)
→ completePractice(cycleDate)
→ startScreenFree(cycleDate)
→ shortenScreenFree(cycleDate)
→ skipScreenFree(cycleDate)
→ completeRelaxation(cycleDate)
```

`enterRelaxation` is normally reached through Environment completion. It initializes the optional
relaxation snapshot exactly once, using the latest prior default and the current mode's durations.
Opening or refreshing an already initialized R5 must return the saved snapshot unchanged.

Every mutation:

- loads the current cycle by date;
- clones and validates the aggregate;
- uses the injected application `Clock`;
- writes through `saveIfVersionMatches`;
- performs at most the existing bounded optimistic retry behavior;
- returns the saved current cycle;
- produces a user-facing recoverable error on persistence or concurrency failure.

No command may update a completed cycle through the current-R5 path.

## Evening mode behavior

### Normal

- full R5 remains required;
- initial practice duration is 15 minutes;
- initial screen-free duration is 25 minutes;
- all practice and duration controls remain available.

### Quick

- R5 is not silently skipped;
- initial practice duration is 5 minutes;
- initial screen-free duration is 10 minutes;
- the user may choose another practice or duration;
- the same explicit readiness gate applies.

### Emergency

- an allowed R4 Environment skip enters R5 and remains recorded as an R4 skip;
- initial practice duration is 5 minutes;
- initial screen-free duration is 10 minutes;
- screen-free may be consciously skipped;
- R5 itself has no whole-stage skip command;
- drink, hygiene, and practice still require explicit completion.

Switching an Evening mode after the R5 snapshot exists does not silently rewrite its saved
practice, duration, timers, or screen-free decision. Explicit R5 commands remain the only way to
change them.

## Persistence and backward compatibility

`EveningCycleRecord` gains optional additive relaxation fields. Existing record schema version 1
and IndexedDB database version 19 remain unchanged.

The mapper must:

- round-trip every R5 practice, duration, timer, completion, screen-free state, timestamp, and
  persistent default value;
- interpret a missing relaxation field as a legacy cycle without R5 facts;
- reject malformed practice values, non-integer/out-of-range durations, invalid timestamp/state
  combinations, and incomplete active states;
- keep legacy pre-R5 state values readable;
- avoid rewriting existing records during database opening;
- preserve exact R4/R3/reflection/open-loop data while adding R5 fields.

Historical pre-R5 cycles do not display fabricated drink, hygiene, practice, timer, or screen-free
facts. A current legacy cycle in the `PREPARING` state initializes R5 only after it legitimately
completes or skips R4. A persisted legacy `SHUTDOWN` or `COMPLETED` cycle remains historical and is
not forced backward into `RELAXING`.

## UI composition

### Journey and navigation

The user-facing Evening Journey becomes:

```text
Сегодня → Осмысление → Завтра → Среда → Расслабление → Завершение
```

The internal state is `RELAXING`; the user-facing label is «Расслабление». Historical selection
remains separate from the current domain state. A completed cycle exposes the saved R5 scene only
when R5 facts exist; legacy completed cycles show a calm unavailable/legacy state rather than
invented completion.

### Active scene

Use the existing Deep Focus guided-flow language and Evening Command Center shell.

Recommended visual order:

1. compact stage status and readiness;
2. drink and hygiene actions;
3. screen-free window surface;
4. dominant relaxation-practice surface;
5. one continuation CTA.

The recommended order is communicated by labels and placement, not disabled controls. All four
actions remain keyboard- and pointer-accessible from first render.

### Main visual center

The relaxation-practice surface is the single dominant object. It contains:

- selected practice;
- practice selector for the five canonical values;
- «Только сегодня» versus «Сделать практикой по умолчанию» behavior;
- duration presets plus labeled manual integer input;
- `Начать таймер` as secondary action;
- remaining/elapsed timer status when active;
- `Отметить выполненным` as the practice completion action.

Changing practice/duration displays calm inline confirmation. Saving as default uses explicit text;
it is never inferred from selecting a practice.

### Drink and hygiene

Drink and hygiene appear as compact action rows or tiles within one secondary region. Each row has
an accessible name, an explicit completion control, and a textual completed state. They do not
receive separate decorative colors.

### Screen-free

Before starting, show:

- the recommended duration;
- `Начать`;
- `Сократить до 10 минут` when standard duration is selected;
- `Пропустить сегодня` as a neutral tertiary action.

While active, show the saved duration, elapsed/remaining time, and the shorten action if still
standard. An elapsed window shows a success-ready state. A skipped window shows an explicit neutral
«Пропущено сегодня» state and remains distinguishable from completion without relying on color.

### Continuation

There is one primary CTA: `Перейти к завершению`.

It is disabled while:

- any required drink/hygiene/practice result is missing;
- screen-free is pending;
- screen-free is active but has not elapsed;
- a persistence operation is in flight.

The disabled state names the remaining requirement in nearby text. On success the existing
Shutdown scene becomes current.

### States

- Loading: skeleton/state matching the actual R5 geometry.
- Active: all actions available in recommended visual order.
- Practice timer active: derived remaining time, no layout jump.
- Screen-free active: derived remaining time and optional shortening.
- Saving/disabled: affected controls prevent duplicate submission.
- Error/retry: inline message identifies the failed action and offers `Повторить` where safe.
- Ready: all requirements satisfied; one enabled continuation CTA.
- Complete/history: exact saved practice, duration, outcomes, screen-free completion or skip, and
  default choice shown read-only.
- Legacy history: no fabricated R5 results.

There is no content-empty state because the canonical action and practice catalogs are
deterministic. A missing or malformed persistence snapshot is an error state, not an empty state.

## Visual language

- Section: Routine / Evening.
- Section accent: Routine amber atmosphere through existing semantic tokens.
- Current/primary: gold.
- Completed action/window: green Success semantics.
- Screen-free skip: neutral graphite/gray plus explicit text.
- Error: red with recovery copy.
- Atmosphere: dark graphite with restrained warm rhythmic lines fading into a calmer field.
- Main visual center: the practice surface and its optional timer.
- No permanent violet accent, decorative blue, multi-color action list, or competing primary CTA.

The adjacent approved Evening references may guide material language and hierarchy:

- `Evening_UI_Reference_for_Codex/04_preparation.png` for the guided-flow shell and grouped actions;
- `Evening_UI_Reference_for_Codex/05_shutdown.png` for the transition into the final scene.

They are not dedicated R5 pixel references. The final report must not claim pixel-perfect fidelity.

## Mobile and accessibility

- Desktop viewports: 1600×900 and 1280×720.
- Mobile viewports: 390×844 and 360×800.
- Mobile order: status → drink/hygiene → screen-free → practice → continuation.
- Mobile uses a single vertical flow; desktop-only multi-column geometry is not merely shrunk.
- Primary continuation becomes full width and remains reachable without covering content.
- Touch targets are at least 44×44 px.
- Practice options, duration controls, and actions are keyboard-operable and have visible focus.
- Manual duration input has a persistent label, integer constraints, and textual error feedback.
- Timer status uses an appropriate live region without announcing every second aggressively.
- Completed, active, skipped, disabled, and default meanings are not conveyed by color alone.
- Long Russian labels wrap without truncation or horizontal overflow.
- Reduced motion preserves every state and transition.
- Timer display and readiness remain understandable without animation or glow.

## History

Completed Evening history shows the exact stored R5 snapshot when one exists:

- practice used that evening;
- saved duration;
- whether a timer was started;
- drink and hygiene completion;
- screen-free duration and completed or skipped outcome;
- whether the selected practice became the persistent default.

History is read-only in R5. It does not restart timers, recalculate a past screen-free window into a
different outcome, or mutate the current default. A completed screen-free result is persisted by
the final continuation command, so history does not depend on the viewer's current clock.

## Error behavior

- Invalid practice or duration: domain error; retain the current saved selection.
- Action attempted outside `RELAXING`: invalid-transition error.
- Screen-free completion attempted before elapsed: readiness error with remaining requirement.
- Concurrent update: reload current snapshot and ask the user to repeat the intended action.
- Persistence failure: keep the user on R5, retain safe UI drafts, and offer a scoped retry.
- Default lookup failure: do not initialize or save a guessed preference; show retry.
- Timer display failure caused by an invalid clock value: treat as malformed state and do not enable
  continuation.

A failure never skips R5, marks an action complete, changes the default, or advances to Shutdown.

## Explicit non-goals

- no Sleep Check;
- no before/after ratings;
- no R6 behavior or UI;
- no whole-stage R5 skip;
- no automatic practice completion;
- no strict action-order enforcement;
- no custom practice creation;
- no practice descriptions, media playback, audio guidance, or external music integration;
- no drink quantities or hygiene sub-checklists;
- no timer pause/resume/laps/background notification subsystem;
- no notification permission or OS alarm;
- no analytics, streaks, recommendations engine, or effectiveness scoring;
- no new IndexedDB store, database-version bump, or global settings subsystem;
- no changes to Morning Journey, Walks, Today, Sleep/Recovery, or user data outside the active R5
  evening snapshot and its copied default.

## Test strategy

### Domain

- `PREPARING → RELAXING → SHUTDOWN` transitions and invalid neighboring transitions;
- normal and special-mode Environment completion/skip targets;
- initial default practice and mode-specific durations;
- all five practice values and default/current-evening selection semantics;
- duration accepts integer 5–20 and rejects out-of-range/non-integer values;
- changing practice/duration clears an active practice timer only;
- completed practice cannot be reconfigured;
- drink/hygiene completion is order-independent and idempotent;
- optional timer start, elapsed derivation, and manual completion;
- timer expiry alone does not complete practice;
- screen-free 25-minute start, active shortening to 10, elapsed calculation, and explicit skip;
- skip is non-success but satisfies the readiness branch;
- complete R5 rejects missing drink, hygiene, practice, pending screen-free, and non-elapsed active
  screen-free;
- final completion persists elapsed screen-free and transitions atomically in one aggregate version.

### Application

- initializes R5 once after Environment completion;
- reads the latest strictly prior valid default or falls back to reading;
- current-evening override does not change future default;
- save-as-default affects the next evening;
- NORMAL, QUICK, and EMERGENCY initial values;
- every mutation uses the injected clock and optimistic CAS;
- bounded concurrency retry and final conflict error;
- refresh/get never resets timers or saved outcomes;
- final continuation records elapsed screen-free and advances once;
- completed or wrong-stage cycles reject mutation;
- failures do not partially advance or fabricate outcomes.

### Persistence

- new R5 record round-trip with every field and timestamp;
- legacy record without relaxation fields remains readable;
- malformed practices, durations, timestamps, and state combinations are rejected;
- current default and selected practice survive refresh;
- active practice and screen-free timers survive refresh from timestamps;
- manual completion and conscious skip survive refresh;
- existing IndexedDB version and indexes remain unchanged;
- all pre-existing EveningCycle fields remain equal after R5 round-trip.

### Presentation and browser

- journey includes Relaxation in the correct position and semantic state;
- recommended order is visible while controls remain available out of order;
- five practices and current/default distinction;
- presets and manual 5–20 minute duration;
- optional timer and manual completion without timer;
- screen-free start, active countdown, shortening, elapsed ready state, and conscious skip;
- CTA readiness and disabled reason for every missing requirement;
- loading, saving, error/retry, ready, current, complete/history, and legacy states;
- refresh restoration for active timer and active screen-free window;
- no Sleep Check or ratings;
- desktop/mobile layout, touch targets, wrapping, overflow, keyboard focus, reduced motion, and
  browser console;
- Rule 38 review against established LifeOS language without a pixel-perfect claim.

## Targeted files and modules

Expected areas, subject to the implementation plan's final read-only audit:

- Domain: `src/domain/evening-cycle/EveningCycleState.ts`, `EveningCycle.ts`, focused R5 value
  objects/types, exports, and domain tests.
- Application: `EveningCycleApplicationService`, repository lookup contract if required, Environment
  continuation integration, exports, and application tests.
- Infrastructure: in-memory and IndexedDB EveningCycle repositories, additive record/mapper fields,
  and focused persistence tests. No new store or database version.
- Presentation: Evening Journey mapping/KPIs, a focused Relaxation scene and presentation helper,
  EveningReviewPanel orchestration, tokens-based styles, and focused render tests.
- Composition: only wiring required to expose existing/focused application commands.
- Browser: targeted Evening Journey acceptance coverage for refresh and mobile behavior if a
  bounded existing test entry can be extended without broadening R5.

## Stage gate

R5 follows the repository R2–R8 gate requested by the user:

```text
failing targeted tests
→ minimal implementation
→ targeted tests
→ npm run verify
→ browser QA at required desktop/mobile viewports
→ Rule 38 and quality-gate review
→ STOP
```

The implementation must use the canonical bounded commands from `docs/codex/TEST_MATRIX.md`.
No bare Vitest, interactive Playwright, or unbounded dev-server command is a test result. Any full
E2E run outside the behavior already contained in `npm run verify` requires an explicit stage-gate
reason under `AGENTS.md`; R5 must not silently expand into R9, R10, R12, or R6.

## Definition of Done

- [x] Current R1–R4 architecture, persistence, UI, references, and tests audited.
- [x] Persistent default-practice semantics approved by the user.
- [x] Standard 25-minute and shortened 10-minute screen-free contract approved.
- [x] Readiness gate approved.
- [x] Embedded EveningCycle architecture approved.
- [x] UI, mode, mobile, and testing contract approved.
- [ ] Written specification reviewed and approved by the user.
- [ ] Implementation plan written and reviewed.
- [ ] Failing tests added before production implementation.
- [ ] R5 implemented without starting R6.
- [ ] Persistence, refresh, optional timer, manual completion, screen-free skip, and default carry
  forward verified.
- [ ] Targeted tests and `npm run verify` pass on the final current tree.
- [ ] Desktop/mobile browser QA, console review, and Rule 38 review complete.
- [ ] Final result reported as `R5 COMPLETE — WAITING FOR USER APPROVAL`.
