import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import { EXERCISE_MEASUREMENT_TYPE, type ExerciseMeasurementType } from './ExerciseDefinition';
import {
  assertMorningPhysicalPlanItems,
  type MorningPhysicalPlanItem,
} from './MorningPhysicalPlan';

export const MORNING_PHYSICAL_SET_STATUS = {
  pending: 'PENDING',
  completed: 'COMPLETED',
  skipped: 'SKIPPED',
} as const;

export type MorningPhysicalSetStatus =
  (typeof MORNING_PHYSICAL_SET_STATUS)[keyof typeof MORNING_PHYSICAL_SET_STATUS];

export type MorningPhysicalRemainingSetStrategy = 'keep' | 'shorten' | 'skip';

export type MorningPhysicalSetActual =
  | {
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.repetitions;
      readonly actualReps: number;
    }
  | {
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.duration;
      readonly actualDurationSeconds: number;
    };

interface MorningPhysicalSetCommon {
  readonly exerciseDefinitionId: EntityId;
  readonly setNumber: number;
  readonly measurementType: ExerciseMeasurementType;
}

export type MorningPhysicalSetExecution =
  | (MorningPhysicalSetCommon & {
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.repetitions;
      readonly status: typeof MORNING_PHYSICAL_SET_STATUS.pending;
      readonly actualReps: null;
      readonly resolvedAt: null;
    })
  | (MorningPhysicalSetCommon & {
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.repetitions;
      readonly status: typeof MORNING_PHYSICAL_SET_STATUS.completed;
      readonly actualReps: number;
      readonly resolvedAt: Date;
    })
  | (MorningPhysicalSetCommon & {
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.duration;
      readonly status: typeof MORNING_PHYSICAL_SET_STATUS.pending;
      readonly actualDurationSeconds: null;
      readonly resolvedAt: null;
    })
  | (MorningPhysicalSetCommon & {
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.duration;
      readonly status: typeof MORNING_PHYSICAL_SET_STATUS.completed;
      readonly actualDurationSeconds: number;
      readonly resolvedAt: Date;
    })
  | (MorningPhysicalSetCommon & {
      readonly status: typeof MORNING_PHYSICAL_SET_STATUS.skipped;
      readonly resolvedAt: Date;
    });

export interface MorningPhysicalPauseInterval {
  readonly startedAt: Date;
  readonly endedAt: Date;
}

export interface MorningPhysicalExecutionRehydrationData {
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly pausedAt: Date | null;
  readonly pauseIntervals: readonly MorningPhysicalPauseInterval[];
  readonly activeSetIndex: number;
  readonly sets: readonly MorningPhysicalSetExecution[];
  readonly suppressedSetIndexes?: readonly number[];
  readonly pendingRemainingSetStrategy?: MorningPhysicalRemainingSetStrategy | null;
}

export class MorningPhysicalExecution {
  readonly #startedAt: Date;
  #completedAt: Date | null;
  #pausedAt: Date | null;
  #pauseIntervals: MorningPhysicalPauseInterval[];
  #activeSetIndex: number;
  #sets: MorningPhysicalSetExecution[];
  #suppressedSetIndexes: number[];
  #pendingRemainingSetStrategy: MorningPhysicalRemainingSetStrategy | null;

  private constructor(data: MorningPhysicalExecutionRehydrationData) {
    this.#startedAt = copyDate(data.startedAt);
    this.#completedAt = copyOptionalDate(data.completedAt);
    this.#pausedAt = copyOptionalDate(data.pausedAt);
    this.#pauseIntervals = data.pauseIntervals.map(copyPauseInterval);
    this.#activeSetIndex = data.activeSetIndex;
    this.#sets = data.sets.map(copySet);
    this.#suppressedSetIndexes = [...(data.suppressedSetIndexes ?? [])];
    this.#pendingRemainingSetStrategy = data.pendingRemainingSetStrategy ?? null;
  }

  public static start(
    plan: readonly MorningPhysicalPlanItem[],
    startedAt: Date,
  ): MorningPhysicalExecution {
    assertDate(startedAt);
    assertMorningPhysicalPlanItems(plan);
    if (plan.length === 0) throw invalidExecution();

    const sets: MorningPhysicalSetExecution[] = plan.flatMap((item) =>
      Array.from({ length: item.sets }, (_, index): MorningPhysicalSetExecution =>
        item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
          ? {
              exerciseDefinitionId: item.exerciseDefinitionId,
              setNumber: index + 1,
              measurementType: item.measurementType,
              status: MORNING_PHYSICAL_SET_STATUS.pending,
              actualReps: null,
              resolvedAt: null,
            }
          : {
              exerciseDefinitionId: item.exerciseDefinitionId,
              setNumber: index + 1,
              measurementType: item.measurementType,
              status: MORNING_PHYSICAL_SET_STATUS.pending,
              actualDurationSeconds: null,
              resolvedAt: null,
            },
      ),
    );

    return new MorningPhysicalExecution({
      startedAt,
      completedAt: null,
      pausedAt: null,
      pauseIntervals: [],
      activeSetIndex: 0,
      sets,
      suppressedSetIndexes: [],
      pendingRemainingSetStrategy: null,
    });
  }

  public static rehydrate(data: MorningPhysicalExecutionRehydrationData): MorningPhysicalExecution {
    assertRehydrationData(data);
    return new MorningPhysicalExecution(data);
  }

  public get startedAt(): Date {
    return copyDate(this.#startedAt);
  }

  public get completedAt(): Date | null {
    return copyOptionalDate(this.#completedAt);
  }

  public get pausedAt(): Date | null {
    return copyOptionalDate(this.#pausedAt);
  }

  public get pauseIntervals(): readonly MorningPhysicalPauseInterval[] {
    return this.#pauseIntervals.map(copyPauseInterval);
  }

  public get activeSetIndex(): number {
    return this.#activeSetIndex;
  }

  public get sets(): readonly MorningPhysicalSetExecution[] {
    return this.#sets.map(copySet);
  }

  public get suppressedSetIndexes(): readonly number[] {
    return [...this.#suppressedSetIndexes];
  }

  public get pendingRemainingSetStrategy(): MorningPhysicalRemainingSetStrategy | null {
    return this.#pendingRemainingSetStrategy;
  }

  public get currentSet(): MorningPhysicalSetExecution {
    return copySet(this.#sets[this.#activeSetIndex]!);
  }

  public copy(): MorningPhysicalExecution {
    return new MorningPhysicalExecution({
      startedAt: this.#startedAt,
      completedAt: this.#completedAt,
      pausedAt: this.#pausedAt,
      pauseIntervals: this.#pauseIntervals,
      activeSetIndex: this.#activeSetIndex,
      sets: this.#sets,
      suppressedSetIndexes: this.#suppressedSetIndexes,
      pendingRemainingSetStrategy: this.#pendingRemainingSetStrategy,
    });
  }

  public requestRemainingSetStrategy(strategy: MorningPhysicalRemainingSetStrategy): boolean {
    this.assertIncomplete();
    if (!isRemainingSetStrategy(strategy)) throw invalidExecution();
    if (strategy === 'keep') return this.cancelPendingRemainingSetStrategy();
    if (this.#pendingRemainingSetStrategy === strategy) return false;
    this.#pendingRemainingSetStrategy = strategy;
    return true;
  }

  public cancelPendingRemainingSetStrategy(): boolean {
    this.assertIncomplete();
    if (this.#pendingRemainingSetStrategy === null) return false;
    this.#pendingRemainingSetStrategy = null;
    return true;
  }

  public pause(occurredAt: Date): boolean {
    this.assertIncomplete();
    if (this.#pausedAt !== null) return false;
    this.assertTransitionTime(occurredAt);
    this.#pausedAt = copyDate(occurredAt);
    return true;
  }

  public resume(occurredAt: Date): boolean {
    this.assertIncomplete();
    if (this.#pausedAt === null) return false;
    this.assertTransitionTime(occurredAt);
    this.#pauseIntervals.push({
      startedAt: copyDate(this.#pausedAt),
      endedAt: copyDate(occurredAt),
    });
    this.#pausedAt = null;
    return true;
  }

  public completeSet(
    exerciseDefinitionId: EntityId,
    setNumber: number,
    actual: MorningPhysicalSetActual,
    occurredAt: Date,
  ): void {
    const current = this.assertSetCanResolve(exerciseDefinitionId, setNumber, occurredAt);
    if (current.measurementType !== actual.measurementType) {
      throw new DomainError(
        'morning_physical_execution.measurement_mismatch',
        'Тип фактического результата не соответствует подходу.',
      );
    }

    if (actual.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions) {
      assertActual(actual.actualReps, 1, 1000);
      this.#sets[this.#activeSetIndex] = {
        exerciseDefinitionId: current.exerciseDefinitionId,
        setNumber: current.setNumber,
        measurementType: actual.measurementType,
        status: MORNING_PHYSICAL_SET_STATUS.completed,
        actualReps: actual.actualReps,
        resolvedAt: copyDate(occurredAt),
      };
      return;
    }

    assertActual(actual.actualDurationSeconds, 1, 3600);
    this.#sets[this.#activeSetIndex] = {
      exerciseDefinitionId: current.exerciseDefinitionId,
      setNumber: current.setNumber,
      measurementType: actual.measurementType,
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualDurationSeconds: actual.actualDurationSeconds,
      resolvedAt: copyDate(occurredAt),
    };
  }

  public skipSet(exerciseDefinitionId: EntityId, setNumber: number, occurredAt: Date): void {
    const current = this.assertSetCanResolve(exerciseDefinitionId, setNumber, occurredAt);
    this.#sets[this.#activeSetIndex] = {
      exerciseDefinitionId: current.exerciseDefinitionId,
      setNumber: current.setNumber,
      measurementType: current.measurementType,
      status: MORNING_PHYSICAL_SET_STATUS.skipped,
      resolvedAt: copyDate(occurredAt),
    };
  }

  public advance(): boolean {
    this.assertIncomplete();
    this.assertNotPaused();
    if (this.#sets[this.#activeSetIndex]?.status === MORNING_PHYSICAL_SET_STATUS.pending) {
      throw new DomainError(
        'morning_physical_execution.current_set_pending',
        'Сначала завершите или пропустите текущий подход.',
      );
    }
    this.applyPendingRemainingSetStrategy();
    const nextSetIndex = this.#sets.findIndex(
      (_set, index) => index > this.#activeSetIndex && !this.#suppressedSetIndexes.includes(index),
    );
    if (nextSetIndex < 0) {
      if (this.#suppressedSetIndexes.some((index) => index > this.#activeSetIndex)) return false;
      throw new DomainError('morning_physical_execution.no_next_set', 'Следующего подхода нет.');
    }
    this.#activeSetIndex = nextSetIndex;
    return true;
  }

  public complete(occurredAt: Date): boolean {
    if (this.#completedAt !== null) return false;
    const allRequiredResolved = this.#sets.every(
      (set, index) =>
        this.#suppressedSetIndexes.includes(index) ||
        set.status !== MORNING_PHYSICAL_SET_STATUS.pending,
    );
    const lastRequiredIndex = this.#sets.reduce(
      (latest, _set, index) => (this.#suppressedSetIndexes.includes(index) ? latest : index),
      -1,
    );
    if (!allRequiredResolved || this.#activeSetIndex !== lastRequiredIndex) {
      throw new DomainError(
        'morning_physical_execution.not_ready_to_complete',
        'Сначала разрешите все подходы и откройте последний результат.',
      );
    }
    this.assertTransitionTime(occurredAt);
    if (this.#pausedAt !== null) {
      this.#pauseIntervals.push({
        startedAt: copyDate(this.#pausedAt),
        endedAt: copyDate(occurredAt),
      });
      this.#pausedAt = null;
    }
    this.#pendingRemainingSetStrategy = null;
    this.#completedAt = copyDate(occurredAt);
    return true;
  }

  public workedDurationAt(now: Date): number {
    assertDate(now);
    if (now.getTime() < this.#startedAt.getTime()) {
      throw new DomainError(
        'morning_physical_execution.time_before_start',
        'Нельзя рассчитать длительность до начала выполнения.',
      );
    }
    if (this.#completedAt === null && now.getTime() < this.lastTransitionAt().getTime()) {
      throw new DomainError(
        'morning_physical_execution.time_before_last_transition',
        'Момент расчёта не может быть раньше последнего перехода.',
      );
    }

    const effectiveNow = this.#completedAt ?? now;
    const elapsed = effectiveNow.getTime() - this.#startedAt.getTime();
    const closedPauseDuration = this.#pauseIntervals.reduce(
      (total, interval) => total + interval.endedAt.getTime() - interval.startedAt.getTime(),
      0,
    );
    const openPauseDuration =
      this.#pausedAt === null ? 0 : effectiveNow.getTime() - this.#pausedAt.getTime();
    const worked = elapsed - closedPauseDuration - openPauseDuration;
    if (worked < 0) throw invalidExecution();
    return worked;
  }

  private assertSetCanResolve(
    exerciseDefinitionId: EntityId,
    setNumber: number,
    occurredAt: Date,
  ): MorningPhysicalSetExecution {
    this.assertIncomplete();
    this.assertNotPaused();
    const current = this.#sets[this.#activeSetIndex]!;
    if (
      !current.exerciseDefinitionId.equals(exerciseDefinitionId) ||
      current.setNumber !== setNumber
    ) {
      throw new DomainError(
        'morning_physical_execution.stale_set',
        'Текущий подход изменился. Обновите экран и повторите действие.',
      );
    }
    if (current.status !== MORNING_PHYSICAL_SET_STATUS.pending) {
      throw new DomainError(
        'morning_physical_execution.set_resolved',
        'Результат этого подхода уже записан.',
      );
    }
    this.assertTransitionTime(occurredAt);
    return current;
  }

  private applyPendingRemainingSetStrategy(): void {
    const strategy = this.#pendingRemainingSetStrategy;
    if (strategy === null) return;
    const futureIndexes = this.#sets
      .map((_set, index) => index)
      .filter((index) => index > this.#activeSetIndex);
    if (strategy === 'skip') {
      this.#suppressedSetIndexes = uniqueSorted([...this.#suppressedSetIndexes, ...futureIndexes]);
    } else {
      const currentExerciseId = this.#sets[this.#activeSetIndex]!.exerciseDefinitionId.toString();
      const keptExerciseIds = new Set([currentExerciseId]);
      const suppressed = futureIndexes.filter((index) => {
        const exerciseId = this.#sets[index]!.exerciseDefinitionId.toString();
        if (!keptExerciseIds.has(exerciseId)) {
          keptExerciseIds.add(exerciseId);
          return false;
        }
        return true;
      });
      this.#suppressedSetIndexes = uniqueSorted([...this.#suppressedSetIndexes, ...suppressed]);
    }
    this.#pendingRemainingSetStrategy = null;
  }

  private assertIncomplete(): void {
    if (this.#completedAt !== null) {
      throw new DomainError(
        'morning_physical_execution.completed',
        'Физическая активация уже завершена.',
      );
    }
  }

  private assertNotPaused(): void {
    if (this.#pausedAt !== null) {
      throw new DomainError(
        'morning_physical_execution.paused',
        'Сначала возобновите физическую активацию.',
      );
    }
  }

  private assertTransitionTime(occurredAt: Date): void {
    assertDate(occurredAt);
    if (occurredAt.getTime() < this.lastTransitionAt().getTime()) {
      throw new DomainError(
        'morning_physical_execution.time_before_last_transition',
        'Время перехода не может быть раньше предыдущего действия.',
      );
    }
  }

  private lastTransitionAt(): Date {
    const candidates = [
      this.#startedAt,
      this.#pausedAt,
      this.#pauseIntervals.at(-1)?.endedAt,
      ...this.#sets.map((set) => set.resolvedAt),
    ].filter((value): value is Date => value !== null && value !== undefined);
    return candidates.reduce((latest, value) =>
      value.getTime() > latest.getTime() ? value : latest,
    );
  }
}

function assertRehydrationData(data: MorningPhysicalExecutionRehydrationData): void {
  if (typeof data !== 'object' || data === null) throw invalidExecution();
  assertDate(data.startedAt);
  assertOptionalDate(data.completedAt);
  assertOptionalDate(data.pausedAt);
  if (!Array.isArray(data.pauseIntervals) || !Array.isArray(data.sets)) {
    throw invalidExecution();
  }
  if (
    data.sets.length === 0 ||
    !Number.isInteger(data.activeSetIndex) ||
    data.activeSetIndex < 0 ||
    data.activeSetIndex >= data.sets.length
  ) {
    throw invalidExecution();
  }
  if (
    data.completedAt !== null &&
    (data.pausedAt !== null || data.pendingRemainingSetStrategy != null)
  ) {
    throw invalidExecution();
  }
  const suppressedSetIndexes = data.suppressedSetIndexes ?? [];
  if (
    !Array.isArray(suppressedSetIndexes) ||
    suppressedSetIndexes.some(
      (index) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index >= data.sets.length ||
        index === data.activeSetIndex,
    ) ||
    new Set(suppressedSetIndexes).size !== suppressedSetIndexes.length ||
    (data.pendingRemainingSetStrategy !== undefined &&
      data.pendingRemainingSetStrategy !== null &&
      !isRemainingSetStrategy(data.pendingRemainingSetStrategy))
  ) {
    throw invalidExecution();
  }

  assertPauseIntervals(data);
  assertSetSequence(data);

  if (data.completedAt === null) {
    for (let index = 0; index < data.sets.length; index += 1) {
      const pending = data.sets[index]?.status === MORNING_PHYSICAL_SET_STATUS.pending;
      if (index < data.activeSetIndex && pending && !suppressedSetIndexes.includes(index)) {
        throw invalidExecution();
      }
      if (index > data.activeSetIndex && !pending) throw invalidExecution();
    }
    return;
  }

  if (
    data.completedAt.getTime() < data.startedAt.getTime() ||
    data.activeSetIndex !==
      data.sets.reduce(
        (latest, _set, index) => (suppressedSetIndexes.includes(index) ? latest : index),
        -1,
      ) ||
    data.sets.some(
      (set, index) =>
        set.status === MORNING_PHYSICAL_SET_STATUS.pending && !suppressedSetIndexes.includes(index),
    )
  ) {
    throw invalidExecution();
  }
  const latestResolvedAt = data.sets.reduce(
    (latest, set) =>
      set.resolvedAt !== null && set.resolvedAt.getTime() > latest
        ? set.resolvedAt.getTime()
        : latest,
    data.startedAt.getTime(),
  );
  if (data.completedAt.getTime() < latestResolvedAt) throw invalidExecution();
}

function isRemainingSetStrategy(value: unknown): value is MorningPhysicalRemainingSetStrategy {
  return value === 'keep' || value === 'shorten' || value === 'skip';
}

function uniqueSorted(indexes: readonly number[]): number[] {
  return [...new Set(indexes)].sort((left, right) => left - right);
}

function assertPauseIntervals(data: MorningPhysicalExecutionRehydrationData): void {
  let previousEnd = data.startedAt.getTime();
  for (const interval of data.pauseIntervals) {
    if (typeof interval !== 'object' || interval === null) throw invalidExecution();
    assertDate(interval.startedAt);
    assertDate(interval.endedAt);
    if (
      interval.startedAt.getTime() < previousEnd ||
      interval.endedAt.getTime() < interval.startedAt.getTime()
    ) {
      throw invalidExecution();
    }
    previousEnd = interval.endedAt.getTime();
  }
  if (data.pausedAt !== null && data.pausedAt.getTime() < previousEnd) throw invalidExecution();
  if (data.completedAt !== null && data.completedAt.getTime() < previousEnd) {
    throw invalidExecution();
  }
}

function assertSetSequence(data: MorningPhysicalExecutionRehydrationData): void {
  const seenExerciseIds = new Set<string>();
  let previousExerciseId: string | null = null;
  let previousSetNumber = 0;
  let previousMeasurementType: ExerciseMeasurementType | null = null;
  let previousResolvedAt = data.startedAt.getTime();

  for (const set of data.sets) {
    if (typeof set !== 'object' || set === null) throw invalidExecution();
    if (!(set.exerciseDefinitionId instanceof EntityId)) throw invalidExecution();
    const exerciseId = set.exerciseDefinitionId.toString();
    if (!Number.isInteger(set.setNumber) || set.setNumber < 1) throw invalidExecution();

    if (exerciseId === previousExerciseId) {
      if (
        set.setNumber !== previousSetNumber + 1 ||
        set.measurementType !== previousMeasurementType
      ) {
        throw invalidExecution();
      }
    } else {
      if (seenExerciseIds.has(exerciseId) || set.setNumber !== 1) throw invalidExecution();
      seenExerciseIds.add(exerciseId);
    }
    assertSetFields(set, data.startedAt, data.completedAt, data.pausedAt);
    if (set.resolvedAt !== null) {
      const resolvedAtMs = set.resolvedAt.getTime();
      if (
        data.pauseIntervals.some(
          (interval) =>
            resolvedAtMs > interval.startedAt.getTime() &&
            resolvedAtMs < interval.endedAt.getTime(),
        )
      ) {
        throw invalidExecution();
      }
      if (resolvedAtMs < previousResolvedAt) throw invalidExecution();
      previousResolvedAt = resolvedAtMs;
    }
    previousExerciseId = exerciseId;
    previousSetNumber = set.setNumber;
    previousMeasurementType = set.measurementType;
  }
}

function assertSetFields(
  set: MorningPhysicalSetExecution,
  startedAt: Date,
  completedAt: Date | null,
  pausedAt: Date | null,
): void {
  if (
    set.measurementType !== EXERCISE_MEASUREMENT_TYPE.repetitions &&
    set.measurementType !== EXERCISE_MEASUREMENT_TYPE.duration
  ) {
    throw invalidExecution();
  }
  const hasActualReps = Object.hasOwn(set, 'actualReps');
  const hasActualDuration = Object.hasOwn(set, 'actualDurationSeconds');
  if (set.status === MORNING_PHYSICAL_SET_STATUS.skipped) {
    if (hasActualReps || hasActualDuration) throw invalidExecution();
    assertResolutionTime(set.resolvedAt, startedAt, completedAt, pausedAt);
    return;
  }
  if (set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions) {
    if (!hasActualReps || hasActualDuration) throw invalidExecution();
    if (set.status === MORNING_PHYSICAL_SET_STATUS.pending) {
      if (set.actualReps !== null || set.resolvedAt !== null) throw invalidExecution();
      return;
    }
    if (set.status !== MORNING_PHYSICAL_SET_STATUS.completed) throw invalidExecution();
    assertActual(set.actualReps, 1, 1000);
    assertResolutionTime(set.resolvedAt, startedAt, completedAt, pausedAt);
    return;
  }
  if (set.measurementType === EXERCISE_MEASUREMENT_TYPE.duration) {
    if (!hasActualDuration || hasActualReps) throw invalidExecution();
    if (set.status === MORNING_PHYSICAL_SET_STATUS.pending) {
      if (set.actualDurationSeconds !== null || set.resolvedAt !== null) {
        throw invalidExecution();
      }
      return;
    }
    if (set.status !== MORNING_PHYSICAL_SET_STATUS.completed) throw invalidExecution();
    assertActual(set.actualDurationSeconds, 1, 3600);
    assertResolutionTime(set.resolvedAt, startedAt, completedAt, pausedAt);
    return;
  }
  throw invalidExecution();
}

function assertResolutionTime(
  resolvedAt: Date,
  startedAt: Date,
  completedAt: Date | null,
  pausedAt: Date | null,
): void {
  assertDate(resolvedAt);
  if (resolvedAt.getTime() < startedAt.getTime()) throw invalidExecution();
  if (completedAt !== null && resolvedAt.getTime() > completedAt.getTime()) {
    throw invalidExecution();
  }
  if (pausedAt !== null && resolvedAt.getTime() > pausedAt.getTime()) throw invalidExecution();
}

function assertActual(value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || !Number.isFinite(value) || value < min || value > max) {
    throw new DomainError(
      'morning_physical_execution.invalid_actual',
      'Фактический результат подхода указан неверно.',
    );
  }
}

function assertOptionalDate(value: Date | null): void {
  if (value !== null) assertDate(value);
}

function assertDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw invalidExecution();
}

function copyPauseInterval(interval: MorningPhysicalPauseInterval): MorningPhysicalPauseInterval {
  return { startedAt: copyDate(interval.startedAt), endedAt: copyDate(interval.endedAt) };
}

function copySet(set: MorningPhysicalSetExecution): MorningPhysicalSetExecution {
  const common = {
    exerciseDefinitionId: set.exerciseDefinitionId,
    setNumber: set.setNumber,
    measurementType: set.measurementType,
    status: set.status,
  };
  if (set.status === MORNING_PHYSICAL_SET_STATUS.skipped) {
    return { ...common, status: set.status, resolvedAt: copyDate(set.resolvedAt) };
  }
  if (set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions) {
    return set.status === MORNING_PHYSICAL_SET_STATUS.pending
      ? {
          ...common,
          measurementType: set.measurementType,
          status: set.status,
          actualReps: null,
          resolvedAt: null,
        }
      : {
          ...common,
          measurementType: set.measurementType,
          status: set.status,
          actualReps: set.actualReps,
          resolvedAt: copyDate(set.resolvedAt),
        };
  }
  return set.status === MORNING_PHYSICAL_SET_STATUS.pending
    ? {
        ...common,
        measurementType: set.measurementType,
        status: set.status,
        actualDurationSeconds: null,
        resolvedAt: null,
      }
    : {
        ...common,
        measurementType: set.measurementType,
        status: set.status,
        actualDurationSeconds: set.actualDurationSeconds,
        resolvedAt: copyDate(set.resolvedAt),
      };
}

function invalidExecution(): DomainError {
  return new DomainError(
    'morning_physical_execution.invalid_data',
    'Данные выполнения физической активации некорректны.',
  );
}
