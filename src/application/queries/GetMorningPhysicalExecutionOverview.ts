import {
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_PHYSICAL_SET_STATUS,
  MORNING_PHYSICAL_STATUS,
  type DayDate,
  type EntityId,
  type ExerciseDefinition,
  type MorningCycle,
  type MorningPhysicalPlanItem,
  type MorningPhysicalSetExecution,
  type MorningPhysicalSetStatus,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { ExerciseDefinitionRepository } from '../ports/ExerciseDefinitionRepository';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';

export const MORNING_PHYSICAL_EXECUTION_VIEW_STATE = {
  unavailable: 'unavailable',
  recoverable: 'recoverable',
  unrecoverable: 'unrecoverable',
  running: 'running',
  paused: 'paused',
  awaitingAdvance: 'awaiting-advance',
  readyToFinish: 'ready-to-finish',
  completed: 'completed',
  legacyCompleted: 'legacy-completed',
} as const;

export type MorningPhysicalExecutionViewState =
  (typeof MORNING_PHYSICAL_EXECUTION_VIEW_STATE)[keyof typeof MORNING_PHYSICAL_EXECUTION_VIEW_STATE];

interface MorningPhysicalExecutionCurrentSetCommon {
  readonly exerciseDefinitionId: EntityId;
  readonly name: string;
  readonly exerciseIndex: number;
  readonly exerciseCount: number;
  readonly setNumber: number;
  readonly setCount: number;
  readonly globalSetIndex: number;
  readonly globalSetCount: number;
  readonly status: MorningPhysicalSetStatus;
  readonly resolvedAt: Date | null;
}

export type MorningPhysicalExecutionCurrentSet =
  | (MorningPhysicalExecutionCurrentSetCommon & {
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.repetitions;
      readonly targetReps: number;
      readonly actualReps: number | null;
    })
  | (MorningPhysicalExecutionCurrentSetCommon & {
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.duration;
      readonly targetDurationSeconds: number;
      readonly actualDurationSeconds: number | null;
    });

export interface MorningPhysicalExecutionOverview {
  readonly date: DayDate;
  readonly mutable: boolean;
  readonly state: MorningPhysicalExecutionViewState;
  readonly workedDurationMs: number;
  readonly selectedExerciseCount: number;
  readonly totalSets: number;
  readonly resolvedSets: number;
  readonly completedSets: number;
  readonly skippedSets: number;
  readonly totalActualReps: number;
  readonly totalActualDurationSeconds: number;
  readonly currentSet: MorningPhysicalExecutionCurrentSet | null;
  readonly canRecover: boolean;
  readonly canPause: boolean;
  readonly canResume: boolean;
  readonly canResolve: boolean;
  readonly canAdvance: boolean;
  readonly canFinish: boolean;
}

export interface MorningPhysicalExecutionOverviewSource {
  readonly date: DayDate;
  readonly currentDate: DayDate;
  readonly cycle: MorningCycle | null;
  readonly definitions: readonly ExerciseDefinition[];
  readonly now: Date;
}

export class GetMorningPhysicalExecutionOverview {
  public constructor(
    private readonly cycles: MorningCycleRepository,
    private readonly definitions: ExerciseDefinitionRepository,
    private readonly currentDate: CurrentDateProvider,
    private readonly clock: Clock,
  ) {}

  public async execute(date: DayDate): Promise<MorningPhysicalExecutionOverview> {
    const [cycle, definitions] = await Promise.all([
      this.cycles.findByDateKey(date),
      this.definitions.findAll(),
    ]);
    return resolveMorningPhysicalExecutionOverview({
      date,
      currentDate: this.currentDate.getCurrentDate(),
      cycle,
      definitions,
      now: this.clock.now(),
    });
  }
}

export function resolveMorningPhysicalExecutionOverview(
  source: MorningPhysicalExecutionOverviewSource,
): MorningPhysicalExecutionOverview {
  const planItems = source.cycle?.physicalPlanItems ?? [];
  const definitionsById = new Map(
    source.definitions.map((definition) => [definition.id.toString(), definition]),
  );
  const resolvedPlan = planItems.map((item) => ({
    item,
    definition: requireDefinition(item, definitionsById),
  }));
  const execution = source.cycle?.physicalExecution ?? null;
  const sets = execution?.sets ?? [];
  const suppressedSetIndexes = execution?.suppressedSetIndexes ?? [];
  const eligibleSetIndexes = sets
    .map((_set, index) => index)
    .filter((index) => !suppressedSetIndexes.includes(index));
  const state = resolveState(source.cycle);
  const mutable = source.date.equals(source.currentDate);
  const canMutate = mutable && source.cycle?.isActive() === true;
  const eligibleSets = eligibleSetIndexes.map((index) => sets[index]!);
  const resolvedSets = eligibleSets.filter(
    (set) => set.status !== MORNING_PHYSICAL_SET_STATUS.pending,
  ).length;
  const completedSets = eligibleSets.filter(
    (set) => set.status === MORNING_PHYSICAL_SET_STATUS.completed,
  );
  const skippedSets = sets.filter(
    (set) => set.status === MORNING_PHYSICAL_SET_STATUS.skipped,
  ).length;
  const totalSets =
    execution === null
      ? planItems.reduce((total, item) => total + item.sets, 0)
      : eligibleSetIndexes.length;
  const lastEligibleSetIndex = eligibleSetIndexes.at(-1) ?? -1;
  const readyToFinish =
    execution !== null &&
    execution.completedAt === null &&
    execution.activeSetIndex === lastEligibleSetIndex &&
    eligibleSets.every((set) => set.status !== MORNING_PHYSICAL_SET_STATUS.pending);
  const currentSet =
    execution === null
      ? null
      : resolveCurrentSet(
          execution.currentSet,
          eligibleSetIndexes.indexOf(execution.activeSetIndex),
          eligibleSetIndexes.length,
          resolvedPlan,
        );

  return Object.freeze({
    date: source.date,
    mutable,
    state,
    workedDurationMs: execution?.workedDurationAt(source.now) ?? 0,
    selectedExerciseCount: planItems.length,
    totalSets,
    resolvedSets,
    completedSets: completedSets.length,
    skippedSets,
    totalActualReps: completedSets.reduce(
      (total, set) =>
        total +
        (set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions ? set.actualReps : 0),
      0,
    ),
    totalActualDurationSeconds: completedSets.reduce(
      (total, set) =>
        total +
        (set.measurementType === EXERCISE_MEASUREMENT_TYPE.duration
          ? set.actualDurationSeconds
          : 0),
      0,
    ),
    currentSet,
    canRecover: canMutate && state === MORNING_PHYSICAL_EXECUTION_VIEW_STATE.recoverable,
    canPause:
      canMutate &&
      (state === MORNING_PHYSICAL_EXECUTION_VIEW_STATE.running ||
        state === MORNING_PHYSICAL_EXECUTION_VIEW_STATE.awaitingAdvance ||
        state === MORNING_PHYSICAL_EXECUTION_VIEW_STATE.readyToFinish),
    canResume: canMutate && state === MORNING_PHYSICAL_EXECUTION_VIEW_STATE.paused,
    canResolve: canMutate && state === MORNING_PHYSICAL_EXECUTION_VIEW_STATE.running,
    canAdvance: canMutate && state === MORNING_PHYSICAL_EXECUTION_VIEW_STATE.awaitingAdvance,
    canFinish: canMutate && readyToFinish,
  });
}

function resolveState(cycle: MorningCycle | null): MorningPhysicalExecutionViewState {
  const execution = cycle?.physicalExecution ?? null;
  if (execution === null) {
    if (cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.inProgress) {
      return cycle.physicalPlanItems.length > 0
        ? MORNING_PHYSICAL_EXECUTION_VIEW_STATE.recoverable
        : MORNING_PHYSICAL_EXECUTION_VIEW_STATE.unrecoverable;
    }
    if (
      cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.done ||
      cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.skipped
    ) {
      return MORNING_PHYSICAL_EXECUTION_VIEW_STATE.legacyCompleted;
    }
    return MORNING_PHYSICAL_EXECUTION_VIEW_STATE.unavailable;
  }
  if (execution.completedAt !== null) return MORNING_PHYSICAL_EXECUTION_VIEW_STATE.completed;
  if (execution.pausedAt !== null) return MORNING_PHYSICAL_EXECUTION_VIEW_STATE.paused;
  if (execution.currentSet.status === MORNING_PHYSICAL_SET_STATUS.pending) {
    return MORNING_PHYSICAL_EXECUTION_VIEW_STATE.running;
  }
  const eligibleSetIndexes = execution.sets
    .map((_set, index) => index)
    .filter((index) => !execution.suppressedSetIndexes.includes(index));
  if (
    execution.activeSetIndex === eligibleSetIndexes.at(-1) &&
    eligibleSetIndexes.every(
      (index) => execution.sets[index]?.status !== MORNING_PHYSICAL_SET_STATUS.pending,
    )
  ) {
    return MORNING_PHYSICAL_EXECUTION_VIEW_STATE.readyToFinish;
  }
  return MORNING_PHYSICAL_EXECUTION_VIEW_STATE.awaitingAdvance;
}

function resolveCurrentSet(
  set: MorningPhysicalSetExecution,
  activeSetIndex: number,
  globalSetCount: number,
  plan: readonly {
    readonly item: MorningPhysicalPlanItem;
    readonly definition: ExerciseDefinition;
  }[],
): MorningPhysicalExecutionCurrentSet {
  const exerciseIndex = plan.findIndex(({ item }) =>
    item.exerciseDefinitionId.equals(set.exerciseDefinitionId),
  );
  const resolved = plan[exerciseIndex];
  if (resolved === undefined || resolved.item.measurementType !== set.measurementType) {
    throw missingDefinition();
  }
  const common = {
    exerciseDefinitionId: set.exerciseDefinitionId,
    name: resolved.definition.name,
    exerciseIndex: exerciseIndex + 1,
    exerciseCount: plan.length,
    setNumber: set.setNumber,
    setCount: resolved.item.sets,
    globalSetIndex: activeSetIndex + 1,
    globalSetCount,
    status: set.status,
    resolvedAt: set.resolvedAt === null ? null : new Date(set.resolvedAt.getTime()),
  };
  if (set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions) {
    if (resolved.item.measurementType !== EXERCISE_MEASUREMENT_TYPE.repetitions) {
      throw missingDefinition();
    }
    return Object.freeze({
      ...common,
      measurementType: set.measurementType,
      targetReps: resolved.item.targetReps,
      actualReps: set.status === MORNING_PHYSICAL_SET_STATUS.completed ? set.actualReps : null,
    });
  }
  if (resolved.item.measurementType !== EXERCISE_MEASUREMENT_TYPE.duration) {
    throw missingDefinition();
  }
  return Object.freeze({
    ...common,
    measurementType: set.measurementType,
    targetDurationSeconds: resolved.item.targetDurationSeconds,
    actualDurationSeconds:
      set.status === MORNING_PHYSICAL_SET_STATUS.completed ? set.actualDurationSeconds : null,
  });
}

function requireDefinition(
  item: MorningPhysicalPlanItem,
  definitions: ReadonlyMap<string, ExerciseDefinition>,
): ExerciseDefinition {
  const definition = definitions.get(item.exerciseDefinitionId.toString());
  if (definition === undefined || definition.measurementType !== item.measurementType) {
    throw missingDefinition();
  }
  return definition;
}

function missingDefinition(): DomainError {
  return new DomainError(
    'persistence.missing_exercise_definition',
    'План физической активации ссылается на отсутствующее упражнение.',
  );
}
