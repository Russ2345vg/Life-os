import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EveningCycle,
  EVENING_CYCLE_STATE,
  EVENING_CYCLE_MODE,
  EVENING_MODE_REASON,
  EVENING_STAGE_SKIP_REASON,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_CONTEXT_ENTITY_TYPE,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  REFLECTION_SIGNAL_TYPE,
  ReflectionEngine,
  ReflectionQuestion,
  ReflectionResult,
  RELAXATION_PRACTICE,
  type ReflectionContext,
  type ReflectionContextItem,
  type EveningCycleMode,
} from '../../domain';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import { ReflectionApplicationService } from './ReflectionApplicationService';

const DATE = DayDate.create('2026-08-14');
const NOW = new Date('2026-08-15T00:08:00.000+09:00');

describe('ReflectionApplicationService', () => {
  it('фиксирует Signal и атомарно вставляет follow-up до перехода в PLANNING_TOMORROW', async () => {
    const repository = new MemoryEveningCycleRepository();
    const cycle = reflectingCycle();
    await repository.createIfAbsent(cycle);
    const service = createService(repository, failureContext(cycle));

    const first = await service.getSession(cycle.id);
    const repeated = await service.getSession(cycle.id);

    expect(first.questions.map((question) => question.id)).toEqual(
      repeated.questions.map((question) => question.id),
    );
    expect(first.currentQuestion?.kind).toBe(REFLECTION_QUESTION_KIND.mainDecisionFailureReason);

    const afterReason = await service.answer({
      cycleId: cycle.id,
      questionId: first.currentQuestion!.id,
      answer: 'TOO_LARGE',
    });

    expect(afterReason.complete).toBe(false);
    expect(afterReason.cycle.state).toBe(EVENING_CYCLE_STATE.reflecting);
    expect(afterReason.currentQuestion?.id).toBe(`${first.currentQuestion!.id}:FOLLOW_UP`);
    expect(afterReason.currentQuestion?.type).toBe(REFLECTION_QUESTION_TYPE.shortCapture);
    expect(afterReason.cycle.reflectionSignals[0]?.type).toBe(REFLECTION_SIGNAL_TYPE.scopeTooLarge);

    const idempotent = await service.answer({
      cycleId: cycle.id,
      questionId: first.currentQuestion!.id,
      answer: 'TOO_LARGE',
    });
    expect(idempotent.cycle.reflectionResults).toHaveLength(1);
    expect(idempotent.questions).toHaveLength(2);

    const completed = await service.answer({
      cycleId: cycle.id,
      questionId: afterReason.currentQuestion!.id,
      answer: 'Делить объём до начала рабочей сессии',
    });

    expect(completed.complete).toBe(true);
    expect(completed.cycle.state).toBe(EVENING_CYCLE_STATE.planningTomorrow);

    const correction = await service.createCorrection({
      cycleId: cycle.id,
      questionId: first.currentQuestion!.id,
      action: 'Делить объём до начала рабочей сессии',
    });
    expect(correction.observation).toBe('TOO_LARGE');
    expect((await repository.findById(cycle.id))?.reflectionCorrections).toHaveLength(1);
  });

  it('после пересоздания сервиса продолжает с первого неотвеченного вопроса', async () => {
    const repository = new MemoryEveningCycleRepository();
    const cycle = reflectingCycle();
    await repository.createIfAbsent(cycle);
    const context = complexContext(cycle);
    const firstService = createService(repository, context);
    const initial = await firstService.getSession(cycle.id);
    expect(initial.total).toBeGreaterThan(1);

    const firstQuestion = initial.currentQuestion!;
    await firstService.answer({
      cycleId: cycle.id,
      questionId: firstQuestion.id,
      answer: firstQuestion.options[0]?.value ?? 'Вывод',
    });

    const restored = await createService(repository, context).getSession(cycle.id);
    expect(restored.processed).toBe(1);
    expect(restored.currentQuestion?.id).toBe(`${firstQuestion.id}:FOLLOW_UP`);
    expect(restored.questions).toHaveLength(initial.questions.length + 1);
  });

  it('завершает no-op Осмысление ответом Нет без искусственного второго вопроса', async () => {
    const repository = new MemoryEveningCycleRepository();
    const cycle = reflectingCycle();
    await repository.createIfAbsent(cycle);
    const service = createService(repository, emptyContext(cycle));
    const session = await service.getSession(cycle.id);

    expect(session.currentQuestion?.type).toBe(REFLECTION_QUESTION_TYPE.yesNo);
    const completed = await service.answer({
      cycleId: cycle.id,
      questionId: session.currentQuestion!.id,
      answer: false,
    });

    expect(completed.complete).toBe(true);
    expect(completed.cycle.state).toBe(EVENING_CYCLE_STATE.planningTomorrow);
  });

  it('добавляет no-op capture только после ответа Да', async () => {
    const repository = new MemoryEveningCycleRepository();
    const cycle = reflectingCycle();
    await repository.createIfAbsent(cycle);
    const service = createService(repository, emptyContext(cycle));
    const session = await service.getSession(cycle.id);

    const continued = await service.answer({
      cycleId: cycle.id,
      questionId: session.currentQuestion!.id,
      answer: true,
    });

    expect(continued.complete).toBe(false);
    expect(continued.questions).toHaveLength(2);
    expect(continued.currentQuestion?.type).toBe(REFLECTION_QUESTION_TYPE.shortCapture);
  });
  it('QUICK без значимого сигнала сознательно пропускает REFLECTING', async () => {
    const repository = new MemoryEveningCycleRepository();
    const cycle = reflectingCycle(EVENING_CYCLE_MODE.quick);
    await repository.createIfAbsent(cycle);

    const session = await createService(repository, emptyContext(cycle)).getSession(cycle.id);

    expect(session.questions).toHaveLength(0);
    expect(session.cycle.state).toBe(EVENING_CYCLE_STATE.planningTomorrow);
    expect(session.cycle.skippedStages[0]?.reason).toBe(EVENING_STAGE_SKIP_REASON.quickMode);
  });

  it('QUICK обрабатывает максимум один критический Reflection Signal', async () => {
    const repository = new MemoryEveningCycleRepository();
    const cycle = reflectingCycle(EVENING_CYCLE_MODE.quick);
    await repository.createIfAbsent(cycle);
    const service = createService(repository, complexContext(cycle));

    const session = await service.getSession(cycle.id);
    expect(session.questions).toHaveLength(1);
    expect(session.currentQuestion?.kind).toBe(REFLECTION_QUESTION_KIND.mainDecisionFailureReason);

    const completed = await service.answer({
      cycleId: cycle.id,
      questionId: session.currentQuestion!.id,
      answer: 'TOO_LARGE',
    });
    expect(completed.cycle.state).toBe(EVENING_CYCLE_STATE.planningTomorrow);
    expect(completed.cycle.reflectionSignals[0]?.type).toBe(REFLECTION_SIGNAL_TYPE.scopeTooLarge);
  });

  it('EMERGENCY не создаёт вопросы и переходит к минимальному плану', async () => {
    const repository = new MemoryEveningCycleRepository();
    const cycle = reflectingCycle(EVENING_CYCLE_MODE.emergency);
    await repository.createIfAbsent(cycle);

    const session = await createService(repository, failureContext(cycle)).getSession(cycle.id);
    expect(session.questions).toHaveLength(0);
    expect(session.cycle.state).toBe(EVENING_CYCLE_STATE.planningTomorrow);
  });

  it('после COMPLETED возвращает сохранённые вопросы и ответы без повторного запуска engine', async () => {
    const repository = new MemoryEveningCycleRepository();
    const question = ReflectionQuestion.create({
      id: 'saved-question',
      kind: REFLECTION_QUESTION_KIND.generalLearning,
      signal: REFLECTION_DAY_SIGNAL.learning,
      type: REFLECTION_QUESTION_TYPE.shortText,
      prompt: 'Что важно сохранить?',
      context: 'Сохранённый контекст дня',
      required: true,
      sourceEntityIds: [],
    });
    const cycle = EveningCycle.rehydrate({
      id: id('completed-reflection-cycle'),
      dayId: id('completed-reflection-day'),
      dateKey: DATE,
      state: EVENING_CYCLE_STATE.completed,
      mode: EVENING_CYCLE_MODE.normal,
      startedAt: NOW,
      updatedAt: NOW,
      completedAt: NOW,
      reflectionQuestions: [question],
      reflectionResults: [
        ReflectionResult.answer(
          id('completed-reflection-cycle'),
          question,
          'Сохранённый ответ',
          NOW,
        ),
      ],
      version: 12,
    });
    await repository.createIfAbsent(cycle);
    let contextRequests = 0;
    const service = new ReflectionApplicationService(
      repository,
      {
        execute: async () => {
          contextRequests += 1;
          return emptyContext(cycle);
        },
      },
      new ReflectionEngine(),
      new FakeClock(NOW),
      new FakeIdGenerator('completed-reflection'),
    );

    const session = await service.getSession(cycle.id);

    expect(session.questions.map((item) => item.id)).toEqual(['saved-question']);
    expect(session.cycle.reflectionResults[0]?.answer).toBe('Сохранённый ответ');
    expect(session.currentQuestion).toBeNull();
    expect(contextRequests).toBe(0);
    expect((await repository.findById(cycle.id))?.state).toBe(EVENING_CYCLE_STATE.completed);
  });

  it.each([EVENING_CYCLE_STATE.relaxing, EVENING_CYCLE_STATE.sleepCheck] as const)(
    'восстанавливает завершённое Осмысление на промежуточном этапе %s',
    async (stage) => {
      const repository = new MemoryEveningCycleRepository();
      const question = ReflectionQuestion.create({
        id: 'relaxing-saved-question',
        kind: REFLECTION_QUESTION_KIND.generalLearning,
        signal: REFLECTION_DAY_SIGNAL.learning,
        type: REFLECTION_QUESTION_TYPE.shortText,
        prompt: 'Что важно сохранить?',
        context: 'Сохранённый контекст дня',
        required: true,
        sourceEntityIds: [],
      });
      const cycle = EveningCycle.rehydrate({
        id: id('relaxing-reflection-cycle'),
        dayId: id('relaxing-reflection-day'),
        dateKey: DATE,
        state: EVENING_CYCLE_STATE.relaxing,
        mode: EVENING_CYCLE_MODE.normal,
        startedAt: NOW,
        updatedAt: NOW,
        completedAt: null,
        reflectionQuestions: [question],
        reflectionResults: [
          ReflectionResult.answer(
            id('relaxing-reflection-cycle'),
            question,
            'Сохранённый ответ',
            NOW,
          ),
        ],
        version: 11,
      });
      if (stage === EVENING_CYCLE_STATE.sleepCheck) {
        cycle.initializeRelaxation(RELAXATION_PRACTICE.reading, 15, 25, NOW);
        cycle.setBeforeRelaxationRatings(2, 3, NOW);
        cycle.completeRelaxationDrink(NOW);
        cycle.completeRelaxationHygiene(NOW);
        cycle.completeRelaxationPractice(NOW);
        cycle.skipRelaxationScreenFree(NOW);
        cycle.completeRelaxation(NOW);
      }
      await repository.createIfAbsent(cycle);

      const session = await createService(repository, emptyContext(cycle)).getSession(cycle.id);

      expect(session.cycle.state).toBe(stage);
      expect(session.currentQuestion).toBeNull();
      expect(session.complete).toBe(true);
    },
  );
});

function createService(
  repository: EveningCycleRepository,
  context: ReflectionContext,
): ReflectionApplicationService {
  return new ReflectionApplicationService(
    repository,
    { execute: async () => context },
    new ReflectionEngine(),
    new FakeClock(NOW),
    new FakeIdGenerator('reflection'),
  );
}

class MemoryEveningCycleRepository implements EveningCycleRepository {
  readonly #cycles = new Map<string, EveningCycle>();

  public async findById(cycleId: EntityId): Promise<EveningCycle | null> {
    return [...this.#cycles.values()].find((cycle) => cycle.id.equals(cycleId)) ?? null;
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return [...this.#cycles.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.#cycles.get(dateKey.toString()) ?? null;
  }

  public async createIfAbsent(cycle: EveningCycle): Promise<EveningCycle> {
    const existing = await this.findByDateKey(cycle.dateKey);
    if (existing !== null) return existing;
    this.#cycles.set(cycle.dateKey.toString(), cycle);
    return cycle;
  }

  public async saveIfVersionMatches(
    cycle: EveningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    const existing = await this.findByDateKey(cycle.dateKey);
    if (existing === null || existing.version !== expectedVersion) return false;
    this.#cycles.set(cycle.dateKey.toString(), cycle);
    return true;
  }
}

function reflectingCycle(mode: EveningCycleMode = EVENING_CYCLE_MODE.normal): EveningCycle {
  const cycle = EveningCycle.create({
    id: id('cycle'),
    dayId: id('day'),
    dateKey: DATE,
    occurredAt: NOW,
  });
  cycle.start(NOW);
  if (mode !== EVENING_CYCLE_MODE.normal) {
    cycle.switchMode(mode, EVENING_MODE_REASON.userSelected, NOW);
  }
  cycle.beginResolving(NOW);
  cycle.completeResolving(NOW);
  return cycle;
}

function failureContext(cycle: EveningCycle): ReflectionContext {
  const main = item('main', true);
  return { ...emptyContext(cycle), mainDecision: main, incompleteDecisions: [main] };
}

function complexContext(cycle: EveningCycle): ReflectionContext {
  const main = item('main', true);
  return {
    ...emptyContext(cycle),
    mainDecision: main,
    incompleteDecisions: [main],
    carriedForwardItems: [item('carry', false, 1)],
  };
}

function emptyContext(cycle: EveningCycle): ReflectionContext {
  return {
    cycleId: cycle.id,
    dayId: cycle.dayId,
    dateKey: cycle.dateKey.toString(),
    mainDecision: null,
    completedDecisions: [],
    incompleteDecisions: [],
    completedActions: [],
    carriedForwardItems: [],
    revisedItems: [],
    droppedItems: [],
    actionSessions: [],
    openLoopResultCount: 0,
  };
}

function item(value: string, main = false, repeatCount = 0): ReflectionContextItem {
  return {
    entityType: main
      ? REFLECTION_CONTEXT_ENTITY_TYPE.decision
      : REFLECTION_CONTEXT_ENTITY_TYPE.lifeAction,
    entityId: id(value),
    title: value,
    isMainDecision: main,
    repeatCount,
    reasonKnown: false,
  };
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
