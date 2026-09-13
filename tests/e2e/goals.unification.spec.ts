import { expect, test } from '@playwright/test';
import { EntityId, Project } from '../../src/domain';
import { ProjectGoalCompatibility } from '../../src/infrastructure/persistence/mappers/ProjectGoalCompatibility';

test('one album creates a goal, links a decision, persists and resolves an old project URL', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/goals');
  await expect(page.getByRole('tab', { name: 'Альбом целей', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toHaveCount(0);
  await page
    .locator('.goal-album-header')
    .getByRole('link', { name: 'Добавить цель', exact: true })
    .click();
  await page.getByLabel('Название цели', { exact: true }).fill('Единая цель E2E');
  await page.getByLabel('Описание', { exact: true }).fill('Сохранённое описание');
  await page.getByLabel('Почему это важно', { exact: true }).fill('Сохранённый смысл');
  await page.getByRole('button', { name: 'Создать цель', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Единая цель E2E', exact: true })).toBeVisible();
  const detailUrl = page.url();
  const management = page.getByRole('region', { name: 'Управление целью и связи' });
  await management.getByRole('button', { name: 'Создать решение', exact: true }).click();
  await page.getByLabel('Формулировка решения *', { exact: true }).fill('Шаг к единой цели');
  await page.getByLabel('Ожидаемый результат *', { exact: true }).fill('Решение связано');
  await expect(page.getByRole('combobox', { name: 'Цель', exact: true })).toBeDisabled();
  await management
    .locator('form')
    .getByRole('button', { name: 'Создать решение', exact: true })
    .click();
  await expect(management).toContainText('Шаг к единой цели');
  await page.reload();
  await expect(management).toContainText('Шаг к единой цели');
  await expect(page.getByText('Сохранённый смысл', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('goal-detail', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  // A migrated canonical record opens through the retained legacy route.
  const legacy = {
    ...ProjectGoalCompatibility.toRecord(
      Project.create({
        id: EntityId.create('goal-from-project:legacy-e2e'),
        title: 'Перенесённая цель',
        now: new Date(),
      }),
    ),
    legacyProjectId: 'legacy-e2e',
  };
  await page.evaluate(async (record) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('lifeos');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('goals', 'readwrite');
      tx.objectStore('goals').put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, legacy);
  await page.goto('/#/projects/legacy-e2e');
  await expect(page.getByRole('heading', { name: 'Перенесённая цель', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Приостановить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Возобновить', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Возобновить', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Решения', exact: true }).click();
  await page.getByRole('button', { name: /Открыть решение «Шаг к единой цели»/ }).click();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Цель', exact: true })
    .selectOption('goal-from-project:legacy-e2e');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await page.getByRole('button', { name: 'Перенесённая цель →', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Перенесённая цель', exact: true })).toBeVisible();
  await expect(management).toContainText('Шаг к единой цели');
  await page.reload();
  await expect(management).toContainText('Шаг к единой цели');
  await page.goto(detailUrl);
  await expect(management).toContainText('Связанных решений пока нет.');
  await page.getByRole('link', { name: 'Альбом целей', exact: true }).click();
  await expect(page.locator('.goal-album-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('goal-album', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
