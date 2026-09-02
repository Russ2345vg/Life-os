import {
  MORNING_CYCLE_STATE,
  MorningCycle,
  type DayDate,
  type EntityId,
  type MorningPhysicalPlanAdjustment,
  type MorningPhysicalSetActual,
  type MorningStartStateInput,
  type MorningShortenedConfiguration,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';
import type { ExerciseDefinitionRepository } from '../ports/ExerciseDefinitionRepository';

type MorningMutation = (cycle: MorningCycle, occurredAt: Date) => void;

export interface MorningMainActionReadinessReader {
  execute(date: DayDate): Promise<{ readonly ready: boolean }>;
}

export interface MorningCycleContext {
  readonly current: MorningCycle | null;
  readonly previousUnfinished: MorningCycle | null;
}

export class MorningCycleApplicationService {
  public constructor(
    private readonly cycles: MorningCycleRepository,
    private readonly days: DayRepository,
    private readonly currentDate: CurrentDateProvider,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly exerciseDefinitions?: ExerciseDefinitionRepository,
    private readonly mainActions?: MorningMainActionReadinessReader,
  ) {}

  public get(date: DayDate): Promise<MorningCycle | null> {
    return this.cycles.findByDateKey(date);
  }

  public async getCurrentContext(): Promise<MorningCycleContext> {
    const today = this.currentDate.getCurrentDate();
    const [candidate, previousUnfinished] = await Promise.all([
      this.cycles.findByDateKey(today),
      this.cycles.findLatestUnfinishedBefore(today),
    ]);
    return Object.freeze({
      current: candidate?.isActive() === true ? candidate : null,
      previousUnfinished,
    });
  }

  public async start(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    const cycle = await this.getOrCreateCycle(date);
    if (cycle.startedAt !== null) return cycle;
    return this.mutate(date, (current, occurredAt) => current.start(occurredAt));
  }

  public async recordStartState(
    date: DayDate,
    input: MorningStartStateInput,
  ): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    await this.getOrCreateCycle(date);
    return this.mutate(date, (current, occurredAt) => current.recordStartState(input, occurredAt));
  }

  private async getOrCreateCycle(date: DayDate): Promise<MorningCycle> {
    const day = await this.days.findByDate(date);
    if (day === null) {
      throw new DomainError('morning_cycle.day_not_found', 'День для утреннего блока не найден.');
    }
    let cycle = await this.cycles.findByDayId(day.id);
    if (cycle === null || cycle.startedAt === null) {
      const previousUnfinished = await this.cycles.findLatestUnfinishedBefore(date);
      if (previousUnfinished !== null) {
        throw new DomainError(
          'morning_cycle.previous_unfinished_requires_resolution',
          'Сначала закройте незавершённый утренний блок прошлого дня.',
        );
      }
    }
    if (cycle === null) {
      cycle = await this.cycles.createIfAbsent(
        MorningCycle.create({
          id: this.ids.generate(),
          dayId: day.id,
          dateKey: day.date,
          occurredAt: this.clock.now(),
        }),
      );
    }
    if (!cycle.dayId.equals(day.id) || !cycle.dateKey.equals(day.date)) {
      throw new DomainError(
        'morning_cycle.identity_conflict',
        'Утренний блок связан с другим жизненным днём.',
      );
    }
    return cycle;
  }

  public completeWater(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.completeWater(occurredAt, 250));
  }

  public shorten(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.shorten(occurredAt));
  }

  public completeColdShower(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.completeColdShower(occurredAt));
  }

  public skipColdShower(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.skipColdShower(occurredAt));
  }

  public skipPhysical(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.skipPhysical(occurredAt));
  }

  public async selectPhysicalExercise(
    date: DayDate,
    definitionId: EntityId,
  ): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    const definition = await this.exerciseDefinitions?.findById(definitionId);
    if (definition == null || definition.archivedAt !== null) {
      throw new DomainError(
        'exercise_definition.not_available',
        'Упражнение недоступно для выбора.',
      );
    }
    return this.mutate(date, (cycle, occurredAt) =>
      cycle.selectPhysicalExercise(definition.id, definition.measurementType, occurredAt),
    );
  }

  public deselectPhysicalExercise(date: DayDate, definitionId: EntityId): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) =>
      cycle.deselectPhysicalExercise(definitionId, occurredAt),
    );
  }

  public adjustPhysicalExercise(
    date: DayDate,
    definitionId: EntityId,
    adjustment: MorningPhysicalPlanAdjustment,
  ): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) =>
      cycle.adjustPhysicalExercise(definitionId, adjustment, occurredAt),
    );
  }

  public startPhysicalExecution(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.startPhysicalExecution(occurredAt));
  }

  public recoverPhysicalExecution(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.recoverPhysicalExecution(occurredAt));
  }

  public pausePhysicalExecution(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.pausePhysicalExecution(occurredAt));
  }

  public resumePhysicalExecution(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.resumePhysicalExecution(occurredAt));
  }

  public completePhysicalSet(
    date: DayDate,
    exerciseDefinitionId: EntityId,
    setNumber: number,
    actual: MorningPhysicalSetActual,
  ): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) =>
      cycle.completePhysicalSet(exerciseDefinitionId, setNumber, actual, occurredAt),
    );
  }

  public skipPhysicalSet(
    date: DayDate,
    exerciseDefinitionId: EntityId,
    setNumber: number,
  ): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) =>
      cycle.skipPhysicalSet(exerciseDefinitionId, setNumber, occurredAt),
    );
  }

  public advancePhysicalExecution(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.advancePhysicalExecution(occurredAt));
  }

  public completePhysicalExecution(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.completePhysicalExecution(occurredAt));
  }

  public activateShortened(
    date: DayDate,
    configuration: MorningShortenedConfiguration,
  ): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) =>
      cycle.activateShortened(configuration, occurredAt),
    );
  }

  public revertShortened(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.revertShortened(occurredAt));
  }

  public completeMirror(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.completeMirror(occurredAt));
  }

  public skipMainAction(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.skipMainAction(occurredAt));
  }

  public reconcileReadyToWork(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, () => undefined);
  }

  public async finish(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    await this.reconcileReadyToWork(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.finish(occurredAt));
  }

  public async abandonUnfinished(date: DayDate): Promise<MorningCycle> {
    if (!date.isBefore(this.currentDate.getCurrentDate())) {
      throw new DomainError(
        'morning_cycle.previous_date_required',
        'Как незавершённый можно закрыть только утренний блок прошлого дня.',
      );
    }
    return this.mutate(date, (cycle, occurredAt) => cycle.abandon(occurredAt), false);
  }

  private assertCurrentDate(date: DayDate): void {
    if (!date.equals(this.currentDate.getCurrentDate())) {
      throw new DomainError(
        'morning_cycle.current_date_required',
        'Изменять утренний блок можно только для текущего дня.',
      );
    }
  }

  private async mutate(
    date: DayDate,
    mutation: MorningMutation,
    reconcileReadiness = true,
  ): Promise<MorningCycle> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const stored = await this.cycles.findByDateKey(date);
      if (stored === null) {
        throw new DomainError('morning_cycle.not_found', 'Сначала начните утренний блок.');
      }
      const cycle = cloneMorningCycle(stored);
      const expectedVersion = cycle.version;
      const occurredAt = this.clock.now();
      mutation(cycle, occurredAt);
      if (
        reconcileReadiness &&
        this.mainActions !== undefined &&
        cycle.state === MORNING_CYCLE_STATE.inProgress
      ) {
        const mainAction = await this.mainActions.execute(date);
        cycle.markReadyToWork(mainAction.ready, occurredAt);
      }
      if (cycle.version === expectedVersion) return cycle;
      if (await this.cycles.saveIfVersionMatches(cycle, expectedVersion)) return cycle;
    }
    throw new DomainError(
      'morning_cycle.concurrent_change',
      'Утренний блок изменился в другом окне. Повторите операцию.',
    );
  }
}

export function cloneMorningCycle(cycle: MorningCycle): MorningCycle {
  return MorningCycle.rehydrate({
    id: cycle.id,
    dayId: cycle.dayId,
    dateKey: cycle.dateKey,
    state: cycle.state,
    startedAt: cycle.startedAt,
    finishedAt: cycle.finishedAt,
    startState: cycle.startState,
    shortenedMode: cycle.shortenedMode,
    shortenedModeState: cycle.shortenedModeState,
    shortenedConfiguration: cycle.shortenedConfiguration,
    stageStates: cycle.stageStates,
    waterCompletedAt: cycle.waterCompletedAt,
    waterAmountMl: cycle.waterAmountMl,
    physicalStatus: cycle.physicalStatus,
    physicalUpdatedAt: cycle.physicalUpdatedAt,
    physicalPlanItems: cycle.physicalPlanItems,
    physicalExecution: cycle.physicalExecution,
    updatedAt: cycle.updatedAt,
    version: cycle.version,
  });
}
