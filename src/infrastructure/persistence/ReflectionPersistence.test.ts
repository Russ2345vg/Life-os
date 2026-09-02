import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ReflectionApplicationService } from '../../application';
import {
  DayDate,
  EntityId,
  EveningCycle,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_CONTEXT_ENTITY_TYPE,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionEngine,
  ReflectionQuestion,
  ReflectionResult,
  type ReflectionContext,
  type ReflectionContextItem,
} from '../../domain';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { IndexedDbEveningCycleRepository } from './IndexedDbEveningCycleRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const DATE = DayDate.create('2026-08-14');
const NOW = new Date('2026-08-15T00:08:00.000+09:00');

describe('reflection persistence', () => {
  it('восстанавливает частичный ответ из IndexedDB после нового запуска', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const firstRepository = new IndexedDbEveningCycleRepository(firstDatabase);
    const cycle = reflectingCycle();
    await firstRepository.createIfAbsent(cycle);
    const context = reflectionContext(cycle);
    const firstService = service(firstRepository, context);
    const initial = await firstService.getSession(cycle.id);
    const question = initial.currentQuestion!;
    await firstService.answer({
      cycleId: cycle.id,
      questionId: question.id,
      answer: question.options[0]?.value ?? 'Вывод',
    });
    firstDatabase.close();

    const secondDatabase = new LifeOsIndexedDb(factory);
    const secondRepository = new IndexedDbEveningCycleRepository(secondDatabase);
    const restored = await service(secondRepository, context).getSession(cycle.id);

    expect(restored.processed).toBe(1);
    expect(restored.currentQuestion?.id).toBe(`${question.id}:FOLLOW_UP`);
    expect(restored.currentQuestion?.type).toBe(REFLECTION_QUESTION_TYPE.shortCapture);
    expect(restored.questions.map(({ id: questionId }) => questionId)).toEqual([
      question.id,
      `${question.id}:FOLLOW_UP`,
      initial.questions[1]!.id,
    ]);
    expect(restored.cycle.reflectionResults[0]?.answer).toBe(question.options[0]?.value);
    secondDatabase.close();
  });

  it('сохраняет и восстанавливает boolean и rating ответы', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const firstRepository = new IndexedDbEveningCycleRepository(firstDatabase);
    const cycle = reflectingCycle();
    const yesNo = question('yes-no', REFLECTION_QUESTION_TYPE.yesNo);
    const rating = question('rating', REFLECTION_QUESTION_TYPE.rating1To5);
    cycle.initializeReflection([yesNo, rating], NOW);
    cycle.recordReflectionResult(ReflectionResult.answer(cycle.id, yesNo, true, NOW), null, NOW);
    cycle.recordReflectionResult(ReflectionResult.answer(cycle.id, rating, 5, NOW), null, NOW);
    await firstRepository.createIfAbsent(cycle);
    firstDatabase.close();

    const secondDatabase = new LifeOsIndexedDb(factory);
    const secondRepository = new IndexedDbEveningCycleRepository(secondDatabase);
    const restored = await secondRepository.findById(cycle.id);

    expect(restored?.reflectionResults.map((result) => result.answer)).toEqual([true, 5]);
    secondDatabase.close();
  });

  it('читает legacy SHORT_TEXT и OPTIONAL_TEXT без миграции данных', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const firstRepository = new IndexedDbEveningCycleRepository(firstDatabase);
    const cycle = reflectingCycle();
    const shortText = question('short-text', REFLECTION_QUESTION_TYPE.shortText);
    const optionalText = question('optional-text', REFLECTION_QUESTION_TYPE.optionalText, false);
    cycle.initializeReflection([shortText, optionalText], NOW);
    cycle.recordReflectionResult(
      ReflectionResult.answer(cycle.id, shortText, 'Старый обязательный ответ', NOW),
      null,
      NOW,
    );
    cycle.recordReflectionResult(
      ReflectionResult.answer(cycle.id, optionalText, 'Старый необязательный ответ', NOW),
      null,
      NOW,
    );
    await firstRepository.createIfAbsent(cycle);
    firstDatabase.close();

    const secondDatabase = new LifeOsIndexedDb(factory);
    const secondRepository = new IndexedDbEveningCycleRepository(secondDatabase);
    const restored = await secondRepository.findById(cycle.id);

    expect(restored?.reflectionQuestions.map((item) => item.type)).toEqual([
      'SHORT_TEXT',
      'OPTIONAL_TEXT',
    ]);
    expect(restored?.reflectionResults.map((result) => result.answer)).toEqual([
      'Старый обязательный ответ',
      'Старый необязательный ответ',
    ]);
    secondDatabase.close();
  });
});

function service(
  repository: IndexedDbEveningCycleRepository,
  context: ReflectionContext,
): ReflectionApplicationService {
  return new ReflectionApplicationService(
    repository,
    { execute: async () => context },
    new ReflectionEngine(),
    new FakeClock(NOW),
    new FakeIdGenerator('reflection-persistence'),
  );
}

function reflectingCycle(): EveningCycle {
  const cycle = EveningCycle.create({
    id: id('cycle'),
    dayId: id('day'),
    dateKey: DATE,
    occurredAt: NOW,
  });
  cycle.start(NOW);
  cycle.beginResolving(NOW);
  cycle.completeResolving(NOW);
  return cycle;
}

function reflectionContext(cycle: EveningCycle): ReflectionContext {
  const main = item('main', true);
  return {
    cycleId: cycle.id,
    dayId: cycle.dayId,
    dateKey: cycle.dateKey.toString(),
    mainDecision: main,
    completedDecisions: [],
    incompleteDecisions: [main],
    completedActions: [],
    carriedForwardItems: [item('carry')],
    revisedItems: [],
    droppedItems: [],
    actionSessions: [],
    openLoopResultCount: 1,
  };
}

function question(
  idValue: string,
  type: Parameters<typeof ReflectionQuestion.create>[0]['type'],
  required = true,
): ReflectionQuestion {
  return ReflectionQuestion.create({
    id: idValue,
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type,
    prompt: 'Что важно зафиксировать?',
    context: 'Контекст вопроса',
    required,
    sourceEntityIds: [],
    options: [],
  });
}

function item(value: string, main = false): ReflectionContextItem {
  return {
    entityType: main
      ? REFLECTION_CONTEXT_ENTITY_TYPE.decision
      : REFLECTION_CONTEXT_ENTITY_TYPE.lifeAction,
    entityId: id(value),
    title: value,
    isMainDecision: main,
    repeatCount: 0,
    reasonKnown: false,
  };
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
