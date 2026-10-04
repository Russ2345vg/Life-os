import {
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_PHYSICAL_RECOMMENDATION_STATUS,
  MORNING_PHYSICAL_SET_STATUS,
  MORNING_PHYSICAL_STATUS,
  EntityId,
  MorningCycle,
  SYSTEM_EXERCISE_DEFINITION_SEEDS,
  buildMorningPhysicalRecommendation,
  createReadyMorningPhysicalPlan,
  summarizeMorningPhysicalPlan,
  type DayDate,
  type ExerciseMeasurementType,
  type MorningPhysicalPlanItem,
  type MorningPhysicalRecommendationStatus,
  type MorningPhysicalSetExecution,
} from '../../domain';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { ExerciseDefinitionRepository } from './ExerciseDefinitionRepository';
import type { MorningCycleRepository } from './MorningCycleRepository';

export type MorningWorkoutStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface MorningWorkoutSetSnapshot {
  readonly exerciseDefinitionId: string;
  readonly exerciseName: string;
  readonly setNumber: number;
  readonly measurementType: ExerciseMeasurementType;
  readonly target: number;
  readonly status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  readonly actual: number | null;
  readonly current: boolean;
}

export interface MorningWorkoutItemSnapshot {
  readonly exerciseDefinitionId: string;
  readonly exerciseName: string;
  readonly measurementType: ExerciseMeasurementType;
  readonly target: number;
  readonly sets: readonly MorningWorkoutSetSnapshot[];
}

export interface MorningWorkoutRecommendationChange {
  readonly exerciseDefinitionId: string;
  readonly exerciseName: string;
  readonly measurementType: ExerciseMeasurementType;
  readonly from: number;
  readonly to: number;
}

export interface MorningWorkoutRecommendationSnapshot {
  readonly status: MorningPhysicalRecommendationStatus;
  readonly changes: readonly MorningWorkoutRecommendationChange[];
}

export interface MorningWorkoutSnapshot {
  readonly status: MorningWorkoutStatus;
  readonly estimatedMinutes: number;
  readonly totalSets: number;
  readonly completedSets: number;
  readonly focusUnlocked: boolean;
  readonly items: readonly MorningWorkoutItemSnapshot[];
  readonly currentSet: MorningWorkoutSetSnapshot | null;
  readonly recommendation: MorningWorkoutRecommendationSnapshot | null;
}

export interface MorningWorkoutSetCommand {
  readonly exerciseDefinitionId: string;
  readonly setNumber: number;
  readonly actual: number;
}

export interface MorningWorkoutServiceDependencies {
  readonly cycles: MorningCycleRepository;
  readonly exercises: ExerciseDefinitionRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly dayId: EntityId;
  readonly date: DayDate;
}

export class MorningWorkoutService {
  readonly #cycles: MorningCycleRepository;
  readonly #exercises: ExerciseDefinitionRepository;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #dayId: EntityId;
  readonly #date: DayDate;
  #queue: Promise<void> = Promise.resolve();

  public constructor(dependencies: MorningWorkoutServiceDependencies) {
    this.#cycles = dependencies.cycles;
    this.#exercises = dependencies.exercises;
    this.#clock = dependencies.clock;
    this.#ids = dependencies.ids;
    this.#dayId = dependencies.dayId;
    this.#date = dependencies.date;
  }

  public async get(): Promise<MorningWorkoutSnapshot> {
    const cycle = await this.#cycles.findByDate(this.#date);
    return this.snapshot(cycle);
  }

  public start(): Promise<MorningWorkoutSnapshot> {
    return this.exclusive(async () => {
      const now = this.#clock.now();
      const cycle = await this.ensureCycle(now);
      if (cycle.startedAt === null) cycle.start(now);
      if (cycle.physicalPlanItems.length === 0) {
        cycle.configurePhysicalPlan(await this.planForToday(), now);
      }
      if (cycle.physicalStatus === MORNING_PHYSICAL_STATUS.ready) {
        cycle.startPhysicalExecution(now);
      }
      await this.#cycles.save(cycle);
      return this.snapshot(cycle);
    });
  }

  public completeCurrentSet(command: MorningWorkoutSetCommand): Promise<MorningWorkoutSnapshot> {
    return this.resolveCurrentSet(command, false);
  }

  public skipCurrentSet(
    command: Omit<MorningWorkoutSetCommand, 'actual'>,
  ): Promise<MorningWorkoutSnapshot> {
    return this.resolveCurrentSet({ ...command, actual: 0 }, true);
  }

  public skip(): Promise<MorningWorkoutSnapshot> {
    return this.exclusive(async () => {
      const now = this.#clock.now();
      const cycle = await this.ensureCycle(now);
      if (cycle.startedAt === null) cycle.start(now);
      cycle.skipPhysical(now);
      await this.#cycles.save(cycle);
      return this.snapshot(cycle);
    });
  }

  public acceptRecommendation(): Promise<MorningWorkoutSnapshot> {
    return this.resolveRecommendation(true);
  }

  public dismissRecommendation(): Promise<MorningWorkoutSnapshot> {
    return this.resolveRecommendation(false);
  }

  public subscribe(listener: () => void): () => void {
    return this.#cycles.subscribe(listener);
  }

  private resolveCurrentSet(
    command: MorningWorkoutSetCommand,
    skip: boolean,
  ): Promise<MorningWorkoutSnapshot> {
    return this.exclusive(async () => {
      const cycle = await this.requireCycle();
      const execution = cycle.physicalExecution;
      if (execution === null) throw new Error('Зарядка ещё не начата.');
      const current = execution.currentSet;
      const now = this.#clock.now();
      if (skip) {
        cycle.skipPhysicalSet(
          EntityId.create(command.exerciseDefinitionId),
          command.setNumber,
          now,
        );
      } else {
        const identity = EntityId.create(command.exerciseDefinitionId);
        cycle.completePhysicalSet(
          identity,
          command.setNumber,
          current.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
            ? { measurementType: current.measurementType, actualReps: command.actual }
            : { measurementType: current.measurementType, actualDurationSeconds: command.actual },
          now,
        );
      }
      const latest = cycle.physicalExecution!;
      if (latest.activeSetIndex < latest.sets.length - 1) {
        cycle.advancePhysicalExecution(now);
      } else {
        cycle.completePhysicalExecution(now);
        const recommendation = buildMorningPhysicalRecommendation(
          cycle.physicalPlanItems,
          cycle.physicalExecution!,
        );
        if (recommendation !== null) cycle.proposePhysicalRecommendation(recommendation, now);
      }
      await this.#cycles.save(cycle);
      return this.snapshot(cycle);
    });
  }

  private resolveRecommendation(accept: boolean): Promise<MorningWorkoutSnapshot> {
    return this.exclusive(async () => {
      const cycle = await this.requireCycle();
      if (accept) cycle.acceptPhysicalRecommendation(this.#clock.now());
      else cycle.dismissPhysicalRecommendation(this.#clock.now());
      await this.#cycles.save(cycle);
      return this.snapshot(cycle);
    });
  }

  private async ensureCycle(now: Date): Promise<MorningCycle> {
    return (
      (await this.#cycles.findByDate(this.#date)) ??
      MorningCycle.create({
        id: this.#ids.generate(),
        dayId: this.#dayId,
        dateKey: this.#date,
        occurredAt: now,
      })
    );
  }

  private async requireCycle(): Promise<MorningCycle> {
    const cycle = await this.#cycles.findByDate(this.#date);
    if (cycle === null) throw new Error('Зарядка ещё не начата.');
    return cycle;
  }

  private async planForToday(): Promise<readonly MorningPhysicalPlanItem[]> {
    const previous = await this.#cycles.latestBefore(this.#date);
    if (previous === null || previous.physicalPlanItems.length === 0) {
      return createReadyMorningPhysicalPlan();
    }
    return previous.physicalRecommendation?.status ===
      MORNING_PHYSICAL_RECOMMENDATION_STATUS.accepted
      ? previous.physicalRecommendation.planItems
      : previous.physicalPlanItems;
  }

  private async snapshot(cycle: MorningCycle | null): Promise<MorningWorkoutSnapshot> {
    const plan = cycle?.physicalPlanItems.length
      ? cycle.physicalPlanItems
      : createReadyMorningPhysicalPlan();
    const definitions = await this.#exercises.list();
    const names = new Map(definitions.map((definition) => [definition.id.toString(), definition.name]));
    for (const seed of SYSTEM_EXERCISE_DEFINITION_SEEDS) names.set(seed.id, seed.name);
    const execution = cycle?.physicalExecution ?? null;
    const executionSets = execution?.sets ?? [];
    const activeIndex = execution?.activeSetIndex ?? -1;
    let flattenedIndex = 0;
    const items = plan.map((item): MorningWorkoutItemSnapshot => {
      const definitionId = item.exerciseDefinitionId.toString();
      const exerciseName = names.get(definitionId) ?? definitionId;
      const target = targetOf(item);
      const sets = Array.from({ length: item.sets }, (_, setIndex): MorningWorkoutSetSnapshot => {
        const executionSet = executionSets[flattenedIndex];
        const snapshot = setSnapshot(
          executionSet,
          definitionId,
          exerciseName,
          setIndex + 1,
          item.measurementType,
          target,
          flattenedIndex === activeIndex,
        );
        flattenedIndex += 1;
        return snapshot;
      });
      return { exerciseDefinitionId: definitionId, exerciseName, measurementType: item.measurementType, target, sets };
    });
    const sets = items.flatMap((item) => item.sets);
    const status = workoutStatus(cycle);
    const recommendation = cycle?.physicalRecommendation ?? null;
    return {
      status,
      estimatedMinutes: summarizeMorningPhysicalPlan(plan).estimatedMinutes,
      totalSets: sets.length,
      completedSets: sets.filter(({ status: setStatus }) => setStatus !== 'PENDING').length,
      focusUnlocked: status === 'COMPLETED' || status === 'SKIPPED',
      items,
      currentSet: sets.find(({ current, status: setStatus }) => current && setStatus === 'PENDING') ?? null,
      recommendation:
        recommendation === null
          ? null
          : {
              status: recommendation.status,
              changes: recommendation.planItems.flatMap((nextItem) => {
                const currentItem = plan.find(({ exerciseDefinitionId }) =>
                  exerciseDefinitionId.equals(nextItem.exerciseDefinitionId),
                );
                if (currentItem === undefined || targetOf(currentItem) === targetOf(nextItem)) return [];
                const id = nextItem.exerciseDefinitionId.toString();
                return [{
                  exerciseDefinitionId: id,
                  exerciseName: names.get(id) ?? id,
                  measurementType: nextItem.measurementType,
                  from: targetOf(currentItem),
                  to: targetOf(nextItem),
                }];
              }),
            },
    };
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function workoutStatus(cycle: MorningCycle | null): MorningWorkoutStatus {
  if (cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.inProgress) return 'IN_PROGRESS';
  if (cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.done) return 'COMPLETED';
  if (cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.skipped) return 'SKIPPED';
  return 'NOT_STARTED';
}

function targetOf(item: MorningPhysicalPlanItem): number {
  return item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? item.targetReps
    : item.targetDurationSeconds;
}

function setSnapshot(
  set: MorningPhysicalSetExecution | undefined,
  exerciseDefinitionId: string,
  exerciseName: string,
  setNumber: number,
  measurementType: ExerciseMeasurementType,
  target: number,
  current: boolean,
): MorningWorkoutSetSnapshot {
  if (set === undefined) {
    return {
      exerciseDefinitionId,
      exerciseName,
      setNumber,
      measurementType,
      target,
      status: MORNING_PHYSICAL_SET_STATUS.pending,
      actual: null,
      current: false,
    };
  }
  return {
    exerciseDefinitionId,
    exerciseName,
    setNumber,
    measurementType,
    target,
    status: set.status,
    actual:
      set.status !== MORNING_PHYSICAL_SET_STATUS.completed
        ? null
        : set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
          ? set.actualReps
          : set.actualDurationSeconds,
    current,
  };
}
