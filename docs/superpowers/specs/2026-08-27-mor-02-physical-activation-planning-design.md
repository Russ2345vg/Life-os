# MOR-02 Physical Activation Planning — Design

## Goal and boundary

MOR-02 adds the complete exercise-selection and current-morning planning experience to the
existing Morning Center at `#/routine/morning?date=…`. It extends the accepted MOR-00/MOR-01
architecture rather than creating another morning engine.

MOR-02 includes a reusable exercise catalog, an ordered plan for the selected `MorningCycle`,
inline target adjustment, a compact custom-exercise form, persistent summary metrics, and a clean
presentation-only transition toward execution. It does not start, complete, or record exercise
sets and does not add repetition counters, rest timers, results, records, history, analytics,
streaks, automatic progression, or recommendations. Those behaviors remain outside this patch.

The visual source of truth is the approved written MOR-02 brief, the accepted MOR-01 Morning
Center, and `docs/codex/UI_RULES.md`. No MOR-02 image or node-specific Figma URL exists in the
active worktree, so pixel-perfect fidelity cannot be claimed and final handoff requires manual
visual review.

## Existing integration map

- Morning route: `#/routine/morning?date=…` → `ApplicationShell` → `RoutinePage` →
  `MorningCenterPage`.
- Morning read model: `GetMorningCenterOverview`.
- Morning mutations: application services → `MorningCycle` → `MorningCycleRepository`.
- Morning persistence: `IndexedDbMorningCycleRepository` → `morningCycles`, uniquely indexed by
  `dayId` and `dateKey`.
- Existing physical state: `NOT_CONFIGURED`, `READY`, `IN_PROGRESS`, `DONE`, or `SKIPPED` on
  `MorningCycle`.

No exercise, workout, fitness-plan, or reusable health-exercise entity exists. `RoutineBlock`,
`LifeAction`, `PreparationItem`, and physical `Walk` classification have different ownership and
must not be reused as exercise definitions.

## Chosen architecture

The feature uses one reusable `ExerciseDefinition` catalog and embeds today's ordered planning
items in the existing `MorningCycle`.

This is preferred over embedding definitions in every cycle because definitions must be reusable
across days. It is preferred over a standalone daily-plan aggregate because the selected plan and
physical stage status must change together under the existing optimistic compare-and-swap write.

The dependency flow remains UI → Presentation → Application → Domain. Infrastructure implements
application ports, and App composition creates the concrete adapters. React never writes domain
state directly and does not duplicate validation or duration calculations.

## Exercise definitions

`ExerciseDefinition` describes what an exercise is. It contains:

- stable `EntityId`;
- trimmed display name and normalized name used for uniqueness;
- measurement type `REPETITIONS` or `DURATION`;
- source `SYSTEM` or `CUSTOM`;
- creation/update timestamps, nullable `archivedAt`, and a positive version.

Names are non-empty after trimming, have a maximum of 80 characters, and are unique
case-insensitively after whitespace normalization. Measurement type is immutable. MOR-02 exposes
creation but no rename, archive, restore, or destructive-delete UI. The domain and record include
`archivedAt` so future removal can be soft archival; archived definitions remain resolvable for
existing plans and are omitted only from new selection.

The single catalog contains these system definitions with stable IDs:

1. Отжимания — repetitions;
2. Подтягивания — repetitions;
3. Приседания — repetitions;
4. Планка — duration;
5. Пресс — repetitions.

One canonical seed table defines their stable IDs, names, measurement types, and system source.
Database initialization stores those records idempotently in the same repository used for custom
definitions. The UI does not maintain a second built-in catalog.

A custom definition requires only `Название` and `Тип учёта`. Saving creates a `CUSTOM`
definition through an application command. It appears in the active library immediately and can
then be selected like a system definition. The inline form offers `Повторения` and `Время`; it does
not add muscles, photos, programs, difficulty, calories, or descriptions.

## Morning physical plan

The selected plan belongs implicitly to one `MorningCycle`, and therefore to its existing `dayId`
and `dateKey`. An item references one definition and records only what is planned for that morning.

```ts
type MorningPhysicalPlanItem =
  | {
      readonly exerciseDefinitionId: EntityId;
      readonly measurementType: 'REPETITIONS';
      readonly sets: number;
      readonly targetReps: number;
    }
  | {
      readonly exerciseDefinitionId: EntityId;
      readonly measurementType: 'DURATION';
      readonly sets: number;
      readonly targetDurationSeconds: number;
    };
```

The discriminated union prevents repetitions and seconds from sharing an implicit field. Each
definition can appear at most once in a cycle. Item order is selection order; deselecting removes
the item, and selecting it again appends it. Definition names and measurement types stay in the
catalog, while sets and targets stay only in the daily item.

Bounds are domain rules:

- sets: integer `1…10`;
- target repetitions: integer `1…100`;
- target duration: integer `5…600` seconds, adjusted in 5-second steps.

`NaN`, infinities, fractional values, empty invalid values, negatives, zero, incompatible union
fields, duplicate definition IDs, and values outside the bounds are rejected. Selection defaults
are `3 × 10` for repetitions and `3 × 30 seconds` for duration. Defaults belong to the plan-item
factory, never to `ExerciseDefinition`.

All selection and stepper actions persist immediately; there is no separate Save button for the
daily plan. A planning application service loads the authoritative cycle and definition, applies
one typed domain operation, and saves the full cycle through the existing current-date guard and
two-attempt CAS pattern. Presentation reloads the read model after each successful command and
does not retain an optimistic parallel copy.

Selecting the first item moves physical state from `NOT_CONFIGURED` to `READY`. Removing the last
item moves `READY` back to `NOT_CONFIGURED`. Planning commands reject `IN_PROGRESS`, `DONE`, and
`SKIPPED`. Rehydration remains compatible with legacy cycles whose physical status is `READY` or a
later state but whose plan array is absent. MOR-02 never creates `IN_PROGRESS` or `DONE` and never
completes the physical stage.

## Estimate and Morning Center projection

A pure domain/application calculation returns:

- selected exercise count;
- total sets;
- approximate duration as two minutes per set.

The rule is deliberately simple and explainable: six planned sets produce `≈ 12 мин`. Empty plans
produce zero for the MOR-02 plan summary. `GetMorningCenterOverview` keeps the accepted MOR-01
baseline physical estimate while no plan exists and replaces it with the saved plan estimate once
items are selected. The formula is not persisted and is not duplicated in JSX.

The physical stage displays:

- `Упражнения не выбраны` when the plan is empty;
- `<N> упражнения · <S> подходов` with correct Russian plural forms when populated.

The stage remains current after configuration. Only the existing terminal `DONE` or `SKIPPED`
facts advance the Morning Center, so MOR-02 cannot mark physical activity complete.

## Persistence and compatibility

IndexedDB advances from version 18 to 19 and adds one `exerciseDefinitions` store with key path
`id` and a unique `byNormalizedName` index. System and custom definitions use the same
`ExerciseDefinitionRepository`, mapper, record schema, and store. No dependency is added.

The existing `MorningCycleRecord` retains `schemaVersion: 1` and gains
`physicalPlanItems`. The mapper treats a missing or explicit legacy-null field as an empty array,
while malformed known values fail fast. `cloneMorningCycle` includes a defensive plan copy so a
concurrent Quick Start mutation cannot erase it. The existing morning repository contract and
indexes remain unchanged because the entire plan is saved with its owning cycle.

Migration coverage opens a literal version-18 database, preserves its existing records, upgrades
to version 19, verifies the new store/index and system definitions, and reopens successfully.
Repository coverage closes and reopens IndexedDB to prove definitions and daily plans survive
application restart.

## Application contracts

The catalog boundary provides active definitions for selection, any definition by ID for existing
plans, and custom creation with duplicate-name protection.

The planning boundary provides current-date commands for:

- selecting a definition with measurement-specific defaults;
- deselecting a definition;
- incrementing or decrementing sets;
- incrementing or decrementing the matching target value.

The service owns date legality, definition lookup, domain mutation, bounds, and CAS conflict
handling. A focused `GetMorningPhysicalActivationOverview` joins the selected cycle with active and
referenced archived definitions and returns an immutable presentation model containing library
cards, selected item rows, edit capabilities, pending-independent command data, and summary.

`GetMorningCenterOverview` exposes only the physical stage summary and estimate needed by the
center. It does not duplicate the detailed editor read model.

## Navigation and UI

MOR-02 keeps the existing morning hash route and adds an in-page `physicalActivation` detail view
alongside `center` and `quickStart`. A direct MOR-02 deep link is not required. Refresh returns to
the Morning Center, while the plan itself reloads from IndexedDB unchanged.

When Physical activation is the current stage, its card receives a real `Открыть` action. Opening
the detail focuses its `Физическая активация` heading. `← Утренний центр` returns to the center and
restores focus to the physical-stage trigger.

The detail header uses exactly:

- title: `Физическая активация`;
- subtitle: `Выбери упражнения и настрой нагрузку на сегодняшнее утро.`

Desktop uses a two-column composition: exercise library on the left and `Сегодняшний набор` on the
right. Mobile reflows in the required order: library → today's set → `Начать выполнение`; desktop
column widths are not compressed into a mobile two-column grid.

Library cards contain a concise SVG icon, name, measurement label, and selection state. The whole
card is a native button or label-backed native control with a clear accessible name. Selected
cards use a thin gold border, a small gold check, and a stronger graphite surface. Repeated
activation deselects the definition. There are no long descriptions or ordinary-selection
modals.

Selected items render inline steppers for sets and either repetitions or seconds. Controls have
accessible increment/decrement names, a minimum 44-pixel target, visible focus, and disabled
states at domain bounds and while a mutation is pending. Native click behavior does not implement
press-and-hold auto-repeat.

`+ Добавить своё` expands the compact form in the library flow. Validation and persistence errors
are announced with `role="alert"`; retry does not erase the saved daily plan.

The metrics use only real current-plan data:

- `Выбрано` — exercise count;
- `План` — total sets;
- `Ориентир` — approximate minutes.

`Начать выполнение` is disabled for an empty plan. When enabled, it changes only presentation
view to a neutral entry state headed `План на утро готов`, with a return-to-settings control. It
does not call `startPhysical`, write execution state, create results, or expose developer terms.

## Visual and responsive rules

The screen reuses the accepted MOR-01 graphite surfaces, existing tokens, compact borders and
radii, gold priority/selection accent, green only for confirmed success, and red only for errors.
It introduces no permanent purple, excessive glow, fabricated history, or sample performance
statistics.

Required viewports are 1600×900, 1280×720, 390×844, and 360×800. The layout must have no page or
component horizontal overflow, must preserve the morning page safe-area padding, and must not let
the CTA cover content. Keyboard order, heading/return focus, disabled behavior, screen-reader
names, long custom names, and reduced-motion behavior are part of browser acceptance.

## Error and concurrency behavior

Loading catalog/plan state, load error with retry, plan-empty, selected, custom-form validation,
mutation pending, mutation failure, execution-entry placeholder, and read-only selected-date
states are explicit. All controls are disabled coherently during their own persisted mutation so
double activation cannot issue competing commands.

The existing current-local-date guard rejects yesterday and tomorrow mutations. Historical plans
may be projected read-only and can resolve archived definitions, but they cannot be changed.
Optimistic CAS retries once against a fresh cycle and then reports the existing concurrent-change
error. The UI reloads authoritative state after success or retry.

## Verification

TDD covers:

- definition creation, normalization, uniqueness, immutable measurement type, and archival data;
- discriminated plan items, defaults, duplicates, all numeric bounds, and invalid numbers;
- selection, deselection, adjustment, status transitions, date guards, idempotency, and CAS;
- mapper legacy defaults, defensive copies, IndexedDB version-18 migration, and reopen round trips;
- catalog and planning composition;
- plan summary, Russian copy, duration estimate, and unchanged physical completion semantics;
- Morning Center entry, detail states, custom form, disabled/pending/error behavior, and Routine
  regressions.

The targeted MOR-02 browser scenario opens Physical activation, selects Отжимания and
Подтягивания, configures `3 × 15` and `3 × 6`, deselects and reselects one item, refreshes, returns
to the Morning Center, reopens the detail, creates a custom duration definition, and checks the
saved values. It also verifies desktop/mobile reflow, keyboard/focus behavior, no horizontal
scroll, minimum control size, and clean browser console/page errors.

After targeted checks, the change runs `npm run test:fast`, `npm run typecheck`, `npm run lint`, a
targeted managed MOR-02 E2E, and one final `npm run verify`. Handoff leaves a local server running,
reports its address and all evidence, does not push, does not start MOR-03, and stops.
