import { expect, test, type Page } from '@playwright/test';
import { DayDate, Direction, EntityId } from '../../src/domain';
import { createLifeActionDraft } from '../../src/test/helpers/LifeActionTestFactory';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { SleepScheduleRecordMapper } from '../../src/infrastructure/persistence/mappers/SleepScheduleRecordMapper';
import {
  createEmptySleepSchedule,
  updateSleepSettings,
} from '../../src/domain/sleep/SleepSchedule';
test.use({ timezoneId: 'Asia/Chita' });
async function seed(page: Page) {
  const now = new Date('2026-10-10T00:00:00Z');
  const direction = Direction.create({
    id: EntityId.create('autopilot-investments'),
    name: 'Инвестиции',
    now,
  });
  const actions = ['a', 'b', 'c', 'household'].map((id) => {
    const action = createLifeActionDraft(`autopilot-${id}`);
    if (id !== 'household') action.setContext(null, direction.id, null);
    return action;
  });
  const future = createLifeActionDraft('autopilot-future');
  future.setPlan(DayDate.create('2026-10-11'), false);
  future.setContext(null, direction.id, null);
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['lifeActions', 'directions', 'sleepSchedules'], 'readwrite');
        records.actions.forEach((record) => tx.objectStore('lifeActions').put(record));
        tx.objectStore('directions').put(records.direction);
        tx.objectStore('sleepSchedules').put(records.sleep);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      actions: [...actions, future].map(LifeActionRecordMapper.toRecord),
      direction: DirectionRecordMapper.toRecord(direction),
      sleep: SleepScheduleRecordMapper.toRecord(
        updateSleepSettings(
          createEmptySleepSchedule(),
          { bedtime: '22:00', wakeTime: '07:00', timeZone: 'Asia/Chita', enabled: false },
          now,
        ),
      ),
    },
  );
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result: Record<string, unknown[]> = {};
    for (const name of ['lifeActions', 'routineBlocks', 'actionSessions'])
      result[name] = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    db.close();
    return result;
  });
}
test('preferences choose backlog work, edit preview and preserve routines after apply and reload', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.clock.install({ time: new Date('2026-10-10T00:00:00Z') });
  await page.clock.setFixedTime(new Date('2026-10-10T00:00:00Z'));
  await page.goto('/#/v2/today');
  await expect(page.getByRole('region', { name: 'План на сегодня', exact: true })).toBeVisible();
  await seed(page);
  await page.goto('/#/v2/routine/day');
  const card = page.locator('.planner-day-autopilot');
  await expect(card).toBeVisible();
  await card
    .getByRole('combobox', { name: 'Главный фокус', exact: true })
    .selectOption(JSON.stringify({ kind: 'direction', id: 'autopilot-investments' }));
  await card.getByLabel('Пожелания на день', { exact: true }).fill('Нераспознанное пожелание');
  await card.getByLabel('Начать с', { exact: true }).fill('09:00');
  await card.getByLabel('Закончить до').fill('22:00');
  await card.locator('.autopilot-form__routine > summary').click();
  await card.getByLabel('Начало прогулки', { exact: true }).fill('14:00');
  await card.getByRole('button', { name: 'Собрать мой день', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Уточните пожелания');
  await card
    .getByRole('combobox', { name: 'Уточнить «Нераспознанное пожелание»', exact: true })
    .selectOption(JSON.stringify({ kind: 'action', id: 'autopilot-household' }));
  await card.getByRole('button', { name: 'Собрать мой день', exact: true }).click();
  const timeline = card.getByRole('list', { name: 'Предложенные блоки', exact: true });
  await expect(timeline).toContainText('Действие autopilot-a');
  await expect(timeline).toContainText('Пожелание на день');
  await expect(timeline).toContainText('Прогулка');
  await expect(timeline).toContainText('Вечерняя подготовка ко сну');
  await expect(timeline).not.toContainText('autopilot-future');
  await timeline.getByLabel('Длительность: Действие autopilot-a', { exact: true }).fill('40');
  await timeline.getByLabel('Длительность: Действие autopilot-a', { exact: true }).press('Enter');
  await expect(timeline).toContainText('09:00–09:40');
  await timeline
    .getByRole('listitem')
    .filter({ hasText: 'Действие autopilot-b' })
    .getByRole('button', { name: 'Исключить', exact: true })
    .click();
  await expect(
    timeline.getByLabel('Длительность: Действие autopilot-b', { exact: true }),
  ).toHaveCount(0);
  const before = await stored(page);
  if (info.project.name === 'mobile-chrome')
    expect(
      await timeline
        .getByRole('listitem')
        .first()
        .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
    ).toBe(1);
  await page.screenshot({
    path: `artifacts/visual-qa/preference-day-autopilot/preview-${info.project.name}.png`,
    fullPage: true,
  });
  await card.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(card).toContainText('План применён: 3 задачи.');
  const after = await stored(page);
  expect(after.actionSessions).toEqual(before.actionSessions);
  const actions = after.lifeActions as Array<{
    id: string;
    estimateMinutes: number | null;
    plannedDate: string | null;
    scheduledStartMinute: number | null;
  }>;
  expect(actions.find((action) => action.id === 'autopilot-a')?.estimateMinutes).toBe(40);
  expect(actions.find((action) => action.id === 'autopilot-c')?.estimateMinutes).toBeNull();
  expect(actions.find((action) => action.id === 'autopilot-future')?.plannedDate).toBe(
    '2026-10-11',
  );
  expect(after.routineBlocks).toHaveLength(3);
  await page.reload();
  await expect(card.getByRole('combobox', { name: 'Главный фокус', exact: true })).toHaveValue(
    JSON.stringify({ kind: 'direction', id: 'autopilot-investments' }),
  );
  await expect(card.getByLabel('Пожелания на день', { exact: true })).toHaveValue(
    'Действие autopilot-household',
  );
  await page.goto('/#/v2/actions?view=calendar');
  await page.getByRole('button', { name: 'День', exact: true }).click();
  const routines = page.locator('.planner-time-routine-list');
  await expect(routines).toContainText('Отдых');
  await expect(routines).toContainText('Прогулка');
  await expect(routines).toContainText('Вечерняя подготовка ко сну');
  await page.screenshot({
    path: `artifacts/visual-qa/preference-day-autopilot/calendar-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto('/#/v2/routine/day');
  await card.getByLabel('Пересобрать будущие блоки').check();
  await card.getByRole('button', { name: 'Собрать мой день', exact: true }).click();
  await expect(timeline).toContainText('09:00–09:40');
  await card.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(card).toContainText('План применён: 3 задачи.');
  expect((await stored(page)).routineBlocks).toHaveLength(3);
  const sizes =
    info.project.name === 'desktop-chrome'
      ? [
          { width: 1600, height: 900 },
          { width: 1280, height: 720 },
        ]
      : [{ width: 360, height: 800 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.screenshot({
      path: `artifacts/visual-qa/preference-day-autopilot/form-${size.width}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.getByLabel('Начать с', { exact: true }).focus();
  expect(
    await card
      .getByLabel('Начать с', { exact: true })
      .evaluate((node) => getComputedStyle(node).outlineStyle),
  ).not.toBe('none');
  expect(errors).toEqual([]);
});
