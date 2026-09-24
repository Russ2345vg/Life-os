import { expect, test, type Page } from '@playwright/test';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../src/domain';
import { addDays } from '../../src/domain/planner/PlanningPeriod';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import {
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../src/test/helpers/LifeActionTestFactory';

async function putActions(page: Page, actions: readonly LifeAction[]) {
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('lifeActions', 'readwrite');
        records.forEach((record) => tx.objectStore('lifeActions').put(record));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, actions.map(LifeActionRecordMapper.toRecord));
}

async function seed(page: Page) {
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const yesterday = addDays(today, -1);
  const draft = (id: string, title: string, date: string, main = false) =>
    LifeAction.createDraft({
      id: EntityId.create(id),
      title: LifeActionTitle.create(title),
      plannedDate: DayDate.create(date),
      isNext: main,
      createdAt: new Date(`${yesterday}T10:00:00`),
      eventId: EntityId.create(`${id}-created`),
    });
  const actions = [
    draft('overdue-move', 'Вчерашнее главное дело', yesterday, true),
    draft('overdue-date', 'Дело для другой даты', yesterday),
    draft('overdue-clear', 'Дело без обязательного срока', yesterday),
    draft('current-main', 'Главное дело сегодня', today, true),
    draft('future', 'Будущее дело', addDays(today, 2)),
  ];
  await putActions(page, actions);
  await page.reload();
  const overdue = page.getByRole('region', { name: 'Осталось с прошлых дней' });
  await expect(overdue).toBeVisible();
  return { today, yesterday, actions, overdue };
}

test('unfinished previous days: three decisions persist without replacing the main action', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { today, overdue } = await seed(page);
  const row = (title: string) => overdue.getByRole('listitem').filter({ hasText: title });
  await expect(overdue.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByLabel('Прогресс дня')).toHaveAttribute('value', '0');
  await overdue.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('overdue-initial.png'), fullPage: true });
  await overdue.screenshot({ path: testInfo.outputPath('overdue-block.png') });
  for (const button of await overdue
    .getByRole('button', { name: /^(На сегодня|Выбрать дату|Убрать из плана)$/ })
    .all()) {
    const bounds = await button.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await row('Вчерашнее главное дело')
    .getByRole('button', { name: 'На сегодня', exact: true })
    .click();
  await expect(overdue.getByRole('listitem')).toHaveCount(2);
  await expect(
    overdue.getByRole('button', { name: 'Дело для другой даты', exact: true }),
  ).toBeFocused();
  await expect(page.locator('.planner-main')).toContainText('Главное дело сегодня');
  await expect(page.locator('.planner-today-list')).toContainText('Вчерашнее главное дело');

  const dated = row('Дело для другой даты');
  await dated.getByRole('button', { name: 'Выбрать дату', exact: true }).click();
  const input = dated.getByLabel('Новая дата: Дело для другой даты', { exact: true });
  await expect(input).toBeFocused();
  await input.fill(addDays(today, -1));
  await expect(dated.getByRole('button', { name: 'Сохранить дату' })).toBeDisabled();
  await input.fill(addDays(today, 3));
  await input.press('Escape');
  await expect(dated.getByRole('button', { name: 'Выбрать дату' })).toBeFocused();
  await dated.getByRole('button', { name: 'Выбрать дату' }).click();
  await expect(input).toHaveValue(addDays(today, 3));
  await dated.getByRole('button', { name: 'Сохранить дату' }).click();
  await expect(overdue.getByRole('listitem')).toHaveCount(1);

  await row('Дело без обязательного срока')
    .getByRole('button', { name: 'Убрать из плана' })
    .click();
  await expect(overdue).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  await expect(overdue).toHaveCount(0);
  await expect(page.locator('.planner-main')).toContainText('Главное дело сегодня');
  await expect(page.locator('.planner-today-list')).toContainText('Вчерашнее главное дело');
  const undated = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: 'Без даты' }) });
  await undated.locator('summary').click();
  await expect(undated).toContainText('Дело без обязательного срока');

  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<
      { id: string; plannedDate: string | null; isNext: boolean }[]
    >((resolve, reject) => {
      const request = db.transaction('lifeActions').objectStore('lifeActions').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records;
  });
  expect(stored.find((a) => a.id === 'overdue-date')?.plannedDate).toBe(addDays(today, 3));
  expect(stored.find((a) => a.id === 'overdue-clear')?.plannedDate).toBeNull();
  expect(stored.find((a) => a.id === 'overdue-move')).toMatchObject({
    plannedDate: today,
    isNext: false,
  });
  expect(errors).toEqual([]);
});

test('unfinished previous days: legacy restrictions and a failed stale action remain recoverable', async ({
  page,
}, testInfo) => {
  const { yesterday, actions, overdue } = await seed(page);
  const ready = createReadyLifeAction('legacy-ready', DayDate.create(yesterday));
  const running = markLifeActionInProgress(
    createReadyLifeAction('legacy-running', DayDate.create(yesterday)),
  );
  const completed = completeLifeAction(
    createReadyLifeAction('legacy-completed', DayDate.create(yesterday)),
  );
  await putActions(page, [ready, running, completed]);
  await page.reload();
  const readyRow = overdue.getByRole('listitem').filter({ hasText: 'Действие legacy-ready' });
  await expect(readyRow.getByRole('button', { name: 'Убрать из плана' })).toHaveCount(0);
  await readyRow.getByRole('button', { name: 'На сегодня', exact: true }).click();
  await expect(readyRow).toHaveCount(0);
  const runningRow = overdue.getByRole('listitem').filter({ hasText: 'Действие legacy-running' });
  await expect(runningRow).toContainText('Действие уже выполняется');
  await expect(runningRow.getByRole('button', { name: 'На сегодня', exact: true })).toHaveCount(0);
  await expect(overdue).not.toContainText('Действие legacy-completed');

  // Another writer prepares the action after this screen was rendered.
  await putActions(page, [createReadyLifeAction('overdue-clear', DayDate.create(yesterday))]);
  const stale = overdue.getByRole('listitem').filter({ hasText: 'Дело без обязательного срока' });
  await stale.getByRole('button', { name: 'Убрать из плана' }).click();
  await expect(stale.getByRole('alert')).toContainText('нельзя убрать');
  await expect(stale.getByRole('button', { name: 'Убрать из плана' })).toBeEnabled();
  await stale.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('overdue-error.png'), fullPage: true });
  await putActions(page, [actions[2]!]);
  await stale.getByRole('button', { name: 'Убрать из плана' }).click();
  await expect(stale).toHaveCount(0);
  await page.getByRole('button', { name: 'Завтра', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Завтра', exact: true })).toBeVisible();
  await expect(overdue).toHaveCount(0);
});
