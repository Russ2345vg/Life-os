import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ReflectionApplicationService } from '../../application';
import {
  DayDate,
  EntityId,
  EveningCycle,
  REFLECTION_CONTEXT_ENTITY_TYPE,
  ReflectionEngine,
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
    expect(restored.currentQuestion?.id).not.toBe(question.id);
    expect(restored.questions).toHaveLength(initial.questions.length);
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
