import { expect, test, type Page } from '@playwright/test';
import { EntityId, Goal, LifeAction, LifeActionTitle } from '../../src/domain';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seed(page: Page) {
  await page.goto('/#/v2/goals');
  await expect(page.getByRole('heading', { name: 'Цели', exact: true })).toBeVisible();
  const now = new Date();
  const goal = Goal.create({
    id: EntityId.create('completion-goal'),
    title: 'Завершить учебный курс',
    now,
  });
  const action = LifeAction.createDraft({
    id: EntityId.create('completion-action'),
    title: LifeActionTitle.create('Отправить заявку'),
    createdAt: now,
    eventId: EntityId.create('completion-created'),
  });
  await page.evaluate(
    async ({ goal, action }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['goals', 'lifeActions'], 'readwrite');
        tx.objectStore('goals').put(goal);
        tx.objectStore('lifeActions').put(action);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { goal: GoalRecordMapper.toRecord(goal), action: LifeActionRecordMapper.toRecord(action) },
  );
  await page.reload();
}

test('completed goals disappear from the list and can be shown, filtered and reopened', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  const goal = page.getByRole('link', { name: 'Завершить учебный курс', exact: true });
  await goal.click();
  await page.getByRole('button', { name: 'Завершить цель', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить цель', exact: true })).toBeHidden();
  await page.getByRole('link', { name: '← Все цели', exact: true }).click();
  await expect(goal).toBeHidden();
  await expect(page.getByText('Нет незавершённых целей.', { exact: false })).toBeVisible();
  const toggle = page.getByRole('button', { name: /^Фильтры(?: · \d+)?$/ });
  await toggle.click();
  const panel = page.getByRole('region', { name: 'Фильтры целей', exact: true });
  await panel.getByLabel('Показать выполненные', { exact: true }).check();
  await expect(goal).toBeVisible();
  await expect(toggle).toHaveText('Фильтры · 1');
  await page.screenshot({ path: info.outputPath('completed-goals-filter.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Сбросить все', exact: true }).click();
  await expect(goal).toBeHidden();
  await panel.getByRole('combobox', { name: 'Состояние', exact: true }).selectOption('achieved');
  await expect(goal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await page.getByRole('button', { name: 'Действия: Завершить учебный курс', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Вернуть в активные', exact: true }).click();
  await expect(goal).toBeHidden();
  await page.getByRole('button', { name: 'Убрать фильтр: Достигнута', exact: true }).click();
  await expect(goal).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('completed standalone actions disappear immediately and remain available in the completed filter', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  await page.goto('/#/v2/actions');
  const toggle = page.getByRole('button', { name: /^Фильтры(?: · \d+)?$/ });
  await toggle.click();
  const panel = page.getByRole('region', { name: 'Фильтры действий', exact: true });
  await panel.getByRole('button', { name: 'Без цели', exact: true }).click();
  await page.keyboard.press('Escape');
  const action = page.getByRole('link', { name: 'Отправить заявку', exact: true });
  await page.getByRole('checkbox', { name: 'Выполнить: Отправить заявку', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Итог задачи', exact: true })
    .getByRole('button', { name: 'Пропустить', exact: true })
    .click();
  await expect(action).toBeHidden();
  await toggle.click();
  await panel.getByRole('button', { name: 'Выполненные', exact: true }).click();
  await expect(action).toBeVisible();
  await page.screenshot({ path: info.outputPath('completed-actions-filter.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(action).toBeHidden();
  await page.reload();
  await expect(action).toBeHidden();
  await toggle.click();
  await panel.getByRole('button', { name: 'Выполненные', exact: true }).click();
  await expect(action).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
