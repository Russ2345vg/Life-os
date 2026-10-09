import { expect, test } from '@playwright/test';
import { openDisclosure } from './helpers/disclosures';
import { DayDate } from '../../src/domain';
import { addDays } from '../../src/domain/planner/PlanningPeriod';
import { createLifeActionDraft } from '../../src/test/helpers/LifeActionTestFactory';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

test('date undo survives navigation, refreshes lists and preserves the destination main', async ({
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
  const oldDate = addDays(today, -1);
  const original = createLifeActionDraft('undo-original');
  original.setPlan(DayDate.create(oldDate), true);
  const main = createLifeActionDraft('undo-main');
  main.setPlan(DayDate.create(today), true);
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      records.forEach((record) => tx.objectStore('lifeActions').put(record));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, [original, main].map(LifeActionRecordMapper.toRecord));
  await page.reload();
  await openDisclosure(page, '.planner-plan-review');
  const overdue = page.getByRole('region', { name: 'Осталось с прошлых дней' });
  await overdue.getByRole('button', { name: 'На сегодня', exact: true }).click();
  const undo = page.getByRole('button', { name: 'Отменить изменение даты', exact: true });
  await expect(undo).toBeVisible();
  await expect(page.getByRole('region', { name: 'Главное сегодня', exact: true })).toContainText(
    'Действие undo-main',
  );
  expect((await undo.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('date-undo.png'), fullPage: true });
  await page.goto('/#/v2/actions');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  await undo.click();
  await expect(undo).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Прежняя дата восстановлена');
  await expect(
    page.locator('.planner-action-item').filter({ hasText: 'Действие undo-original' }),
  ).toContainText(
    new Date(`${oldDate}T12:00:00`).toLocaleDateString('ru', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );
  await page.goto('/#/v2/today');
  await openDisclosure(page, '.planner-plan-review');
  await expect(overdue).toContainText('Действие undo-original');
  await expect(page.getByRole('region', { name: 'Главное сегодня', exact: true })).toContainText(
    'Действие undo-main',
  );
  await page.reload();
  await openDisclosure(page, '.planner-plan-review');
  await expect(overdue).toContainText('Действие undo-original');
  expect(errors).toEqual([]);
});
