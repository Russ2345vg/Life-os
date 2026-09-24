import { expect, test } from '@playwright/test';
import { EntityId, Goal } from '../../src/domain';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';

test('compact goal filters separate horizon, deadline and period and reset every condition', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/goals');
  await expect(page.getByRole('heading', { name: 'Цели', exact: true })).toBeVisible();
  const records = [
    Goal.create({
      id: EntityId.create('filter-now'),
      title: 'Ближайшая цель',
      horizon: 'now',
      dueDate: '2027-01-01',
      now: new Date(),
    }),
    Goal.create({
      id: EntityId.create('filter-later'),
      title: 'Будущая цель',
      horizon: 'someday',
      now: new Date(),
    }),
  ].map(GoalRecordMapper.toRecord);
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('goals', 'readwrite');
      records.forEach((record) => tx.objectStore('goals').put(record));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, records);
  await page.reload();
  const toggle = page.getByRole('button', { name: /^Фильтры(?: · \d+)?$/ });
  const panel = page.getByRole('region', { name: 'Фильтры целей', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('link', { name: 'Ближайшая цель', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('goals-compact.png'), fullPage: true });
  await toggle.click();
  await panel.getByLabel('Горизонт', { exact: true }).selectOption('now');
  await expect(page.getByRole('link', { name: 'Будущая цель', exact: true })).toBeHidden();
  await panel.getByLabel('Только без даты завершения', { exact: true }).check();
  await expect(page.getByRole('link', { name: 'Ближайшая цель', exact: true })).toBeHidden();
  await expect(toggle).toHaveText('Фильтры · 2');
  await panel.getByRole('button', { name: 'Сбросить все', exact: true }).click();
  await panel.getByLabel('Плановый период', { exact: true }).selectOption('week');
  await expect(toggle).toHaveText('Фильтры · 1');
  await expect(page.getByRole('link', { name: 'Ближайшая цель', exact: true })).toBeHidden();
  await panel.getByRole('button', { name: 'Показать: 0', exact: true }).click();
  await expect(toggle).toBeFocused();
  await page.getByRole('button', { name: 'Сбросить фильтры и поиск', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ближайшая цель', exact: true })).toBeVisible();
  await toggle.click();
  await panel.getByLabel('Плановый период', { exact: true }).selectOption('none');
  await expect(
    panel.getByText('Цели, не добавленные ни в один период планирования.', { exact: true }),
  ).toBeVisible();
  await panel.getByLabel('Горизонт', { exact: true }).selectOption('someday');
  await page.screenshot({ path: info.outputPath('goals-expanded.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await page
    .getByRole('button', { name: 'Убрать фильтр: Без периода', exact: true })
    .press('Enter');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveText('Фильтры · 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('compact action filters expose count, removable conditions and keyboard close', async ({
  page,
}, info) => {
  await page.goto('/#/v2/actions');
  const toggle = page.getByRole('button', { name: /^Фильтры(?: · \d+)?$/ });
  const panel = page.getByRole('region', { name: 'Фильтры действий', exact: true });
  await expect(panel).toBeHidden();
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await panel.getByRole('button', { name: 'Ближайшие', exact: true }).click();
  await panel.getByLabel('Только просроченные', { exact: true }).check();
  await expect(toggle).toHaveText('Фильтры · 2');
  await panel.getByRole('combobox', { name: 'Сортировка', exact: true }).selectOption('title');
  await expect(toggle).toHaveText('Фильтры · 2');
  await page.screenshot({ path: info.outputPath('actions-expanded.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Убрать фильтр: Ближайшие', exact: true }).press('Enter');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveText('Фильтры · 1');
  await toggle.click();
  await panel.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(toggle).toHaveText('Фильтры');
  await expect(panel.getByRole('combobox', { name: 'Сортировка', exact: true })).toHaveValue(
    'date',
  );
  await expect(panel.getByRole('button', { name: 'Все', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
