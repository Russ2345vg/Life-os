import {
  DAY_STATUS,
  Day,
  EVENING_CYCLE_MODE,
  EVENING_MODE_REASON,
  EVENING_CYCLE_STATE,
  EveningCycle,
  type DayDate,
  type EveningCycleMode,
  type EveningModeReason,
  type OpenLoopReference,
  EntityId,
  type OpenLoopEntityType,
  type OpenLoopResolutionKind,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
  ReflectionResult,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { DayRepository } from '../ports/DayRepository';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import type { IdGenerator } from '../ports/IdGenerator';

type CycleMutation = (cycle: EveningCycle, occurredAt: Date) => void;

export class EveningCycleApplicationService {
  readonly #cycles: EveningCycleRepository;
  readonly #days: DayRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    cycles: EveningCycleRepository,
    days: DayRepository,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#cycles = cycles;
    this.#days = days;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async get(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.#cycles.findByDateKey(dateKey);
  }

  public preview(day: Day): EveningCycle {
    return EveningCycle.create({
      id: EntityId.create(`evening-preview:${day.id.toString()}`),
      dayId: day.id,
      dateKey: day.date,
      occurredAt: day.createdAt,
    });
  }

  public async start(
    dateKey: DayDate,
    mode: EveningCycleMode = EVENING_CYCLE_MODE.normal,
    modeReason: EveningModeReason | null = mode === EVENING_CYCLE_MODE.normal
      ? null
      : EVENING_MODE_REASON.userSelected,
  ): Promise<EveningCycle> {
    const day = await this.ensureOpenDay(dateKey);
    let cycle = await this.#cycles.findByDayId(day.id);
    if (cycle === null) {
      const occurredAt = this.#clock.now();
      const candidate = EveningCycle.create({
        id: this.#idGenerator.generate(),
        dayId: day.id,
        dateKey: day.date,
        occurredAt,
        mode,
        modeReason,
      });
      if (day.status === DAY_STATUS.completed) {
        recoverCompletedCycle(candidate, day.completedAt ?? occurredAt);
      } else if (day.status === DAY_STATUS.open) {
        candidate.start(occurredAt);
      }
      cycle = await this.#cycles.createIfAbsent(candidate);
    }
    if (!cycle.dayId.equals(day.id) || !cycle.dateKey.equals(day.date)) {
      throw new DomainError(
        'evening_cycle.identity_conflict',
        'Вечерний цикл связан с другим жизненным днём.',
      );
    }
    if (cycle.state !== EVENING_CYCLE_STATE.notStarted) return cycle;
    return this.mutate(dateKey, (current, occurredAt) => current.start(occurredAt));
  }

  public async startShort(dateKey: DayDate): Promise<EveningCycle> {
    const day = await this.ensureOpenDay(dateKey);
    let cycle = await this.#cycles.findByDayId(day.id);
    if (cycle === null) {
      const occurredAt = this.#clock.now();
      const candidate = EveningCycle.create({
        id: this.#idGenerator.generate(),
        dayId: day.id,
        dateKey: day.date,
        occurredAt,
      });
      candidate.startShort(occurredAt);
      cycle = await this.#cycles.createIfAbsent(candidate);
    }
    if (!cycle.dayId.equals(day.id) || !cycle.dateKey.equals(day.date)) {
      throw new DomainError(
        'evening_cycle.identity_conflict',
        'Вечерний цикл связан с другим жизненным днём.',
      );
    }
    if (cycle.state !== EVENING_CYCLE_STATE.notStarted) return cycle;
    return this.mutate(dateKey, (current, occurredAt) => current.startShort(occurredAt));
  }

  private async ensureOpenDay(dateKey: DayDate): Promise<Day> {
    let day = await this.#days.findByDate(dateKey);
    if (day === null) {
      const occurredAt = this.#clock.now();
      const candidate = Day.openCurrent({
        id: this.#idGenerator.generate(),
        currentDate: dateKey,
        occurredAt,
        createdEventId: this.#idGenerator.generate(),
        openedEventId: this.#idGenerator.generate(),
      });
      await this.#days.save(candidate);
      day = (await this.#days.findByDate(dateKey)) ?? candidate;
    }

    if (day.status !== DAY_STATUS.planned) return day;

    const expectedVersion = day.version;
    day.open(dateKey, this.#clock.now(), this.#idGenerator.generate());
    if (await this.#days.saveIfVersionMatches(day, expectedVersion)) return day;

    const concurrent = await this.#days.findByDate(dateKey);
    if (concurrent !== null && concurrent.status !== DAY_STATUS.planned) return concurrent;
    throw new DomainError(
      'day.concurrent_change',
      'Состояние дня изменилось в другом окне. Повторите операцию.',
    );
  }

  public selectMode(
    dateKey: DayDate,
    mode: EveningCycleMode,
    reason: EveningModeReason = EVENING_MODE_REASON.userSelected,
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.switchMode(mode, reason, occurredAt);
    });
  }

  public beginResolving(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.beginResolving(occurredAt));
  }

  public initializeOpenLoops(
    dateKey: DayDate,
    references: readonly OpenLoopReference[],
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) =>
      cycle.initializeOpenLoops(references, occurredAt),
    );
  }

  public recordOpenLoopResolution(
    dateKey: DayDate,
    entityType: OpenLoopEntityType,
    entityId: EntityId,
    resolution: Exclude<OpenLoopResolutionKind, 'REVISE'>,
    note?: string | null,
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.recordOpenLoopResolution(entityType, entityId, resolution, occurredAt, note);
    });
  }

  public completeResolving(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.completeResolving(occurredAt));
  }

  public beginReflection(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.beginReflection(occurredAt));
  }

  public completeReflection(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.completeReflection(occurredAt));
  }

  public skipReflection(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.skipReflection(occurredAt));
  }

  public beginTomorrowPlanning(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.beginTomorrowPlanning(occurredAt));
  }

  public completeTomorrowPlanning(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.completeTomorrowPlanning(occurredAt));
  }

  public beginPreparation(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.beginPreparation(occurredAt));
  }

  public completePreparation(dateKey: DayDate): Promise<EveningCycle> {
    void dateKey;
    return Promise.reject(preparationCommandRequired());
  }

  public skipPreparation(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => cycle.skipPreparation(occurredAt));
  }

  public beginShutdown(dateKey: DayDate): Promise<EveningCycle> {
    void dateKey;
    return Promise.reject(preparationCommandRequired());
  }

  private async mutate(dateKey: DayDate, mutation: CycleMutation): Promise<EveningCycle> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const stored = await this.#cycles.findByDateKey(dateKey);
      if (stored === null) {
        throw new DomainError('evening_cycle.not_found', 'Вечерний цикл не найден.');
      }
      const cycle = cloneCycle(stored);
      const expectedVersion = cycle.version;
      mutation(cycle, this.#clock.now());
      if (cycle.version === expectedVersion) return cycle;
      if (await this.#cycles.saveIfVersionMatches(cycle, expectedVersion)) return cycle;
    }
    throw new DomainError(
      'evening_cycle.concurrent_change',
      'Вечерний цикл изменился в другом окне. Повторите операцию.',
    );
  }
}

function preparationCommandRequired(): DomainError {
  return new DomainError(
    'preparation.command_required',
    'Переход в SHUTDOWN выполняется только командой завершения PreparationPlan.',
  );
}

export function cloneEveningCycle(cycle: EveningCycle): EveningCycle {
  return EveningCycle.rehydrate({
    id: cycle.id,
    dayId: cycle.dayId,
    dateKey: cycle.dateKey,
    state: cycle.state,
    mode: cycle.mode,
    modeReason: cycle.modeReason,
    completion: cycle.completion,
    skipReason: cycle.skipReason,
    skippedStages: cycle.skippedStages,
    startedAt: cycle.startedAt,
    updatedAt: cycle.updatedAt,
    completedAt: cycle.completedAt,
    decisionIds: cycle.decisionIds,
    lifeActionIds: cycle.lifeActionIds,
    openLoopReferences: cycle.openLoopReferences,
    openLoopResolutions: cycle.openLoopResolutions,
    reflectionQuestions: cycle.reflectionQuestions,
    reflectionResults: cycle.reflectionResults,
    reflectionSignals: cycle.reflectionSignals,
    reflectionCorrections: cycle.reflectionCorrections,
    relaxation: cycle.relaxation,
    sleepCheck: cycle.sleepCheck,
    version: cycle.version,
  });
}

function cloneCycle(cycle: EveningCycle): EveningCycle {
  return cloneEveningCycle(cycle);
}

function recoverCompletedCycle(cycle: EveningCycle, occurredAt: Date): void {
  cycle.start(occurredAt);
  cycle.beginResolving(occurredAt);
  cycle.completeResolving(occurredAt);
  const question = ReflectionQuestion.create({
    id: 'GENERAL_LEARNING:recovered-day',
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type: REFLECTION_QUESTION_TYPE.optionalText,
    prompt: 'Есть ли вывод из завершённого дня?',
    context: 'День уже был завершён до восстановления вечернего цикла.',
    required: false,
    sourceEntityIds: [],
  });
  cycle.initializeReflection([question], occurredAt);
  cycle.recordReflectionResult(
    ReflectionResult.skip(cycle.id, question, occurredAt),
    null,
    occurredAt,
  );
  cycle.completeReflection(occurredAt);
  cycle.completeTomorrowPlanning(occurredAt);
  cycle.completePreparation(occurredAt);
  cycle.recoverLegacyRelaxation(occurredAt);
  cycle.complete(occurredAt);
}

export function isSpecialEveningCycleMode(mode: EveningCycleMode): boolean {
  return mode !== EVENING_CYCLE_MODE.normal;
}
