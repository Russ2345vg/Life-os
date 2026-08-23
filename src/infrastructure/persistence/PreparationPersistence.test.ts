import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { cloneEveningCycle, clonePreparationPlan } from '../../application';
import {
  DayDate,
  EntityId,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  PREPARATION_CATEGORY,
  PREPARATION_ITEM_STATUS,
  PREPARATION_PLAN_STATUS,
  PREPARATION_SOURCE_TYPE,
  PreparationPlan,
} from '../../domain';
import { IndexedDbEveningCycleRepository } from './IndexedDbEveningCycleRepository';
import { IndexedDbPreparationPlanRepository } from './IndexedDbPreparationPlanRepository';
import { IndexedDbPreparationUnitOfWork } from './IndexedDbPreparationUnitOfWork';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const NOW = new Date('2026-08-14T14:00:00.000Z');
const DATE = DayDate.create('2026-08-14');

describe('Preparation persistence', () => {
  it('восстанавливает тот же список с выполненными и пропущенными пунктами', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const first = new IndexedDbPreparationPlanRepository(database);
    const plan = createPlan();
    const [completed, skipped] = plan.activeItems;
    plan.completeItem(completed!.id, NOW);
    plan.skipItem(skipped!.id, NOW, 'Осознанно');
    await first.createIfAbsent(plan);

    database.close();
    const restored = await new IndexedDbPreparationPlanRepository(database).findByCycleId(
      id('cycle'),
    );

    expect(restored?.id.equals(plan.id)).toBe(true);
    expect(restored?.activeItems.map((item) => item.status)).toEqual([
      PREPARATION_ITEM_STATUS.completed,
      PREPARATION_ITEM_STATUS.skipped,
    ]);
    expect(restored?.activeItems[1]!.skipReason).toBe('Осознанно');
    database.close();
  });

  it('откатывает весь UoW при конфликте версии EveningCycle', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const plans = new IndexedDbPreparationPlanRepository(database);
    const cycles = new IndexedDbEveningCycleRepository(database);
    const storedPlan = createPlan();
    for (const item of storedPlan.activeItems.filter((candidate) => candidate.required)) {
      storedPlan.skipItem(item.id, NOW, 'Осознанно');
    }
    const storedCycle = preparingCycle();
    await plans.createIfAbsent(storedPlan);
    await cycles.createIfAbsent(storedCycle);
    const changedPlan = clonePreparationPlan(storedPlan);
    const changedCycle = cloneEveningCycle(storedCycle);
    changedPlan.complete(NOW);
    changedCycle.completePreparation(NOW);

    await expect(
      new IndexedDbPreparationUnitOfWork(database).commit({
        plan: changedPlan,
        expectedPlanVersion: storedPlan.version,
        eveningCycle: changedCycle,
        expectedEveningCycleVersion: storedCycle.version - 1,
      }),
    ).rejects.toMatchObject({ code: 'preparation.concurrent_change' });

    expect((await plans.findById(storedPlan.id))?.status).toBe(PREPARATION_PLAN_STATUS.inProgress);
    expect((await cycles.findById(storedCycle.id))?.state).toBe(EVENING_CYCLE_STATE.preparing);
    database.close();
  });

  it('восстанавливает сохранённый SHUTDOWN после перезапуска', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const plans = new IndexedDbPreparationPlanRepository(database);
    const cycles = new IndexedDbEveningCycleRepository(database);
    const storedPlan = createPlan();
    for (const item of storedPlan.activeItems.filter((candidate) => candidate.required)) {
      storedPlan.skipItem(item.id, NOW, 'Осознанно');
    }
    const storedCycle = preparingCycle();
    await plans.createIfAbsent(storedPlan);
    await cycles.createIfAbsent(storedCycle);
    const changedPlan = clonePreparationPlan(storedPlan);
    const changedCycle = cloneEveningCycle(storedCycle);
    changedPlan.complete(NOW);
    changedCycle.completePreparation(NOW);
    await new IndexedDbPreparationUnitOfWork(database).commit({
      plan: changedPlan,
      expectedPlanVersion: storedPlan.version,
      eveningCycle: changedCycle,
      expectedEveningCycleVersion: storedCycle.version,
    });

    database.close();
    const restored = await new IndexedDbEveningCycleRepository(database).findByDateKey(DATE);
    expect(restored?.state).toBe(EVENING_CYCLE_STATE.shutdown);
    expect(restored?.completedAt).toBeNull();
    database.close();
  });
});

function createPlan(): PreparationPlan {
  const plan = PreparationPlan.create({
    id: id('preparation'),
    cycleId: id('cycle'),
    tomorrowPlanId: id('tomorrow'),
    targetDayId: id('target-day'),
    sourceVersion: 5,
    generationSignature: 'UNINITIALIZED',
    createdAt: NOW,
  });
  let next = 0;
  plan.synchronize(
    [
      {
        key: 'digital',
        category: PREPARATION_CATEGORY.digital,
        title: 'Открыть проект',
        sourceType: PREPARATION_SOURCE_TYPE.project,
        sourceId: id('project'),
        required: true,
      },
      {
        key: 'physical',
        category: PREPARATION_CATEGORY.physical,
        title: 'Подготовить рабочее место',
        sourceType: PREPARATION_SOURCE_TYPE.firstAction,
        sourceId: id('action'),
        required: false,
      },
    ],
    5,
    'tomorrow:5',
    NOW,
    () => id(`item-${(next += 1)}`),
  );
  return plan;
}

function preparingCycle(): EveningCycle {
  return EveningCycle.rehydrate({
    id: id('cycle'),
    dayId: id('source-day'),
    dateKey: DATE,
    state: EVENING_CYCLE_STATE.preparing,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    version: 6,
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
