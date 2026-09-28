import { expect, test } from '@playwright/test';
import { DayDate, EntityId, Goal } from '../../src/domain';
import { addDays } from '../../src/domain/planner/PlanningPeriod';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { createReadyLifeAction } from '../../src/test/helpers/LifeActionTestFactory';
import type { ProgressContribution } from '../../src/domain/planner/ProgressContribution';

test('goal dynamics distinguishes recorded changes, unknown days and qualitative completions', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/goals');
  await expect(page.getByRole('heading', { name: 'Цели', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const now = new Date();
  const id = EntityId.create;
  const measured = Goal.create({
    id: id('dynamics-goal'),
    title: 'Стабильный вес',
    status: 'active',
    now,
    measurement: {
      mode: 'numeric',
      unit: 'кг',
      start: 80,
      target: 75,
      direction: 'at_most',
      cycle: null,
    },
  });
  const qualitative = Goal.create({
    id: id('dynamics-qualitative'),
    title: 'Портфолио',
    status: 'active',
    now,
  });
  const done = (key: string, goal: Goal, date: string) => {
    const action = createReadyLifeAction(key, DayDate.create(date));
    action.setGoal(goal.id);
    action.markInProgress(new Date(`${date}T10:00:00`), id(`${key}-start`));
    action.complete(null, new Date(`${date}T12:00:00`), id(`${key}-done`));
    return action;
  };
  const completed = done('dynamics-training', measured, addDays(today, -3));
  const portfolio = done('dynamics-portfolio', qualitative, addDays(today, -2));
  const fact = (
    key: string,
    amount: number | null,
    date: string,
    source: ProgressContribution['source'] = 'manual',
  ): ProgressContribution => ({
    id: key,
    goalId: 'dynamics-goal',
    amount,
    effectiveDate: date,
    occurredAt: now.toISOString(),
    updatedAt: now.toISOString(),
    source,
    reason: key === 'dynamics-correction' ? 'Уточнённый результат' : 'Запись результата',
    version: 1,
    schemaVersion: 1,
    voided: false,
    actionId: null,
    completionKey: null,
    linkId: null,
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
          const tx = db.transaction(['goals', 'lifeActions', 'progressContributions'], 'readwrite');
          records.goals.forEach((record) => tx.objectStore('goals').put(record));
          records.actions.forEach((record) => tx.objectStore('lifeActions').put(record));
          records.facts.forEach((record) => tx.objectStore('progressContributions').put(record));
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    {
      goals: [measured, qualitative].map(GoalRecordMapper.toRecord),
      actions: [completed, portfolio].map(LifeActionRecordMapper.toRecord),
      facts: [
        fact('initial:dynamics-goal', 80, addDays(today, -40), 'initial'),
        fact('dynamics-correction', -2, addDays(today, -6)),
        fact('dynamics-zero', 0, addDays(today, -4)),
        {
          ...fact('dynamics-completion', 1, addDays(today, -3), 'completion'),
          reason: 'Выполнение действия',
          actionId: completed.id.toString(),
          completionKey: completed.completionKey,
        },
        fact('dynamics-pending', null, addDays(today, -1)),
        fact('dynamics-future', 99, addDays(today, 1)),
        { ...fact('dynamics-void', 99, today), voided: true },
      ],
    },
  );
  await page.goto('/#/v2/goals/dynamics-goal');
  await expect(page.getByRole('heading', { name: 'Стабильный вес', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('goal-detail-baseline.png'), fullPage: true });
  const dynamics = page.getByRole('region', { name: 'Динамика цели', exact: true });
  await expect(dynamics).toBeVisible({ timeout: 3000 });
  await expect(dynamics).toContainText('Записанные изменения за 30 дней');
  await expect(dynamics).toContainText('Неуказанных результатов: 1');
  const chart = dynamics.getByRole('img', { name: 'Изменения результата по датам', exact: true });
  await expect(chart).toBeVisible();
  await expect(chart.locator('[data-recorded-date]')).toHaveCount(3);
  await expect(chart.locator('[data-recorded-date] circle')).toHaveCount(1);
  await expect(dynamics).not.toContainText('99');
  await dynamics.locator('.goal-dynamics-events > summary').focus();
  await expect(dynamics.locator('.goal-dynamics-events > summary')).toBeFocused();
  await dynamics.locator('.goal-dynamics-events > summary').press('Enter');
  await expect(dynamics).toContainText('Результат дня не указан');
  await expect(dynamics).not.toContainText('известные изменения: 0');
  const correction = dynamics
    .locator('.goal-dynamics-record')
    .filter({ has: page.locator('summary').filter({ hasText: 'Уточнённый результат' }) });
  await correction.locator('summary').click();
  await expect(correction).toContainText('Ручная запись');
  await expect(correction).toContainText('Обновлено');
  const completion = dynamics
    .locator('.goal-dynamics-record')
    .filter({ has: page.locator('summary').filter({ hasText: 'Выполнение действия' }) });
  await completion.locator('summary').click();
  await completion.getByRole('link', { name: 'Открыть исходное действие', exact: true }).click();
  await expect(page).toHaveURL(/actions\/dynamics-training/);
  await page.goBack();
  await expect(dynamics).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('goal-dynamics.png'), fullPage: true });
  await page.goto('/#/v2/goals/dynamics-qualitative');
  await expect(dynamics).toContainText('Выполненные шаги за 30 дней');
  await expect(dynamics.getByRole('img')).toHaveCount(0);
  await dynamics.locator('.goal-dynamics-events > summary').click();
  await expect(dynamics).toContainText('dynamics-portfolio');
  await expect(dynamics).not.toContainText('%');
  expect(errors).toEqual([]);
});
