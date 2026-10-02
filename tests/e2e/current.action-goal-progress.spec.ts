import { expect, test } from '@playwright/test';
import {
  DayDate,
  Direction,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
  Sphere,
} from '../../src/domain';
import type { ProgressContribution } from '../../src/domain/planner/ProgressContribution';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { SphereRecordMapper } from '../../src/infrastructure/persistence/mappers/SphereRecordMapper';
import { ProgressContributionRecordMapper } from '../../src/infrastructure/persistence/PlanningRecordMappers';

test('measurable goal progress stays visible in Today and Actions on desktop and mobile', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const now = new Date();
  const sphere = Sphere.create({
    id: EntityId.create('progress-sphere'),
    name: 'Тестовая сфера 66',
    now,
  });
  const direction = Direction.create({
    id: EntityId.create('progress-direction'),
    name: 'Тестовое направление 66',
    sphereId: sphere.id,
    now,
  });
  const goal = Goal.create({
    id: EntityId.create('progress-goal'),
    title: 'Сделать 66 тренировок',
    sphereId: sphere.id,
    directionId: direction.id,
    status: 'active',
    measurement: {
      mode: 'count',
      target: 66,
      unit: 'раз',
      start: null,
      direction: 'at_least',
      cycle: null,
    },
    now,
  });
  const action = LifeAction.createDraft({
    id: EntityId.create('progress-action'),
    title: LifeActionTitle.create('Сделать тренировку'),
    goalId: goal.id,
    plannedDate: DayDate.create(today),
    createdAt: now,
    eventId: EntityId.create('progress-action-created'),
  });
  const fact = (id: string, amount: number, source: ProgressContribution['source']) => ({
    id,
    goalId: goal.id.toString(),
    amount,
    source,
    actionId: null,
    completionKey: null,
    linkId: null,
    effectiveDate: today,
    occurredAt: now.toISOString(),
    voided: false,
    reason: 'Зафиксированный прогресс',
    version: 1,
    schemaVersion: 1,
    updatedAt: now.toISOString(),
  });
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            ['spheres', 'directions', 'goals', 'lifeActions', 'progressContributions'],
            'readwrite',
          );
          for (const [store, rows] of Object.entries(records))
            rows.forEach((row) => tx.objectStore(store).put(row));
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    {
      spheres: [SphereRecordMapper.toRecord(sphere)],
      directions: [DirectionRecordMapper.toRecord(direction)],
      goals: [GoalRecordMapper.toRecord(goal)],
      lifeActions: [LifeActionRecordMapper.toRecord(action)],
      progressContributions: [
        ProgressContributionRecordMapper.toRecord(fact('initial:progress-goal', 0, 'initial')),
        ProgressContributionRecordMapper.toRecord(fact('manual:progress-goal', 20, 'manual')),
      ],
    },
  );
  await page.reload();
  const todayRow = page.locator('.planner-action-row').filter({ hasText: 'Сделать тренировку' });
  await expect(todayRow).toContainText('Сфера Тестовая сфера 66');
  await expect(todayRow).toContainText('Направление Тестовое направление 66');
  await expect(todayRow.locator('.planner-action-goal-progress')).toHaveText('Цель: 20 из 66 раз');
  await page.screenshot({ path: testInfo.outputPath('today-goal-progress.png'), fullPage: true });

  await page.goto('/#/v2/actions');
  const catalogRow = page.locator('.planner-action-row--catalog').filter({
    hasText: 'Сделать тренировку',
  });
  await expect(catalogRow).toContainText('Тестовая сфера 66 / Тестовое направление 66');
  await expect(catalogRow.locator('.planner-action-goal-progress')).toHaveText(
    'Цель: 20 из 66 раз',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('actions-goal-progress.png'), fullPage: true });
  expect(errors).toEqual([]);
});
