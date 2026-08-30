import { describe, expect, it, vi } from 'vitest';
import type {
  CommitDayCompletionInput,
  DayCompletionUnitOfWork,
} from '../ports/DayCompletionUnitOfWork';
import type { PreparationPlanRepository } from '../ports/PreparationPlanRepository';
import type { TomorrowPlanRepository } from '../ports/TomorrowPlanRepository';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  DAY_STATUS,
  Day,
  DayDate,
  EntityId,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  OpenLoopReference,
  PREPARATION_PLAN_STATUS,
  PreparationPlan,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
  ReflectionResult,
  TomorrowPlan,
  type EveningCycleState,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { EveningReviewSnapshot } from '../queries/GetEveningReview';
import { CompleteCurrentDay, CompleteEveningCycle } from './CompleteCurrentDay';

const DAY_DATE = DayDate.create('2026-08-05');
const TARGET_DATE = DayDate.create('2026-08-06');
const STARTED_AT = new Date('2026-08-05T23:50:00.000+09:00');
const COMPLETED_AT = new Date('2026-08-06T00:05:00.000+09:00');

class FakeDayCompletionUnitOfWork implements DayCompletionUnitOfWork {
  public readonly commits: CommitDayCompletionInput[] = [];
  public error: DomainError | null = null;

  public async commit(input: CommitDayCompletionInput): Promise<void> {
    if (this.error !== null) throw this.error;
    this.commits.push(input);
  }
}

describe('CompleteEveningCycle shutdown', () => {
  it('атомарно завершает SHUTDOWN и возвращает единый ShutdownRecord', async () => {
    const context = createContext();
    const result = await context.command.execute(completionInput(), DAY_DATE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(context.unitOfWork.commits).toHaveLength(1);
    const commit = context.unitOfWork.commits[0]!;
    expect(commit.eveningCycle.state).toBe(EVENING_CYCLE_STATE.completed);
    expect(commit.day.status).toBe(DAY_STATUS.completed);
    expect(commit.tomorrowPlan).toBe(context.tomorrowPlan);
    expect(commit.preparationPlan).toBe(context.preparationPlan);
    expect(commit.journalEntries).toHaveLength(1);
    expect(commit.newTomorrowDecisions).toHaveLength(0);
    expect(result.value.shutdownRecord).toMatchObject({
      cycleId: context.snapshot.cycle.id,
      dayId: context.snapshot.day.id,
      mode: EVENING_CYCLE_MODE.normal,
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
    });
  });

  it('повторный complete безопасен и не создаёт повторную транзакцию', async () => {
    const context = createContext();
    const first = await context.command.execute(completionInput(), DAY_DATE);
    expect(first.ok).toBe(true);
    const commit = context.unitOfWork.commits[0]!;
    const completedSnapshot: EveningReviewSnapshot = {
      ...context.snapshot,
      day: commit.day,
      cycle: commit.eveningCycle,
    };
    const repeatedUnitOfWork = new FakeDayCompletionUnitOfWork();
    const repeated = await createCommand(
      completedSnapshot,
      repeatedUnitOfWork,
      context.tomorrowPlan,
      context.preparationPlan,
    ).execute(completionInput(), DAY_DATE);

    expect(repeated.ok).toBe(true);
    expect(repeatedUnitOfWork.commits).toHaveLength(0);
    if (first.ok && repeated.ok) {
      expect(repeated.value.shutdownRecord).toEqual(first.value.shutdownRecord);
      expect(repeated.value.createdTomorrowDecisions).toEqual([]);
    }
  });

  it.each([
    EVENING_CYCLE_STATE.reflecting,
    EVENING_CYCLE_STATE.planningTomorrow,
    EVENING_CYCLE_STATE.preparing,
  ] as const)('запрещает преждевременное завершение из %s', async (state) => {
    const context = createContext({ cycle: cycleInState(state) });
    const result = await context.command.execute(completionInput(), DAY_DATE);
    expect(result.ok ? null : result.error.code).toBe('shutdown.requires_completed_preparation');
    expect(context.unitOfWork.commits).toHaveLength(0);
  });

  it.each([ACTION_SESSION_STATUS.running, ACTION_SESSION_STATUS.paused] as const)(
    'отклоняет %s Сессию действия',
    async (status) => {
      const session = ActionSession.start({
        id: id(`session-${status}`),
        lifeActionId: id('active-action'),
        startedAt: STARTED_AT,
        eventId: id('session-started'),
      });
      if (status === ACTION_SESSION_STATUS.paused) session.pause(STARTED_AT, id('paused'));
      const context = createContext({ unfinishedSession: session });
      const result = await context.command.execute(completionInput(), DAY_DATE);
      expect(result.ok ? null : result.error.code).toBe('day.unfinished_session');
      expect(context.unitOfWork.commits).toHaveLength(0);
    },
  );

  it('повторно проверяет обязательные open loops', async () => {
    const context = createContext({ cycle: shutdownCycleWithOpenLoop() });
    const result = await context.command.execute(completionInput(), DAY_DATE);
    expect(result.ok ? null : result.error.code).toBe('shutdown.open_loops_remaining');
  });

  it('требует готовые завершённые TomorrowPlan и PreparationPlan', async () => {
    const context = createContext();
    const missingTomorrow = await createCommand(
      context.snapshot,
      new FakeDayCompletionUnitOfWork(),
      null,
      context.preparationPlan,
    ).execute(completionInput(), DAY_DATE);
    const missingPreparation = await createCommand(
      context.snapshot,
      new FakeDayCompletionUnitOfWork(),
      context.tomorrowPlan,
      null,
    ).execute(completionInput(), DAY_DATE);
    expect(missingTomorrow.ok ? null : missingTomorrow.error.code).toBe(
      'shutdown.tomorrow_plan_not_ready',
    );
    expect(missingPreparation.ok ? null : missingPreparation.error.code).toBe(
      'shutdown.preparation_not_ready',
    );
  });

  it('завершает исходный dayId после пересечения полуночи', async () => {
    const context = createContext();
    const result = await context.command.execute(completionInput(), DAY_DATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.day.id.equals(context.snapshot.cycle.dayId)).toBe(true);
    expect(result.value.day.date.equals(DAY_DATE)).toBe(true);
    expect(result.value.day.completedAt).toEqual(COMPLETED_AT);
  });

  it('не изменяет исходные агрегаты при rollback UoW', async () => {
    const context = createContext();
    context.unitOfWork.error = new DomainError('persistence.transaction_failed', 'Сбой');
    const result = await context.command.execute(completionInput(), DAY_DATE);
    expect(result.ok).toBe(false);
    expect(context.snapshot.day.status).toBe(DAY_STATUS.open);
    expect(context.snapshot.cycle.state).toBe(EVENING_CYCLE_STATE.shutdown);
  });

  it('CompleteCurrentDay остаётся тонким адаптером', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const adapter = new CompleteCurrentDay({ execute });
    await adapter.execute(completionInput(), DAY_DATE);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(completionInput(), DAY_DATE);
  });
});

function createContext(overrides: Partial<EveningReviewSnapshot> = {}) {
  const snapshot = createSnapshot(overrides);
  const tomorrowPlan = completedTomorrowPlan(snapshot.cycle, snapshot.day);
  const preparationPlan = completedPreparationPlan(snapshot.cycle, tomorrowPlan);
  const unitOfWork = new FakeDayCompletionUnitOfWork();
  return {
    snapshot,
    tomorrowPlan,
    preparationPlan,
    unitOfWork,
    command: createCommand(snapshot, unitOfWork, tomorrowPlan, preparationPlan),
  };
}

function createCommand(
  snapshot: EveningReviewSnapshot,
  unitOfWork: FakeDayCompletionUnitOfWork,
  tomorrowPlan: TomorrowPlan | null,
  preparationPlan: PreparationPlan | null,
): CompleteEveningCycle {
  return new CompleteEveningCycle(
    { execute: async () => snapshot },
    unitOfWork,
    new FakeClock(COMPLETED_AT),
    new FakeIdGenerator('shutdown'),
    tomorrowRepository(tomorrowPlan),
    preparationRepository(preparationPlan),
  );
}

function createSnapshot(overrides: Partial<EveningReviewSnapshot> = {}): EveningReviewSnapshot {
  const day = overrides.day ?? createOpenDay();
  return {
    cycle: overrides.cycle ?? createShutdownCycle(day),
    day,
    currentDate: DAY_DATE,
    tomorrowDate: TARGET_DATE,
    isRecoveryReview: false,
    decisions: [],
    lifeActions: [],
    actionSessions: [],
    unfinishedSession: null,
    tomorrowDecisions: [],
    routineSummary: {
      plannedCount: 0,
      startedCount: 0,
      completedCount: 0,
      runningExecution: null,
    },
    ...overrides,
  };
}

function createOpenDay(): Day {
  return Day.openCurrent({
    id: id('day'),
    currentDate: DAY_DATE,
    occurredAt: new Date('2026-08-05T08:00:00.000+09:00'),
    createdEventId: id('created'),
    openedEventId: id('opened'),
  });
}

function createShutdownCycle(day = createOpenDay()): EveningCycle {
  const cycle = EveningCycle.create({
    id: id('cycle'),
    dayId: day.id,
    dateKey: day.date,
    occurredAt: STARTED_AT,
  });
  cycle.start(STARTED_AT);
  cycle.beginResolving(STARTED_AT);
  cycle.completeResolving(STARTED_AT);
  completeReflection(cycle);
  cycle.completeReflection(STARTED_AT);
  cycle.completeTomorrowPlanning(STARTED_AT);
  cycle.completePreparation(STARTED_AT);
  return cycle;
}

function cycleInState(state: EveningCycleState): EveningCycle {
  const day = createOpenDay();
  const cycle = EveningCycle.create({
    id: id(`cycle-${state}`),
    dayId: day.id,
    dateKey: day.date,
    occurredAt: STARTED_AT,
  });
  cycle.start(STARTED_AT);
  cycle.beginResolving(STARTED_AT);
  cycle.completeResolving(STARTED_AT);
  if (state === EVENING_CYCLE_STATE.reflecting) return cycle;
  completeReflection(cycle);
  cycle.completeReflection(STARTED_AT);
  if (state === EVENING_CYCLE_STATE.planningTomorrow) return cycle;
  cycle.completeTomorrowPlanning(STARTED_AT);
  return cycle;
}

function completeReflection(cycle: EveningCycle): void {
  const question = ReflectionQuestion.create({
    id: 'GENERAL_LEARNING:shutdown',
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type: REFLECTION_QUESTION_TYPE.optionalText,
    prompt: 'Что сохранить?',
    context: 'Контекст',
    required: false,
    sourceEntityIds: [],
  });
  cycle.initializeReflection([question], STARTED_AT);
  cycle.recordReflectionResult(
    ReflectionResult.skip(cycle.id, question, STARTED_AT),
    null,
    STARTED_AT,
  );
}

function shutdownCycleWithOpenLoop(): EveningCycle {
  const cycle = createShutdownCycle();
  return EveningCycle.rehydrate({
    id: cycle.id,
    dayId: cycle.dayId,
    dateKey: cycle.dateKey,
    state: cycle.state,
    mode: cycle.mode,
    startedAt: cycle.startedAt,
    updatedAt: cycle.updatedAt,
    completedAt: cycle.completedAt,
    openLoopReferences: [
      OpenLoopReference.create({
        entityType: OPEN_LOOP_ENTITY_TYPE.lifeAction,
        entityId: id('unresolved'),
        requirement: OPEN_LOOP_REQUIREMENT.requiresResolution,
      }),
    ],
    reflectionQuestions: cycle.reflectionQuestions,
    reflectionResults: cycle.reflectionResults,
    version: cycle.version,
  });
}

function completedTomorrowPlan(cycle: EveningCycle, day: Day): TomorrowPlan {
  const plan = TomorrowPlan.create({
    id: id(`tomorrow-${cycle.id.toString()}`),
    cycleId: cycle.id,
    sourceDayId: day.id,
    targetDayId: id('target-day'),
    targetDateKey: TARGET_DATE,
    createdAt: STARTED_AT,
  });
  plan.assignPrimaryDecision(id('primary-decision'), STARTED_AT);
  plan.setOutcomes('Минимум готов', null, null, STARTED_AT);
  plan.assignFirstAction(id('first-action'), STARTED_AT);
  plan.complete(STARTED_AT);
  return plan;
}

function completedPreparationPlan(
  cycle: EveningCycle,
  tomorrowPlan: TomorrowPlan,
): PreparationPlan {
  return PreparationPlan.rehydrate({
    id: id(`preparation-${cycle.id.toString()}`),
    cycleId: cycle.id,
    tomorrowPlanId: tomorrowPlan.id,
    targetDayId: tomorrowPlan.targetDayId,
    items: [],
    requiredCoreKeys: null,
    sourceVersion: tomorrowPlan.version,
    generationSignature: 'ready',
    status: PREPARATION_PLAN_STATUS.completed,
    createdAt: STARTED_AT,
    updatedAt: STARTED_AT,
    completedAt: STARTED_AT,
    version: 1,
  });
}

function tomorrowRepository(plan: TomorrowPlan | null): TomorrowPlanRepository {
  return {
    findById: async () => plan,
    findByCycleId: async () => plan,
    findByTargetDate: async () => plan,
    createIfAbsent: async (candidate) => candidate,
    saveIfVersionMatches: async () => true,
  };
}

function preparationRepository(plan: PreparationPlan | null): PreparationPlanRepository {
  return {
    findById: async () => plan,
    findByCycleId: async () => plan,
    findByTomorrowPlanId: async () => plan,
    findByTargetDayId: async () => plan,
    createIfAbsent: async (candidate) => candidate,
    saveIfVersionMatches: async () => true,
  };
}

function completionInput() {
  return { summary: 'Всё важное сохранено', actionResolutions: [], tomorrowDecisions: [] } as const;
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
