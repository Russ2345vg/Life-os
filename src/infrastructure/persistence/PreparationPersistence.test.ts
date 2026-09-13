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
import { PREPARATION_AREA } from '../../domain/preparation';
import { IndexedDbEveningCycleRepository } from './IndexedDbEveningCycleRepository';
import { IndexedDbPreparationPlanRepository } from './IndexedDbPreparationPlanRepository';
import { IndexedDbPreparationUnitOfWork } from './IndexedDbPreparationUnitOfWork';
import {
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_STORE,
  LifeOsIndexedDb,
} from './indexed-db/LifeOsIndexedDb';

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

  it('сохраняет области среды, обязательное ядро и результаты пунктов при перезагрузке', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbPreparationPlanRepository(database);
    const plan = createEnvironmentPlan();
    const [completed, skipped] = plan.items;
    plan.configureRequiredCore(['sleep-lights', 'tomorrow-clothes', 'tomorrow-water'], NOW);
    plan.completeItem(completed!.id, NOW);
    plan.skipItem(skipped!.id, NOW, 'Сегодня сознательно сокращаю подготовку');
    const expectedCompleted = plan.items.find(
      (item) => item.status === PREPARATION_ITEM_STATUS.completed,
    );
    const expectedSkipped = plan.items.find(
      (item) => item.status === PREPARATION_ITEM_STATUS.skipped,
    );
    await repository.createIfAbsent(plan);

    database.close();
    const restored = await new IndexedDbPreparationPlanRepository(database).findByCycleId(
      id('environment-cycle'),
    );

    expect(restored?.requiredCoreKeys).toEqual(plan.requiredCoreKeys);
    expect(restored?.items.map((item) => item.area)).toEqual(plan.items.map((item) => item.area));
    expect(restored?.items.map((item) => item.recommendedDurationMinutes)).toEqual(
      plan.items.map((item) => item.recommendedDurationMinutes),
    );
    expect(restored?.items.map((item) => item.status)).toEqual(
      plan.items.map((item) => item.status),
    );
    expect(
      restored?.items.find((item) => item.status === PREPARATION_ITEM_STATUS.skipped)?.skipReason,
    ).toBe('Сегодня сознательно сокращаю подготовку');
    expect(
      restored?.items.find((item) => item.status === PREPARATION_ITEM_STATUS.completed)
        ?.completedAt,
    ).toEqual(expectedCompleted?.completedAt);
    expect(
      restored?.items.find((item) => item.status === PREPARATION_ITEM_STATUS.skipped)?.skippedAt,
    ).toEqual(expectedSkipped?.skippedAt);
    database.close();
  });

  it('читает legacy-запись без области и обязательного ядра без изменения required', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const opened = await database.open();
    const transaction = opened.transaction(LIFE_OS_STORE.preparationPlans, 'readwrite');
    await observeRequest(
      transaction.objectStore(LIFE_OS_STORE.preparationPlans).add(legacyPreparationRecord()),
    );
    await observeTransaction(transaction);

    const restored = await new IndexedDbPreparationPlanRepository(database).findByCycleId(
      id('legacy-preparation-cycle'),
    );

    expect(restored?.requiredCoreKeys).toBeNull();
    expect(restored?.items.map((item) => item.required)).toEqual([true, false]);
    expect(restored?.items.map((item) => item.area)).toEqual([
      PREPARATION_AREA.tomorrowStart,
      PREPARATION_AREA.tomorrowStart,
    ]);
    expect(restored?.items.map((item) => item.recommendedDurationMinutes)).toEqual([null, null]);
    database.close();
  });

  it('откатывает весь UoW при конфликте версии EveningCycle', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const plans = new IndexedDbPreparationPlanRepository(database);
    const cycles = new IndexedDbEveningCycleRepository(database);
    const storedPlan = createEnvironmentPlan('cycle');
    storedPlan.configureRequiredCore(['sleep-lights', 'tomorrow-clothes', 'tomorrow-water'], NOW);
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

  it('восстанавливает сохранённый RELAXING после перезапуска', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const plans = new IndexedDbPreparationPlanRepository(database);
    const cycles = new IndexedDbEveningCycleRepository(database);
    const storedPlan = createEnvironmentPlan('cycle');
    storedPlan.configureRequiredCore(['sleep-lights', 'tomorrow-clothes', 'tomorrow-water'], NOW);
    const [completed, skipped, thirdCore] = storedPlan.items;
    storedPlan.completeItem(completed!.id, NOW);
    storedPlan.skipItem(skipped!.id, NOW, 'Сегодня сознательно сокращаю подготовку');
    storedPlan.skipItem(thirdCore!.id, NOW, 'Осознанно');
    const storedCycle = preparingCycle();
    await plans.createIfAbsent(storedPlan);
    await cycles.createIfAbsent(storedCycle);
    const changedPlan = clonePreparationPlan(storedPlan);
    const changedCycle = cloneEveningCycle(storedCycle);
    changedPlan.complete(NOW);
    changedCycle.completePreparation(NOW);
    const expectedCompleted = changedPlan.items.find(
      (item) => item.status === PREPARATION_ITEM_STATUS.completed,
    );
    const expectedSkipped = changedPlan.items.find(
      (item) => item.skipReason === 'Сегодня сознательно сокращаю подготовку',
    );
    await new IndexedDbPreparationUnitOfWork(database).commit({
      plan: changedPlan,
      expectedPlanVersion: storedPlan.version,
      eveningCycle: changedCycle,
      expectedEveningCycleVersion: storedCycle.version,
    });

    database.close();
    const restoredPlan = await new IndexedDbPreparationPlanRepository(database).findByCycleId(
      id('cycle'),
    );
    const restored = await new IndexedDbEveningCycleRepository(database).findByDateKey(DATE);

    expect(restoredPlan?.requiredCoreKeys).toEqual([
      'sleep-lights',
      'tomorrow-clothes',
      'tomorrow-water',
    ]);
    expect(restoredPlan?.items.map((item) => item.area)).toEqual([
      PREPARATION_AREA.sleepEnvironment,
      PREPARATION_AREA.tomorrowStart,
      PREPARATION_AREA.tomorrowStart,
      PREPARATION_AREA.sleepEnvironment,
    ]);
    expect(restoredPlan?.items.map((item) => item.status)).toEqual([
      PREPARATION_ITEM_STATUS.completed,
      PREPARATION_ITEM_STATUS.skipped,
      PREPARATION_ITEM_STATUS.skipped,
      PREPARATION_ITEM_STATUS.pending,
    ]);
    expect(restoredPlan?.items[1]?.skipReason).toBe('Сегодня сознательно сокращаю подготовку');
    expect(
      restoredPlan?.items.find((item) => item.status === PREPARATION_ITEM_STATUS.completed)
        ?.completedAt,
    ).toEqual(expectedCompleted?.completedAt);
    expect(
      restoredPlan?.items.find(
        (item) => item.skipReason === 'Сегодня сознательно сокращаю подготовку',
      )?.skippedAt,
    ).toEqual(expectedSkipped?.skippedAt);
    expect(restored?.state).toBe(EVENING_CYCLE_STATE.relaxing);
    expect(restored?.completedAt).toBeNull();
    expect((await database.open()).version).toBe(LIFE_OS_DATABASE_VERSION);
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
        area: PREPARATION_AREA.tomorrowStart,
        category: PREPARATION_CATEGORY.digital,
        title: 'Открыть цель',
        sourceType: PREPARATION_SOURCE_TYPE.project,
        sourceId: id('project'),
        required: true,
      },
      {
        key: 'physical',
        area: PREPARATION_AREA.tomorrowStart,
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

function createEnvironmentPlan(cycleId = 'environment-cycle'): PreparationPlan {
  const plan = PreparationPlan.create({
    id: id('environment-preparation'),
    cycleId: id(cycleId),
    tomorrowPlanId: id('environment-tomorrow'),
    targetDayId: id('environment-target-day'),
    sourceVersion: 5,
    generationSignature: 'UNINITIALIZED',
    createdAt: NOW,
  });
  let next = 0;
  plan.synchronize(
    [
      {
        key: 'sleep-lights',
        area: PREPARATION_AREA.sleepEnvironment,
        category: PREPARATION_CATEGORY.physical,
        title: 'Приглушить освещение',
        sourceType: PREPARATION_SOURCE_TYPE.rule,
        sourceId: id('sleep-lights-rule'),
        required: false,
        recommendedDurationMinutes: 8,
      },
      {
        key: 'tomorrow-clothes',
        area: PREPARATION_AREA.tomorrowStart,
        category: PREPARATION_CATEGORY.physical,
        title: 'Подготовить одежду',
        sourceType: PREPARATION_SOURCE_TYPE.rule,
        sourceId: id('tomorrow-clothes-rule'),
        required: false,
      },
      {
        key: 'tomorrow-water',
        area: PREPARATION_AREA.tomorrowStart,
        category: PREPARATION_CATEGORY.physical,
        title: 'Подготовить воду',
        sourceType: PREPARATION_SOURCE_TYPE.rule,
        sourceId: id('tomorrow-water-rule'),
        required: false,
      },
      {
        key: 'sleep-noise',
        area: PREPARATION_AREA.sleepEnvironment,
        category: PREPARATION_CATEGORY.cognitive,
        title: 'Уменьшить шум',
        sourceType: PREPARATION_SOURCE_TYPE.rule,
        sourceId: id('sleep-noise-rule'),
        required: false,
      },
    ],
    5,
    'environment:5',
    NOW,
    () => id(`environment-item-${(next += 1)}`),
  );
  return plan;
}

function legacyPreparationRecord(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'legacy-preparation',
    cycleId: 'legacy-preparation-cycle',
    tomorrowPlanId: 'legacy-preparation-tomorrow',
    targetDayId: 'legacy-preparation-target-day',
    items: [
      {
        id: 'legacy-preparation-item-1',
        planId: 'legacy-preparation',
        key: 'legacy-required',
        category: PREPARATION_CATEGORY.digital,
        title: 'Открыть цель',
        sourceType: PREPARATION_SOURCE_TYPE.project,
        sourceId: 'legacy-project',
        required: true,
        status: PREPARATION_ITEM_STATUS.pending,
        active: true,
        completedAt: null,
        skippedAt: null,
        skipReason: null,
      },
      {
        id: 'legacy-preparation-item-2',
        planId: 'legacy-preparation',
        key: 'legacy-optional',
        category: PREPARATION_CATEGORY.physical,
        title: 'Подготовить рабочее место',
        sourceType: PREPARATION_SOURCE_TYPE.firstAction,
        sourceId: 'legacy-action',
        required: false,
        status: PREPARATION_ITEM_STATUS.pending,
        active: true,
        completedAt: null,
        skippedAt: null,
        skipReason: null,
      },
    ],
    sourceVersion: 5,
    generationSignature: 'legacy:5',
    status: PREPARATION_PLAN_STATUS.inProgress,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    completedAt: null,
    version: 1,
  };
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

function observeRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function observeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () => reject(transaction.error));
    transaction.addEventListener('abort', () => reject(transaction.error));
  });
}
