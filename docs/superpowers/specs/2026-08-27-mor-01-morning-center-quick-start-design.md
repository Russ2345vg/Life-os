# MOR-01 Morning Center and Quick Start — Design

## Goal and boundary

MOR-01 adds the user-facing Morning Center and Quick Start experience to the existing
`#/routine/morning?date=…` route. It extends the existing `MorningCycle` aggregate and
`morningCycles` persistence path; it does not create a second morning engine or duplicate Day,
LifeAction, Decision, Project, TomorrowPlan, RoutineBlock, or routine-execution state.

The stage implements only:

- the Morning Center shell and five-stage preview;
- starting and resuming today's existing morning run;
- completing water once;
- completing or explicitly skipping today's cold shower;
- an authoritative five-stage status projection with current, completed, and upcoming states;
- whole-morning progress and an explicitly approximate remaining-time baseline;
- an idempotent entry point for persisted shortened mode;
- resolving a prior active run as abandoned;
- reload-safe Quick Start progress and elapsed time.

Physical activation, Mirror, main-action selection or scheduling, work-block execution, shortened
stage behavior, personalization, learned duration forecasts, and history are outside MOR-01.

## Source of truth and architecture

`MorningCycle` remains the only owner of morning-run facts. Existing water fields remain the
authoritative source for water. The cold shower is a managed stage snapshot with the stable id
`quick_start.cold_shower`; it is changed only by explicit aggregate methods exposed through
`MorningCycleApplicationService`.

Presentation consumes one focused application read model, `GetMorningCenterOverview`. React does
not combine repository facts or infer lifecycle legality. The query reads today's or the selected
date's cycle plus the latest active prior-date cycle and derives an immutable presentation model.
No progress, timer, or forecast is persisted.

The existing database version, `morningCycles` store, indexes, record schema version, and mapper
remain unchanged. The existing `stageStates` array already round-trips stable stage facts and reads
legacy records as an empty list.

## Cold-shower domain contract

`MORNING_STAGE_ID.coldShower` identifies the cold-shower fact. `completeColdShower(at)` writes
`COMPLETED`; `skipColdShower(at)` writes `SKIPPED`.

- The cycle must be started and active.
- Repeating the same terminal choice is a no-op that preserves its timestamp and version.
- Completing after skipping, or skipping after completing, is rejected. A correction command is
  deliberately not introduced in MOR-01.
- Water is not duplicated into `stageStates`; physical activation is not reused for the shower.
- Completing Quick Start does not call `markReadyToWork()` or `finish()` because later morning
  stages remain.

Application commands keep the existing current-date guard and optimistic compare-and-swap retry.

`shorten(at)` is a one-way, idempotent transition for an active run. It changes only the existing
persisted `shortenedMode` marker. It does not skip or complete any stage and therefore does not
implement MOR-02 or later-stage behavior.

## Morning Center read model

The focused read model contains only user-facing MOR-01 facts:

```ts
interface MorningCenterOverview {
  readonly date: DayDate;
  readonly mutable: boolean;
  readonly cycleState: MorningCycleState | null;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly canStart: boolean;
  readonly canUseQuickStart: boolean;
  readonly canShorten: boolean;
  readonly canAbandonPrevious: boolean;
  readonly shortenedMode: boolean;
  readonly overallProgressPercent: number;
  readonly remainingMinutes: number;
  readonly currentStageId: MorningCenterStageId;
  readonly stages: readonly MorningCenterStageOverview[];
  readonly previousUnfinished: {
    readonly date: DayDate;
    readonly startedAt: Date;
  } | null;
  readonly quickStart: {
    readonly water: 'pending' | 'completed';
    readonly coldShower: 'pending' | 'completed' | 'skipped';
    readonly resolvedCount: number;
    readonly total: 2;
    readonly completed: boolean;
  };
}
```

The selected date is mutable only when it equals the current local date. Historical and future
views are read-only. The previous unfinished fact is exposed only on the current-date view.
`canStart`, `canUseQuickStart`, and `canAbandonPrevious` are derived in the application read model,
so React does not duplicate lifecycle or recovery rules.

## UX states and navigation

The Morning Center replaces the generic morning-routine block list only within the existing
morning subsection. Day and Evening behavior remain unchanged.

The center shows a compact identity/header, Quick Start progress, elapsed time from persisted
`startedAt`, and five ordered stage cards:

1. Quick Start — operable in MOR-01;
2. Physical activation — preview only;
3. Mirror — preview only;
4. Main action — preview only;
5. Work block — preview only.

Quick Start opens as an in-page detail view with an accessible Back control. It contains exactly
water and cold shower. Water has one idempotent completion action. Shower exposes two explicit,
mutually exclusive actions: complete and “Пропустить душ сегодня”. A broad skip-stage action is not
shown. Once both facts are resolved, the detail shows success and one CTA that returns to the
center, focuses Physical activation as the current preview, and exposes no MOR-02 command.

Before a not-started current morning can start while a prior active run exists, the user must
resolve the prior run with the explicit abandon action. If today's run already exists, the recovery
notice remains available without hiding today's facts.

Loading, load error with retry, mutation pending, mutation error, not-started, active/resumed,
completed Quick Start, and read-only date states are explicit. In-page view changes move focus to
the new heading; returning restores focus to the Quick Start trigger.

## Progress and time semantics

The five stages have equal 20% weight. Quick Start contributes 10% for water and 10% for a
completed or explicitly skipped shower. Existing completed/skipped physical facts contribute the
next 20%; MOR-01 never creates those facts. Later stages remain upcoming because their contracts
belong to later MOR patches.

Remaining time is an explicitly approximate product baseline derived only in the application read
model. Normal estimates are 5/10/5/5/25 minutes for Quick Start, Physical activation, Mirror, Main
action, and Work block. Quick Start resolves as 1 minute for water plus 4 minutes for the shower.
Shortened mode uses 5/5/3/2/15 minutes. These values are not persisted or presented as learned
personalization. Elapsed time remains derived from persisted `startedAt` and the injected clock.

## Visual and responsive rules

The approved mobile reference supplies hierarchy and tone, while the existing LifeOS shell and
tokens remain authoritative. The implementation uses the graphite base, gold priority accent,
green active/success state, and red only for errors/destructive recovery. It does not copy the
reference bottom navigation, add purple accents, or hardcode sample percentages, times, or counts.

Controls remain at least `2.75rem` high with visible focus. Layout is one column at 390×844 and
360×800 with safe bottom spacing and no horizontal overflow; desktop uses the current shell and
available content width. Reduced-motion preferences are preserved and no animated progress ring is
introduced.

## Verification

TDD coverage includes shower invariants, application current-date/CAS behavior, focused query
derivation, IndexedDB reload of the shower snapshot, composition wiring, presentation states, and
Routine regressions. Browser QA covers the direct morning route, start, water, both shower paths,
reload/resume, previous-run recovery, historical read-only behavior, desktop and mobile layouts,
keyboard focus, horizontal overflow, and console/page errors. Completion requires the full LifeOS
quality gate and an independent read-only final review.
