import { expect, test, type Page } from '@playwright/test';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../src/domain';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seed(page: Page) {
  await page.goto('/#/v2/actions');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  const now = new Date();
  const action = LifeAction.createDraft({
    id: EntityId.create('summary-action'),
    title: LifeActionTitle.create('Проверить итог'),
    plannedDate: DayDate.fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    createdAt: now,
    eventId: EntityId.create('summary-created'),
  });
  await page.evaluate(async (record) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      tx.objectStore('lifeActions').put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, LifeActionRecordMapper.toRecord(action));
  await page.goto('/#/v2/actions/summary-action');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Проверить итог', exact: true })).toBeVisible();
}

test('opens an optional summary after durable completion and allows later editing', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  await page.screenshot({ path: info.outputPath('summary-before.png'), fullPage: true });
  await page.getByRole('checkbox', { name: 'Выполнить: Проверить итог', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Итог задачи', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Итог задачи', { exact: true })).toBeFocused();
  await dialog
    .getByLabel('Итог задачи', { exact: true })
    .fill('Проверил настройки и сохранил результат.');
  await page.screenshot({ path: info.outputPath('summary-dialog.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.locator('.planner-action-note').filter({ hasText: 'Проверил настройки' }),
  ).toBeVisible();
  await page.locator('.planner-completion-result summary').click();
  await page
    .locator('.planner-completion-result')
    .getByLabel('Итог задачи', { exact: true })
    .fill('Уточнённый итог.');
  await page
    .locator('.planner-completion-result')
    .getByRole('button', { name: 'Сохранить итог', exact: true })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Итог сохранён' })).toBeVisible();
  await page.reload();
  await expect(
    page.locator('.planner-action-note').filter({ hasText: 'Уточнённый итог.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
