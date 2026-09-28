import { expect, test, type Page } from '@playwright/test';
import { DayDate, type LifeAction } from '../../src/domain';
import {
  createLifeActionDraft,
  createReadyLifeAction,
} from '../../src/test/helpers/LifeActionTestFactory';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seedActions(page: Page, actions: readonly LifeAction[]) {
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opened = indexedDB.open('lifeos');
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      records.forEach((record) => tx.objectStore('lifeActions').put(record));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, actions.map(LifeActionRecordMapper.toRecord));
}

test('adjacent short blocks keep their real size and accessible editing controls', async ({
  page,
}) => {
  await page.goto('/#/v2/actions?view=calendar');
  await expect(page.getByRole('heading', { name: 'Расписание недели', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const first = createLifeActionDraft('short-one');
  const second = createLifeActionDraft('short-two');
  for (const [index, action] of [first, second].entries()) {
    action.setPlan(DayDate.create(today), false);
    action.setTimePlanning({
      estimateMinutes: 15,
      scheduledStartMinute: 600 + index * 15,
      scheduledDurationMinutes: 15,
    });
  }
  await seedActions(page, [first, second]);
  await page.reload();
  const firstBox = await page
    .locator('.planner-time-block')
    .filter({ hasText: 'short-one' })
    .boundingBox();
  const secondBox = await page
    .locator('.planner-time-block')
    .filter({ hasText: 'short-two' })
    .boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(firstBox!.y + firstBox!.height).toBeLessThanOrEqual(secondBox!.y);
  for (const name of ['short-one', 'short-two']) {
    const edit = page.getByRole('button', {
      name: `Изменить время: Действие ${name}`,
      exact: true,
    });
    await expect(edit).toBeVisible();
    expect((await edit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await edit.click();
    const form = page.getByRole('dialog', { name: 'Запланировать действие', exact: true });
    await form.getByLabel('Оценка работы, минуты').fill('20');
    await form.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(form).toHaveCount(0);
  }
});

test('an open time form keeps its original version after a refreshed action arrives', async ({
  page,
}) => {
  await page.goto('/tests/e2e/fixtures/time-planning-form.html');
  const form = page.getByRole('dialog', { name: 'Запланировать действие' });
  await form.getByLabel('Оценка работы, минуты').fill('60');
  await page.evaluate(() => window.postMessage('time-form-refresh', location.origin));
  await expect(page.getByText('Версия записи: 2', { exact: true })).toBeVisible();
  await expect(form.getByLabel('Оценка работы, минуты')).toHaveValue('60');
  await form.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Действие изменилось');
});

test('a prepared timed action remains readable after completion, reopening and reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/actions?view=calendar');
  await expect(page.getByRole('heading', { name: 'Расписание недели', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const action = createReadyLifeAction('prepared-time', DayDate.create(today));
  action.setTimePlanning({
    estimateMinutes: 90,
    scheduledStartMinute: 600,
    scheduledDurationMinutes: 60,
  });
  await seedActions(page, [action]);
  await page.goto('/#/v2/actions/prepared-time');
  const completion = page.getByRole('checkbox', {
    name: 'Выполнить: Действие prepared-time',
    exact: true,
  });
  await completion.click();
  const summary = page.getByRole('dialog', { name: 'Итог задачи', exact: true });
  await expect(summary).toBeVisible();
  await summary.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await page.getByRole('button', { name: 'Действия: Действие prepared-time', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Вернуть в работу', exact: true }).click();
  await expect(completion).not.toBeChecked();
  await expect(completion).toBeEnabled();
  await page.reload();
  await expect(completion).not.toBeChecked();
  await expect(page.getByRole('region', { name: 'Время действия' })).toContainText('10:00–11:00');
  await page.goto('/#/v2/actions?view=calendar');
  await expect(
    page.getByRole('button', { name: 'Действие prepared-time, 10:00–11:00', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('calendar schedules real actions, rejects overlaps and keeps capacity after reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/actions?view=calendar');
  await expect(page.getByRole('heading', { name: 'Расписание недели', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const first = createLifeActionDraft('time-first');
  const second = createLifeActionDraft('time-second');
  const undated = createLifeActionDraft('time-undated');
  first.setPlan(DayDate.create(today), false);
  second.setPlan(DayDate.create(today), false);
  first.setTimePlanning({
    estimateMinutes: 60,
    scheduledStartMinute: 600,
    scheduledDurationMinutes: 60,
  });
  await seedActions(page, [first, second, undated]);
  await page.reload();
  await expect(page.getByText('Доступное время не задано', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Выбрать время', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Запланировать действие', exact: true });
  await form.getByLabel('Оценка работы, минуты').fill('90');
  await form.getByLabel('Начало', { exact: true }).fill('10:30');
  await form.getByLabel('Длительность блока, минуты').fill('60');
  await form.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Это время занято');
  await form.getByLabel('Начало', { exact: true }).fill('11:00');
  await form.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.reload();
  const secondBlock = page.getByRole('button', {
    name: 'Действие time-second, 11:00–12:00',
    exact: true,
  });
  await expect(secondBlock).toBeVisible();
  await page.getByRole('button', { name: 'Настроить доступное время', exact: true }).click();
  const capacity = page.getByRole('dialog', { name: 'Доступное время', exact: true });
  await capacity.getByLabel('Часов в этот день недели').fill('6');
  await capacity.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(capacity).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Из 6 ч доступных', { exact: true })).toBeVisible();
  await secondBlock.click();
  await form.getByRole('button', { name: 'Убрать время', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(
    page.locator('.planner-time-untimed').filter({ hasText: 'Действие time-second' }),
  ).toContainText('1 ч 30 мин');
  const choose = page.getByRole('button', { name: 'Выбрать время', exact: true });
  await choose.click();
  await form.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(choose).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('time-calendar.png'), fullPage: true });
  await page.goto('/#/v2/today');
  await expect(page.getByText('10:00–11:00', { exact: true })).toBeVisible();
  await expect(page.getByText('План: 2 ч 30 мин · Доступно: 6 ч', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('time-today.png'), fullPage: true });
  await page.goto('/#/v2/actions/time-undated');
  await page.getByRole('button', { name: 'Планировать время', exact: true }).click();
  await expect(form.getByLabel('Начало', { exact: true })).toHaveCount(0);
  await form.getByLabel('Оценка работы, минуты').fill('45');
  await form.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Время действия' })).toContainText(
    'Оценка: 45 мин',
  );
  expect(errors).toEqual([]);
});
