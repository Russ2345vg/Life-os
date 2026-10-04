import { expect, test, type Page } from '@playwright/test';
import { DayDate, type LifeAction } from '../../src/domain';
import { createLifeActionDraft } from '../../src/test/helpers/LifeActionTestFactory';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seedDay(page: Page, actions: readonly LifeAction[]) {
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opened = indexedDB.open('lifeos');
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['lifeActions', 'timeCapacity'], 'readwrite');
      for (const record of records) tx.objectStore('lifeActions').put(record);
      tx.objectStore('timeCapacity').put({
        schemaVersion: 1,
        id: 'time-capacity',
        weekdays: [240, 240, 240, 240, 240, 240, 240],
        version: 1,
      });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, actions.map(LifeActionRecordMapper.toRecord));
}

test('day autopilot previews, explains and atomically applies a realistic schedule', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'План на сегодня', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const main = createLifeActionDraft('autopilot-main');
  main.setPlan(DayDate.create(today), true);
  main.setTimePlanning({
    estimateMinutes: 50,
    scheduledStartMinute: null,
    scheduledDurationMinutes: null,
  });
  const notes = createLifeActionDraft('autopilot-notes');
  notes.setPlan(DayDate.create(today), false);
  const later = createLifeActionDraft('autopilot-later');
  later.setPlan(DayDate.create(today), false);
  later.setTimePlanning({
    estimateMinutes: 200,
    scheduledStartMinute: null,
    scheduledDurationMinutes: null,
  });
  await seedDay(page, [main, notes, later]);
  await page.reload();

  const card = page.getByRole('region', { name: 'Автопилот дня', exact: true });
  await expect(card).toBeVisible();
  await card.getByLabel('Начать с').fill('09:00');
  await card.getByRole('button', { name: 'Собрать мой день', exact: true }).click();

  const timeline = card.getByRole('list', { name: 'Предложенные блоки', exact: true });
  await expect(timeline).toContainText('09:00–09:50');
  await expect(timeline).toContainText('Действие autopilot-main');
  await expect(timeline).toContainText('Главное');
  await expect(timeline).toContainText('09:55–10:20');
  await expect(timeline).toContainText('Оценка 25 минут');
  await expect(card.getByText('Не поместилось', { exact: true })).toBeVisible();
  await expect(card.getByText('Действие autopilot-later', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(card).toContainText('План применён: 2 задачи.');
  await expect(page.getByText('09:00–09:50', { exact: true })).toBeVisible();
  await expect(page.getByText('09:55–10:20', { exact: true })).toBeVisible();

  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opened = indexedDB.open('lifeos');
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    const records = await new Promise<Array<{ id: string; scheduledStartMinute: number | null }>>(
      (resolve, reject) => {
        const request = db.transaction('lifeActions').objectStore('lifeActions').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return records
      .filter((record) => record.id.startsWith('autopilot-'))
      .map((record) => [record.id, record.scheduledStartMinute] as const)
      .sort(([left], [right]) => left.localeCompare(right));
  });
  expect(stored).toEqual([
    ['autopilot-later', null],
    ['autopilot-main', 540],
    ['autopilot-notes', 595],
  ]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
