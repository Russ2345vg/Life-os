import { expect, test } from '@playwright/test';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../src/domain';
import { addDays } from '../../src/domain/planner/PlanningPeriod';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

test('evening keeps one checklist and captures a thought in the existing inbox', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Последние 14 вечеров' })).toBeVisible();
  await expect(
    page
      .locator('.sleep-summary-card--history:visible')
      .getByText('Пока нет истории предыдущих вечеров.'),
  ).toBeVisible();
  const closure = page.locator('.sleep-day-closure');
  await expect(closure).not.toHaveAttribute('open', '');
  await closure.locator('summary').click();
  await expect(closure.getByText('На этот день незавершённых дел нет.')).toBeVisible();
  await closure
    .getByLabel('Что осталось в голове?', { exact: true })
    .fill('Уточнить время встречи');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    let failed = false;
    IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'inboxIdeas' && !failed) {
        failed = true;
        throw new Error('Не удалось сохранить мысль.');
      }
      return original.apply(this, args);
    };
  });
  await closure.getByRole('button', { name: 'Во входящие', exact: true }).click();
  await expect(closure.getByRole('alert')).toContainText('Не удалось сохранить мысль.');
  await expect(closure.getByLabel('Что осталось в голове?', { exact: true })).toHaveValue(
    'Уточнить время встречи',
  );
  await closure.getByRole('button', { name: 'Во входящие', exact: true }).click();
  await expect(closure.getByRole('status')).toContainText('Мысль сохранена');
  await expect(closure.getByLabel('Что осталось в голове?', { exact: true })).toHaveValue('');
  await page.screenshot({ path: testInfo.outputPath('evening-support.png'), fullPage: true });
  await page.goto('/#/v2/inbox');
  await expect(page.getByText('Уточнить время встречи', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('after midnight evening opens the calendar day named in its tomorrow heading', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-28T01:00:00+09:00') });
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByLabel('Часовой пояс', { exact: true }).fill('Asia/Chita');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  const closure = page.locator('.sleep-day-closure');
  await closure.locator('summary').click();
  await expect(
    closure.getByText('Дела за 2026-09-27 · Завтра 2026-09-28.', { exact: false }),
  ).toBeVisible();
  await expect(closure.getByRole('link', { name: 'Открыть план на завтра' })).toHaveAttribute(
    'href',
    '#/v2/today',
  );
});

test('evening moves a specific action and replaces tomorrow main through planner commands', async ({
  page,
}) => {
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Список подготовки' })).toBeVisible();
  const date = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lifeos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const record = await new Promise<{ nightCycles: { cycleDate: string }[] }>((resolve) => {
      const req = db
        .transaction('sleepSchedules')
        .objectStore('sleepSchedules')
        .get('sleep-schedule');
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return record.nightCycles[0]!.cycleDate;
  });
  const now = new Date();
  const records = [
    ['move', 'Разобрать письмо', date],
    ['old-main', 'Прежнее главное', addDays(date, 1)],
  ].map(([id, title, day]) =>
    LifeActionRecordMapper.toRecord(
      LifeAction.createDraft({
        id: EntityId.create(id!),
        title: LifeActionTitle.create(title!),
        plannedDate: DayDate.create(day!),
        isNext: id === 'old-main',
        createdAt: now,
        eventId: EntityId.create(`event-${id}`),
      }),
    ),
  );
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lifeos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      records.forEach((record) => tx.objectStore('lifeActions').put(record));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, records);
  await page.reload();
  const closure = page.locator('.sleep-day-closure');
  await closure.locator('summary').click();
  await expect(closure.getByText('Сейчас главное: Прежнее главное')).toBeVisible();
  await closure.getByRole('button', { name: 'На завтра', exact: true }).click();
  await expect(closure.getByRole('status')).toContainText('Дело перенесено');
  await closure.getByRole('button', { name: 'Заменить главное', exact: true }).click();
  await expect(closure.getByText('Сейчас главное: Разобрать письмо')).toBeVisible();
  await page.reload();
  await closure.locator('summary').click();
  await expect(closure.getByText('Сейчас главное: Разобрать письмо')).toBeVisible();
  await expect(closure.getByText('На этот день незавершённых дел нет.')).toBeVisible();
});
