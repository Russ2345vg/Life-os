import { expect, test } from '@playwright/test';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../src/domain';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

test('dated action groups collapse independently and reopen from the keyboard', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/actions', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();

  const now = new Date();
  const later = new Date(now);
  later.setDate(later.getDate() + 30);
  const actions = [
    { id: 'group-today', title: 'Работа сегодня', date: now },
    { id: 'group-later', title: 'Работа позже', date: later },
  ].map(({ id, title, date }) =>
    LifeActionRecordMapper.toRecord(
      LifeAction.createDraft({
        id: EntityId.create(id),
        title: LifeActionTitle.create(title),
        plannedDate: DayDate.fromParts(date.getFullYear(), date.getMonth() + 1, date.getDate()),
        createdAt: now,
        eventId: EntityId.create(`${id}-created`),
      }),
    ),
  );
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('lifeActions', 'readwrite');
      records.forEach((record) => transaction.objectStore('lifeActions').put(record));
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, actions);
  await page.reload({ waitUntil: 'domcontentloaded' });

  const todayGroup = page
    .locator('details.planner-action-group')
    .filter({ has: page.getByRole('heading', { name: 'Сегодня 1' }) });
  const futureGroup = page
    .locator('details.planner-action-group')
    .filter({ has: page.getByRole('heading', { name: 'Позже 1' }) });
  const today = todayGroup.locator('summary');
  const future = futureGroup.locator('summary');
  const todayAction = page.getByRole('link', { name: 'Работа сегодня' });
  const futureAction = page.getByRole('link', { name: 'Работа позже' });
  await expect(todayAction).toBeVisible();
  await expect(futureAction).toBeVisible();

  await today.click();
  await expect(todayGroup).not.toHaveAttribute('open');
  await expect(todayAction).toBeHidden();
  await expect(futureAction).toBeVisible();
  await future.click();
  await expect(futureAction).toBeHidden();
  await today.focus();
  await page.keyboard.press('Enter');
  await expect(todayAction).toBeVisible();

  expect(
    await today.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
