import { expect, test, type Page } from '@playwright/test';
import { ActionSession, DayDate, EntityId } from '../../src/domain';
import { createLifeActionDraft } from '../../src/test/helpers/LifeActionTestFactory';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { ActionSessionRecordMapper } from '../../src/infrastructure/persistence/mappers/ActionSessionRecordMapper';

async function ready(page: Page) {
  await page.goto('/#/v2/actions?view=time');
  await expect(page.getByRole('heading', { name: 'Рабочее время', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать работу', exact: true })).toBeVisible();
}
async function seed(page: Page, withConflicts = false) {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  now.setHours(11, 0, 0, 0);
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const planned = createLifeActionDraft('work-project');
  planned.setPlan(DayDate.create(date), false);
  planned.setTimePlanning({
    estimateMinutes: 90,
    scheduledStartMinute: 600,
    scheduledDurationMinutes: 60,
  });
  const undated = createLifeActionDraft('work-undated');
  const session = ActionSession.start({
    id: EntityId.create('history'),
    lifeActionId: planned.id,
    startedAt: new Date(now.getTime() - 3600000),
    eventId: EntityId.create('history-start'),
  });
  session.pause(new Date(now.getTime() - 2400000), EntityId.create('history-pause'));
  session.resume(new Date(now.getTime() - 1800000), EntityId.create('history-resume'));
  session.complete({
    completedAt: new Date(now.getTime() - 1200000),
    completionKind: 'completed',
    eventId: EntityId.create('history-stop'),
  });
  const sessions = [session];
  if (withConflicts) {
    sessions.push(
      ActionSession.start({
        id: EntityId.create('import-one'),
        lifeActionId: planned.id,
        startedAt: new Date(now.getTime() - 600000),
        eventId: EntityId.create('one-start'),
      }),
    );
    sessions.push(
      ActionSession.start({
        id: EntityId.create('import-two'),
        lifeActionId: EntityId.create('missing'),
        startedAt: new Date(now.getTime() - 300000),
        eventId: EntityId.create('two-start'),
      }),
    );
  }
  await page.evaluate(
    async (input) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['lifeActions', 'actionSessions'], 'readwrite');
        input.actions.forEach((record) => tx.objectStore('lifeActions').put(record));
        input.sessions.forEach((record) => tx.objectStore('actionSessions').put(record));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      actions: [planned, undated].map(LifeActionRecordMapper.toRecord),
      sessions: sessions.map(ActionSessionRecordMapper.toRecord),
    },
  );
  await page.reload();
  return date;
}
test('work time restores pause and finish without completing the action', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  const historyDate = await seed(page);
  await page.getByLabel('Дата отчёта').fill(historyDate);
  const totals = page.getByRole('region', { name: 'Итоги периода' });
  await expect(totals).toContainText('30 мин');
  await page.getByLabel('Действие для работы').selectOption('work-undated');
  await page.getByRole('button', { name: 'Начать работу', exact: true }).click();
  const current = page.getByRole('region', {
    name: 'Текущая работа: Действие work-undated',
    exact: true,
  });
  await expect(current).toBeVisible();
  await current.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(current).toContainText('На паузе');
  const paused = await current.getByLabel('Отработано в сессии').textContent();
  await page.reload();
  await expect(current).toContainText('На паузе');
  await expect(current.getByLabel('Отработано в сессии')).toHaveText(paused!);
  await current.getByRole('button', { name: 'Продолжить', exact: true }).focus();
  await current.getByRole('button', { name: 'Продолжить', exact: true }).press('Space');
  await expect(current).toContainText('Работа идёт');
  await expect(page.getByText('Работа продолжена', { exact: true })).toHaveCount(0, {
    timeout: 6000,
  });
  await page.screenshot({ path: testInfo.outputPath('work-time.png'), fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await current.getByRole('button', { name: 'Закончить работу', exact: true }).click();
  await expect(current).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Начать работу', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Неделя', exact: true }).click();
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Неделя', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Показать действия').selectOption('worked');
  const table = page.getByRole('table', { name: 'Время по действиям' });
  await expect(table).toContainText('Действие work-undated');
  await page.getByLabel('Показать действия').selectOption('unknown');
  await expect(page.getByRole('table', { name: 'Время по действиям' })).toHaveCount(0);
  await page.getByLabel('Показать действия').selectOption('worked');
  await table.getByRole('button', { name: 'Действие work-undated', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Выполнить: Действие work-undated', exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'Рабочее время', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Рабочее время', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('table', { name: 'Время по действиям' })).toContainText(
    'Действие work-undated',
  );
  expect(errors).toEqual([]);
});
test('a failed start can be refreshed and retried with an available action', async ({ page }) => {
  await ready(page);
  await seed(page);
  await page.getByLabel('Действие для работы').selectOption('work-project');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      tx.objectStore('lifeActions').delete('work-project');
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.getByRole('button', { name: 'Начать работу', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Начать работу можно только с открытым действием',
  );
  await page.getByRole('button', { name: 'Обновить сессии', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Действие для работы').selectOption('work-undated');
  await page.getByRole('button', { name: 'Начать работу', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Текущая работа: Действие work-undated', exact: true }),
  ).toBeVisible();
});
test('imported unfinished sessions stay visible and can both be ended', async ({ page }) => {
  await ready(page);
  await seed(page, true);
  await expect(page.getByRole('alert')).toContainText('Несколько незавершённых сессий');
  await expect(page.getByRole('button', { name: 'Начать работу', exact: true })).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Текущая работа: Действие недоступно', exact: true })
    .getByRole('button', { name: 'Закончить работу', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Текущая работа: Действие work-project', exact: true })
    .getByRole('button', { name: 'Закончить работу', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Начать работу', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table', { name: 'Время по действиям' })).toContainText(
    'Действие недоступно',
  );
});
test('a second tab refreshes sessions in local web mode and cannot start a competing timer', async ({
  page,
  context,
}) => {
  await ready(page);
  const historyDate = await seed(page);
  await page.getByLabel('Дата отчёта').fill(historyDate);
  const other = await context.newPage();
  await ready(other);
  await page.getByLabel('Действие для работы').selectOption('work-project');
  await page.getByRole('button', { name: 'Начать работу', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Начать работу', exact: true })).toHaveCount(0, {
    timeout: 12000,
  });
  const otherCurrent = other.getByRole('region', {
    name: 'Текущая работа: Действие work-project',
    exact: true,
  });
  await expect(otherCurrent).toBeVisible();
  await otherCurrent.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.bringToFront();
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeVisible({
    timeout: 12000,
  });
  await other.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      const store = tx.objectStore('lifeActions');
      const request = store.get('work-project');
      request.onsuccess = () =>
        store.put({
          ...request.result,
          scheduledDurationMinutes: 90,
          version: request.result.version + 1,
        });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await expect(page.getByRole('region', { name: 'Итоги периода' })).toContainText('1 ч 30 мин', {
    timeout: 12000,
  });
  await page.getByRole('button', { name: 'Закончить работу', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Начать работу', exact: true })).toBeVisible({
    timeout: 12000,
  });
});
