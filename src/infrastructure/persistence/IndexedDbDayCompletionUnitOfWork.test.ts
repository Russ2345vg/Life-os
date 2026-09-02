import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  ActionSession,
  Day,
  DayDate,
  DECISION_KIND,
  Decision,
  DecisionTitle,
  EntityId,
  EveningCycle,
  ExpectedResult,
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
  ReflectionResult,
  PREPARATION_PLAN_STATUS,
  PreparationPlan,
  TomorrowPlan,
  type LifeAction,
} from '../../domain';
import {
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { IndexedDbDayCompletionUnitOfWork } from './IndexedDbDayCompletionUnitOfWork';
import { IndexedDbDayRepository } from './IndexedDbDayRepository';
import { IndexedDbDecisionRepository } from './IndexedDbDecisionRepository';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { IndexedDbEveningCycleRepository } from './IndexedDbEveningCycleRepository';
import { IndexedDbPreparationPlanRepository } from './IndexedDbPreparationPlanRepository';
import { IndexedDbTomorrowPlanRepository } from './IndexedDbTomorrowPlanRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DayRecordMapper } from './mappers/DayRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';

const TODAY = DayDate.create('2026-08-05');
const TOMORROW = DayDate.create('2026-08-06');
const NOW = new Date('2026-08-05T20:00:00.000Z');

describe('IndexedDbDayCompletionUnitOfWork', () => {
  it('одной транзакцией сохраняет итог дня, изменения действий и решения на завтра после нового запуска', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const day = createOpenDay();
    const cycle = createStartedEveningCycle(day);
    const movedSource = createReadyLifeAction('move', TODAY);
    const cancelledSource = createReadyLifeAction('cancel', TODAY);
    const completedHistory = completeLifeAction(
      markLifeActionInProgress(createReadyLifeAction('history', TODAY)),
    );
    const historySession = createCompletedSession(completedHistory);
    await Promise.all([
      context.dayRepository.save(day),
      context.lifeActionRepository.save(movedSource),
      context.lifeActionRepository.save(cancelledSource),
      context.lifeActionRepository.save(completedHistory),
      context.sessionRepository.save(historySession),
      context.eveningCycleRepository.createIfAbsent(cycle),
    ]);
    const historyActionBefore = LifeActionRecordMapper.toRecord(completedHistory);
    const historySessionVersion = historySession.version;

    const completedDay = DayRecordMapper.fromRecord(DayRecordMapper.toRecord(day));
    const moved = cloneLifeAction(movedSource);
    const cancelled = cloneLifeAction(cancelledSource);
    moved.reschedule(TOMORROW, NOW, id('move-event'));
    cancelled.cancel(
      NOW,
      id('cancel-event'),
      (await import('../../domain')).ActionCancelReason.create('Не требуется'),
    );
    completedDay.complete(NOW, id('day-completed'), 'Вечерний итог');
    const tomorrowDecision = createTomorrowDecision('tomorrow-new', 1);
    const completedCycle = completeEveningCycle(cycle);

    await context.unitOfWork.commit({
      eveningCycle: completedCycle,
      expectedEveningCycleVersion: cycle.version,
      day: completedDay,
      expectedDayVersion: day.version,
      lifeActions: [
        { lifeAction: moved, expectedVersion: movedSource.version },
        { lifeAction: cancelled, expectedVersion: cancelledSource.version },
      ],
      tomorrowDate: TOMORROW,
      newTomorrowDecisions: [tomorrowDecision],
    });
    context.database.close();

    const restored = createContext(factory);
    const [
      restoredDay,
      restoredMoved,
      restoredCancelled,
      restoredHistory,
      restoredTomorrow,
      restoredCycle,
    ] = await Promise.all([
      restored.dayRepository.findByDate(TODAY),
      restored.lifeActionRepository.findById(moved.id),
      restored.lifeActionRepository.findById(cancelled.id),
      restored.lifeActionRepository.findById(completedHistory.id),
      restored.decisionRepository.findByDate(TOMORROW),
      restored.eveningCycleRepository.findByDateKey(TODAY),
    ]);
    const restoredHistorySessions = await restored.sessionRepository.findByLifeActionId(
      completedHistory.id,
    );

    expect(restoredDay?.status).toBe('completed');
    expect(restoredDay?.summary).toBe('Вечерний итог');
    expect(restoredMoved?.plannedDate?.equals(TOMORROW)).toBe(true);
    expect(restoredMoved?.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(restoredCancelled?.status).toBe(LIFE_ACTION_STATUS.cancelled);
    expect(restoredTomorrow.map((decision) => decision.id.toString())).toEqual([
      tomorrowDecision.id.toString(),
    ]);
    expect(restoredCycle?.state).toBe('COMPLETED');
    expect(LifeActionRecordMapper.toRecord(restoredHistory!)).toEqual(historyActionBefore);
    expect(restoredHistorySessions).toHaveLength(1);
    expect(restoredHistorySessions[0]?.version).toBe(historySessionVersion);
    restored.database.close();
  });

  it('откатывает день и действия, если добавление решения нарушает ограничение', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const day = createOpenDay();
    const cycle = createStartedEveningCycle(day);
    const action = createReadyLifeAction('rollback', TODAY);
    const existing = createTomorrowDecision('duplicate-id', 1);
    await Promise.all([
      context.dayRepository.save(day),
      context.lifeActionRepository.save(action),
      context.decisionRepository.save(existing),
      context.eveningCycleRepository.createIfAbsent(cycle),
    ]);
    const changedDay = DayRecordMapper.fromRecord(DayRecordMapper.toRecord(day));
    const changedAction = cloneLifeAction(action);
    changedDay.complete(NOW, id('complete-event'), 'Итог');
    changedAction.reschedule(TOMORROW, NOW, id('reschedule-event'));
    const duplicate = createTomorrowDecision('duplicate-id', 2);
    const completedCycle = completeEveningCycle(cycle);

    await expect(
      context.unitOfWork.commit({
        eveningCycle: completedCycle,
        expectedEveningCycleVersion: cycle.version,
        day: changedDay,
        expectedDayVersion: day.version,
        lifeActions: [{ lifeAction: changedAction, expectedVersion: action.version }],
        tomorrowDate: TOMORROW,
        newTomorrowDecisions: [duplicate],
      }),
    ).rejects.toMatchObject({ code: 'persistence.constraint_violation' });

    const [restoredDay, restoredAction, tomorrowDecisions, restoredCycle] = await Promise.all([
      context.dayRepository.findByDate(TODAY),
      context.lifeActionRepository.findById(action.id),
      context.decisionRepository.findByDate(TOMORROW),
      context.eveningCycleRepository.findByDateKey(TODAY),
    ]);
    expect(restoredDay?.status).toBe('open');
    expect(restoredDay?.summary).toBeNull();
    expect(restoredAction?.plannedDate?.equals(TODAY)).toBe(true);
    expect(tomorrowDecisions).toHaveLength(1);
    expect(restoredCycle?.state).toBe('WINDING_DOWN');
    context.database.close();
  });

  it('отклоняет устаревшую версию до записи и сохраняет исходное состояние', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const day = createOpenDay();
    const cycle = createStartedEveningCycle(day);
    await Promise.all([
      context.dayRepository.save(day),
      context.eveningCycleRepository.createIfAbsent(cycle),
    ]);
    const changedDay = DayRecordMapper.fromRecord(DayRecordMapper.toRecord(day));
    changedDay.complete(NOW, id('complete-event'), 'Итог');

    await expect(
      context.unitOfWork.commit({
        eveningCycle: completeEveningCycle(cycle),
        expectedEveningCycleVersion: cycle.version,
        day: changedDay,
        expectedDayVersion: day.version + 1,
        lifeActions: [],
        tomorrowDate: TOMORROW,
        newTomorrowDecisions: [createTomorrowDecision('new-main', 1)],
      }),
    ).rejects.toMatchObject({ code: 'day.completion_conflict' });

    expect((await context.dayRepository.findByDate(TODAY))?.status).toBe('open');
    expect(await context.decisionRepository.findByDate(TOMORROW)).toHaveLength(0);
    context.database.close();
  });

  it('повторно проверяет лимит главных решений внутри транзакции', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const day = createOpenDay();
    const cycle = createStartedEveningCycle(day);
    await Promise.all([
      context.dayRepository.save(day),
      context.eveningCycleRepository.createIfAbsent(cycle),
    ]);
    await Promise.all([
      context.decisionRepository.save(createTomorrowDecision('main-1', 1)),
      context.decisionRepository.save(createTomorrowDecision('main-2', 2)),
      context.decisionRepository.save(createTomorrowDecision('main-3', 3)),
    ]);
    const changedDay = DayRecordMapper.fromRecord(DayRecordMapper.toRecord(day));
    changedDay.complete(NOW, id('complete-event'), 'Итог');

    await expect(
      context.unitOfWork.commit({
        eveningCycle: completeEveningCycle(cycle),
        expectedEveningCycleVersion: cycle.version,
        day: changedDay,
        expectedDayVersion: day.version,
        lifeActions: [],
        tomorrowDate: TOMORROW,
        newTomorrowDecisions: [createTomorrowDecision('main-4', 1)],
      }),
    ).rejects.toMatchObject({ code: 'decision.main_limit_reached' });
    expect((await context.dayRepository.findByDate(TODAY))?.status).toBe('open');
    context.database.close();
  });

  it('откатывает SHUTDOWN целиком при конфликте связанного TomorrowPlan', async () => {
    const factory = new IDBFactory();
    const context = createContext(factory);
    const day = createOpenDay();
    const cycle = createStartedEveningCycle(day);
    const tomorrowPlan = createCompletedTomorrowPlan(cycle, day);
    const preparationPlan = createCompletedPreparationPlan(cycle, tomorrowPlan);
    await Promise.all([
      context.dayRepository.save(day),
      context.eveningCycleRepository.createIfAbsent(cycle),
      context.tomorrowPlanRepository.createIfAbsent(tomorrowPlan),
      context.preparationPlanRepository.createIfAbsent(preparationPlan),
    ]);
    const changedDay = DayRecordMapper.fromRecord(DayRecordMapper.toRecord(day));
    changedDay.complete(NOW, id('shutdown-completed'), 'Итог');

    await expect(
      context.unitOfWork.commit({
        eveningCycle: completeEveningCycle(cycle),
        expectedEveningCycleVersion: cycle.version,
        day: changedDay,
        expectedDayVersion: day.version,
        lifeActions: [],
        tomorrowDate: TOMORROW,
        newTomorrowDecisions: [],
        tomorrowPlan,
        expectedTomorrowPlanVersion: tomorrowPlan.version - 1,
        preparationPlan,
        expectedPreparationPlanVersion: preparationPlan.version,
      }),
    ).rejects.toMatchObject({ code: 'tomorrow_plan.completion_conflict' });

    expect((await context.dayRepository.findByDate(TODAY))?.status).toBe('open');
    expect((await context.eveningCycleRepository.findByDateKey(TODAY))?.state).toBe('WINDING_DOWN');
    context.database.close();
  });
});

function createContext(factory: IDBFactory) {
  const database = new LifeOsIndexedDb(factory);
  return {
    database,
    dayRepository: new IndexedDbDayRepository(database),
    decisionRepository: new IndexedDbDecisionRepository(database),
    lifeActionRepository: new IndexedDbLifeActionRepository(database),
    sessionRepository: new IndexedDbActionSessionRepository(database),
    eveningCycleRepository: new IndexedDbEveningCycleRepository(database),
    tomorrowPlanRepository: new IndexedDbTomorrowPlanRepository(database),
    preparationPlanRepository: new IndexedDbPreparationPlanRepository(database),
    unitOfWork: new IndexedDbDayCompletionUnitOfWork(database),
  };
}

function createCompletedTomorrowPlan(cycle: EveningCycle, day: Day): TomorrowPlan {
  const plan = TomorrowPlan.create({
    id: id('tomorrow-plan'),
    cycleId: cycle.id,
    sourceDayId: day.id,
    targetDayId: id('target-day'),
    targetDateKey: TOMORROW,
    createdAt: NOW,
  });
  plan.assignPrimaryDecision(id('tomorrow-primary'), NOW);
  plan.setOutcomes('Минимум', null, null, NOW);
  plan.assignFirstAction(id('tomorrow-first-action'), NOW);
  plan.complete(NOW);
  return plan;
}

function createCompletedPreparationPlan(
  cycle: EveningCycle,
  tomorrowPlan: TomorrowPlan,
): PreparationPlan {
  return PreparationPlan.rehydrate({
    id: id('preparation-plan'),
    cycleId: cycle.id,
    tomorrowPlanId: tomorrowPlan.id,
    targetDayId: tomorrowPlan.targetDayId,
    items: [],
    requiredCoreKeys: null,
    sourceVersion: tomorrowPlan.version,
    generationSignature: 'ready',
    status: PREPARATION_PLAN_STATUS.completed,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    version: 1,
  });
}

function createStartedEveningCycle(day: Day): EveningCycle {
  const cycle = EveningCycle.create({
    id: id('evening-cycle'),
    dayId: day.id,
    dateKey: day.date,
    occurredAt: NOW,
  });
  cycle.start(NOW);
  return cycle;
}

function completeEveningCycle(source: EveningCycle): EveningCycle {
  const cycle = EveningCycle.rehydrate({
    id: source.id,
    dayId: source.dayId,
    dateKey: source.dateKey,
    state: source.state,
    mode: source.mode,
    startedAt: source.startedAt,
    updatedAt: source.updatedAt,
    completedAt: source.completedAt,
    decisionIds: source.decisionIds,
    lifeActionIds: source.lifeActionIds,
    version: source.version,
  });
  cycle.beginResolving(NOW);
  cycle.completeResolving(NOW);
  finishReflection(cycle);
  cycle.completeReflection(NOW);
  cycle.completeTomorrowPlanning(NOW);
  cycle.completePreparation(NOW);
  cycle.recoverLegacyRelaxation(NOW);
  cycle.complete(NOW);
  return cycle;
}

function finishReflection(cycle: EveningCycle): void {
  const question = ReflectionQuestion.create({
    id: 'GENERAL_LEARNING:test',
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type: REFLECTION_QUESTION_TYPE.optionalText,
    prompt: 'Какой вывод стоит сохранить?',
    context: 'Тестовый день завершён.',
    required: false,
    sourceEntityIds: [],
  });
  cycle.initializeReflection([question], NOW);
  cycle.recordReflectionResult(ReflectionResult.skip(cycle.id, question, NOW), null, NOW);
}

function createOpenDay(): Day {
  return Day.openCurrent({
    id: id('current-day'),
    currentDate: TODAY,
    occurredAt: new Date('2026-08-05T08:00:00.000Z'),
    createdEventId: id('day-created'),
    openedEventId: id('day-opened'),
  });
}

function createTomorrowDecision(value: string, order: number): Decision {
  const decision = Decision.createDraft({
    id: id(value),
    title: DecisionTitle.create(`Решение ${value}`),
    kind: DECISION_KIND.main,
    expectedResult: ExpectedResult.create(`Результат ${value}`),
    occurredAt: NOW,
    eventId: id(`${value}-draft-event`),
  });
  decision.plan({
    plannedDate: TOMORROW,
    kind: DECISION_KIND.main,
    order,
    expectedResult: ExpectedResult.create(`Результат ${value}`),
    occurredAt: NOW,
    eventId: id(`${value}-planned-event`),
  });
  return decision;
}

function createCompletedSession(lifeAction: LifeAction): ActionSession {
  const session = ActionSession.start({
    id: id(`session-${lifeAction.id.toString()}`),
    lifeActionId: lifeAction.id,
    startedAt: new Date('2026-08-05T10:00:00.000Z'),
    eventId: id(`session-${lifeAction.id.toString()}-started`),
  });
  session.complete({
    completedAt: new Date('2026-08-05T11:00:00.000Z'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: id(`session-${lifeAction.id.toString()}-completed`),
  });
  return session;
}

function cloneLifeAction(lifeAction: LifeAction): LifeAction {
  return LifeActionRecordMapper.fromRecord(LifeActionRecordMapper.toRecord(lifeAction));
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
