# R4 — Environment Stage («Среда»)

## Status

- Design: `APPROVED`
- Implementation: `NOT STARTED`
- Visual review: `PENDING`
- Lock: `UNLOCKED`

The architecture, persistence approach, required-core interaction, and UI contract were explicitly
accepted by the user on 2026-08-30. The implementation and final rendered result are not approved
or locked yet.

## Scope classification

R4 is a new user flow inside the existing Evening Preparation stage. It changes the existing
`PreparationPlan` domain contract, application commands, persistence mapping, presentation model,
and UI, but it does not create a new section, repository, engine, or parallel plan.

The requested `LifeOS_Evening_Ritual_v2_Architecture_Spec.md` and separate R1/R2 reports are not
present in the active worktree. The authoritative sources for this specification are the current
domain/application/infrastructure/presentation code, the accepted R3 specification, the repository
architecture rules, and the approved Evening visual reference.

## Feature

Evolve the existing Preparation stage into the user-facing Environment stage («Среда»). It combines
two purposes in one saved plan:

1. preparing the environment for sleep;
2. preparing the environment for tomorrow's first start.

The stage provides a configurable required core of three to six items. Every active checklist item
can be completed or consciously skipped for the current evening. A conscious skip is persisted and
does not block stage completion.

## User goal

Before leaving the active part of the evening, remove the most important obstacles to sleep and to
tomorrow's first action without completing a rigid or overlong checklist.

## Design contract

```text
FEATURE
→ Environment stage inside the existing Evening Preparation flow

USER GOAL
→ Prepare sleep and remove obstacles to tomorrow's first start

EXISTING LOGIC
→ EveningCycle PREPARING remains the authoritative stage state
→ PreparationPlan remains the only aggregate and saved checklist
→ PreparationService remains the mutation/application boundary

PAGE/COMPONENT ARCHETYPE
→ Deep Focus guided flow using the existing Preparation composition

SECTION COLOR
→ Routine amber atmosphere; current/primary action is gold
→ completed is green; skipped is explicit neutral; error is red

MAIN VISUAL CENTER
→ Two clearly separated checklist areas: sleep environment and tomorrow environment

COMPONENTS TO REUSE
→ PreparationPanel / PreparationSceneView
→ existing readiness/progress presentation
→ EveningVisualIcon, button hierarchy, status language, and LifeOS tokens

MOBILE BEHAVIOR
→ Required-core selection first, then a single vertical checklist flow
→ Sleep environment before tomorrow environment
→ Full-width primary action, touch targets at least 44×44 px, no horizontal scroll

APPROVED REFERENCE
→ YES: Evening_UI_Reference_for_Codex/04_preparation.png

TEST SCOPE
→ required-core invariants, both areas, complete/skip, synchronization, legacy records,
  refresh, history, modes, presentation states, and desktop/mobile browser QA
```

## Existing architecture to preserve

- `EveningCycle` is the authoritative state machine. The persisted state literal remains
  `PREPARING` during R4; the navigation and screen label become «Среда».
- `PreparationPlan` is the only checklist aggregate. No `SleepPreparationPlan`, `EnvironmentPlan`,
  second repository, or second history source is allowed.
- `PreparationService` owns generation, optimistic mutations, completion, and the atomic transition
  from `PREPARING` to `SHUTDOWN` through the existing `PreparationUnitOfWork`.
- `PreparationItem` already owns the useful outcome contract: `PENDING`, `COMPLETED`, `SKIPPED`,
  completion time, skip time, and optional skip reason.
- `TomorrowPlan`, its `firstAction`, linked Decision/Project, Reflection corrections, and active
  Preparation rules remain inputs to requirement generation.
- UI state is a draft or loading state only. React does not mutate the aggregate or persistence.
- Completed and skipped items remain in the saved ordered list. Synchronization deactivates stale
  items instead of deleting history.

## Alternatives considered

### Selected: evolve `PreparationPlan`

Add an area discriminator and required-core configuration to the existing aggregate. This preserves
one owner for the stage, the existing repository/UoW, and the existing history route.

### Rejected: rename persisted state to `PREPARING_ENVIRONMENT`

The name is more explicit but would force an EveningCycle record compatibility change before the
dedicated migration stage. R4 can safely reuse the existing state and change its user-facing label.

### Rejected: create a separate sleep/environment plan

This would split one stage across two aggregates and repositories, duplicate checklist behavior,
and introduce ordering and history reconciliation problems.

## Domain model

### Environment area

Add an additive discriminator to each `PreparationItem`:

```text
SLEEP_ENVIRONMENT
TOMORROW_START
```

The existing `PHYSICAL`, `DIGITAL`, and `COGNITIVE` categories remain valid secondary metadata for
rules, recommendations, and backward compatibility. They no longer define the primary UI groups.

### Required core

`PreparationPlan` stores `requiredCoreKeys`, or an equivalent typed value, as the confirmed set of
required active item keys.

Invariants:

- a configured core contains three to six unique keys;
- every key belongs to an active plan item;
- item `required` values agree with the configured key set;
- core configuration is changed through one aggregate command;
- changing the core does not reset `COMPLETED` or `SKIPPED` outcomes;
- stage completion requires no `PENDING` required item;
- a required `SKIPPED` item is processed and does not block completion;
- repeated identical configuration is idempotent;
- configuration cannot mutate a frozen historical plan through history viewing.

For a new R4 plan, the generator recommends four initial core items: two for sleep and two for the
tomorrow start. The user must explicitly confirm a selection of three to six items before the plan
is treated as configured. The recommendations reduce setup effort but are not an implicit user
decision.

### Candidate catalog

Sleep environment candidates:

- ventilate the room;
- dim the lighting;
- remove active screens;
- prepare the bed;
- reduce unnecessary noise;
- charge the phone and/or move it away from the bed.

Tomorrow environment candidates:

- prepare clothes;
- prepare water;
- set/check the alarm;
- prepare necessary items;
- prepare the workspace;
- prepare what is specifically required for `firstAction`.

The catalog is a deterministic baseline, not a complex context rule engine. Existing first-action,
project, rule, and Reflection-derived requirements remain additive inputs. Generation must dedupe
semantically identical keys and keep a stable order. R4 does not add effectiveness analytics or a
general-purpose rule engine.

## Synchronization semantics

`PreparationPlan.synchronize` continues to merge by stable item key.

- Existing matching items keep identity, order-sensitive outcome data, and timestamps.
- New requirements are inserted into their deterministic area position.
- Removed requirements become inactive historical items rather than being deleted.
- A configured required core remains authoritative across ordinary regeneration.
- New generated items are optional until the user adds them to the core.
- A `TomorrowPlan` change may update pending suggestions but cannot erase completed/skipped history.
- A completed Evening history plan is returned as saved and is never regenerated merely because it
  is opened.

The current hard slice to five generated items must not remain the total-plan rule. Three to six is
the required-core size, not the maximum number of visible optional suggestions. Presentation should
remain concise by grouping and hierarchy rather than silently dropping saved requirements.

## Application flow

The existing service is extended; no new application engine is introduced.

```text
getOrGenerate(cycleDate)
→ configureRequiredCore(cycleDate, itemKeys)
→ completeItem(cycleDate, itemId) / skipItem(cycleDate, itemId, reason?)
→ continueToShutdown(cycleDate)
```

`configureRequiredCore` uses the same optimistic repository/version contract as item mutations.
`continueToShutdown` validates core confirmation and pending required items before committing the
completed plan and EveningCycle transition atomically.

Error behavior:

- invalid core size or unknown/inactive key produces a domain error;
- a concurrent update follows the existing bounded optimistic retry/error behavior;
- persistence failure leaves the UI on the same configuration or checklist state;
- retry must not duplicate items, reset outcomes, or reapply a stale core.

## Evening mode behavior

- `NORMAL`: core configuration is required; after confirmation, show required and optional items in
  both areas.
- `QUICK`: core configuration is still an explicit user decision; after confirmation, show only the
  required core using the existing mode filter.
- `EMERGENCY`: preserve the existing explicit Preparation-stage skip and recorded skip reason. Do
  not manufacture a plan or silently accept a core.
- A late-night reason remains metadata on the selected mode and does not create another R4 flow.

R4 does not insert `RELAXING`. Until R5 is implemented, completing Environment follows the current
`PREPARING → SHUTDOWN` transition.

## Persistence and backward compatibility

The existing `preparationPlans` object store and indexes already support the aggregate identity and
queries required by R4. IndexedDB database version 19 does not need to change.

The `PreparationPlanRecord` format gains additive optional data for item area and required-core
configuration. The mapper must support both shapes:

- a legacy item without area is interpreted as `TOMORROW_START`;
- a legacy plan without required-core configuration remains a legacy plan and keeps its stored
  `required` flags;
- reading legacy history does not invent sleep items or force a new 3–6 invariant;
- a new or subsequently configured active plan writes the additive R4 fields;
- no destructive rewrite of all existing records occurs during database opening;
- record schema handling must be explicit and tested even if `schemaVersion: 1` remains compatible.

If implementation proves that additive optional fields cannot be safely expressed without changing
the record schema version, work must stop and the migration must be justified before changing the
database or record version. R4 must not silently broaden into R9.

## UI composition

### Navigation and heading

The user-facing stage label becomes «Среда». The internal state remains `PREPARING`. Historical and
current view selection must continue to be separate from domain state.

### First-open core configuration

- Keep the existing Preparation page shell and approved visual hierarchy.
- Show the two environment areas and four recommended selected items.
- Display the current count and the allowed range `3–6` without relying on color.
- The primary action confirms the core and is disabled outside the valid range.
- Selection does not complete or skip checklist items.
- Existing completed/skipped outcomes remain visible if the user later reopens configuration.

### Active checklist

- Sleep environment and tomorrow environment are visually and semantically distinct headings.
- Each row keeps a stable position after processing.
- Each pending row exposes both `Выполнено` and `Пропустить сегодня` without hiding the required
  outcome behind an overflow menu.
- Required items have a textual «Обязательное ядро» indicator; meaning is not color-only.
- Completed uses the existing success semantics. Skipped uses a clear neutral label and is not styled
  as success or error.
- `Настроить ядро` is secondary to the checklist and stage continuation.
- One primary continuation CTA remains. It is disabled only while the core is unconfirmed, a
  required item is pending, or persistence is in flight.

### First start context

Reuse the existing first-start block derived from `TomorrowPlan` and `firstAction`. Do not duplicate
Tomorrow planning inputs or hardcode reference sample data.

### States

- Loading: skeleton/state matching the existing Environment geometry.
- Configuration: recommended core awaiting explicit confirmation.
- Active: confirmed core and actionable checklist.
- Saving/disabled: affected actions disabled without moving rows.
- Error/retry: inline message identifying whether configuration, item outcome, or continuation failed.
- Ready: all required items processed; optional pending items do not block continuation.
- Complete/history: exact saved areas, items, required flags, and outcomes; read-only until the
  existing explicit history-edit affordance is used where supported.
- Legacy history: only saved legacy content, grouped under tomorrow preparation without fabricated
  sleep history.

## Visual language

- Section: Evening Routine.
- Accent: Routine amber atmosphere, gold current/primary semantics.
- Completed: green Success Surface/indicator.
- Skipped: neutral graphite/gray with explicit text.
- Error: red with recovery text.
- Main visual center: the two-area checklist and required core.
- Atmosphere: dark graphite, restrained warm edge/light, no general violet accent.
- Approved reference: `D:/LifeOS-App/Evening_UI_Reference_for_Codex/04_preparation.png`.

The reference defines the overall guided-flow hierarchy, first-start emphasis, grouped checklist,
readiness footer, and material language. R4 adapts its three old category columns into two semantic
environment areas; it does not attempt literal pixel copying of obsolete labels or sample data.

## Mobile and accessibility

- Desktop validates at 1600×900 and 1280×720.
- Mobile validates at 390×844 and 360×800.
- Mobile order: core/status → sleep environment → tomorrow environment → readiness/CTA.
- Touch targets are at least 44×44 px.
- Long item labels wrap without truncation or reordering.
- No internal checklist scroll trap or unnecessary horizontal scrolling.
- Selection and outcomes use native controls or equivalent keyboard-operable semantics.
- Focus moves to the checklist heading after core confirmation and to inline error feedback on failure.
- Required, completed, skipped, disabled, and selected meanings are not conveyed by color alone.
- Reduced motion preserves all information and interaction.

## History

History reads the stored `PreparationPlan`; it does not invoke generation for an existing completed
plan. New R4 history shows both areas only when those areas were actually stored. Completed and
skipped items retain order, timestamps, required status, and skip reason. Deactivated items remain
available to persistence/history consumers and are not reintroduced as active UI items.

## Explicit non-goals

- no `SleepPreparationPlan` or second environment aggregate;
- no persisted state rename to `PREPARING_ENVIRONMENT` during R4;
- no Relaxation, screen-free timer, Sleep Check, ratings, or Recovery changes;
- no effectiveness analytics;
- no complex context rule engine;
- no global default-core settings page;
- no R9 database migration or destructive legacy rewrite;
- no R5 or later-stage transition implementation.

## Test strategy

### Domain

- item area validation and legacy-compatible rehydration input;
- required-core selection accepts exactly 3–6 unique active keys;
- rejects too few, too many, duplicate, missing, or inactive keys;
- identical configuration is idempotent;
- reconfiguration preserves completed/skipped outcomes and stable item order;
- skip satisfies the required-processing gate;
- synchronization preserves configured core and historical items;
- total optional checklist is not incorrectly capped at five.

### Application

- deterministic baseline contains sleep and tomorrow candidates;
- four recommendations require explicit confirmation;
- first-action/project/rule/Reflection requirements remain additive and deduplicated;
- configuration, complete, skip, and continuation use optimistic persistence;
- continuation is blocked for unconfirmed core or pending required items;
- normal, quick, emergency, late-reason, after-midnight `dateKey/dayId`, and concurrent retry paths;
- completed history returns the stored plan without regeneration.

### Persistence

- new R4 record round-trip;
- legacy record without area/core fields remains readable without data loss;
- completed/skipped outcomes, ordering, timestamps, and skip reason survive refresh;
- existing indexes and database version remain unchanged;
- UoW keeps plan completion and Evening transition atomic.

### Presentation and browser

- core configuration count/disabled/confirm behavior;
- two distinct areas and correct item placement;
- visible complete and skip actions;
- processed items stay in place;
- optional pending item does not block continuation;
- quick shows only confirmed required core; emergency keeps the explicit skip flow;
- loading, saving, error/retry, ready, complete, history, and legacy history states;
- comparison with the approved reference and Rule 38;
- desktop/mobile layout, keyboard focus, touch targets, wrapping, overflow, and browser console.

## Stage gate

R4 follows the repository R2–R8 gate:

```text
targeted tests
→ npm run verify
→ STOP
```

The full Playwright suite is not automatic. R4 requires targeted persistence tests and real browser
QA. A full E2E run may be justified only if the final patch changes a cross-cutting route,
navigation-state, database migration, startup/recovery, or Evening journey contract beyond the
scoped Environment stage; the reason must be stated before running it.

## Definition of Done

- [x] Existing aggregate, service, persistence, UI, modes, history, and tests audited.
- [x] One-plan architecture selected; parallel plan rejected.
- [x] Domain/persistence contract approved by the user.
- [x] UI/test contract approved by the user.
- [x] Approved visual reference identified.
- [ ] Written specification reviewed and approved by the user.
- [ ] Failing tests added before production implementation.
- [ ] Sleep and tomorrow areas implemented in the existing `PreparationPlan`.
- [ ] Required core is explicitly configurable from 3–6 items.
- [ ] Complete/skip outcomes persist and do not reorder rows.
- [ ] Legacy Preparation history remains readable without fabricated data.
- [ ] IndexedDB database version remains unchanged or any deviation is separately approved.
- [ ] Targeted tests and `npm run verify` pass.
- [ ] Desktop/mobile browser QA and Rule 38 review pass.
- [ ] Final visual result explicitly approved before `APPROVED`/`LOCKED` status.
