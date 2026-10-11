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
    id: EntityId.create('tomorrow-investments'),
    name: 'Инвестиции',
    now,
  });
  const home = Direction.create({ id: EntityId.create('tomorrow-home'), name: 'Дом', now });
  const backlog = createLifeActionDraft('tomorrow-backlog');
  const tomorrow = createLifeActionDraft('tomorrow-planned');
  const today = createLifeActionDraft('tomorrow-today');
  backlog.setContext(null, direction.id, null);
  tomorrow.setContext(null, direction.id, null);
  tomorrow.setPlan(DayDate.create('2026-10-11'), false);
  today.setContext(null, home.id, null);
  today.setPlan(DayDate.create('2026-10-10'), false);
  const todayRecord = LifeActionRecordMapper.toRecord(today);
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
        records.directions.forEach((record) => tx.objectStore('directions').put(record));
        tx.objectStore('sleepSchedules').put(records.sleep);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      actions: [
        LifeActionRecordMapper.toRecord(backlog),
        LifeActionRecordMapper.toRecord(tomorrow),
        todayRecord,
      ],
      directions: [direction, home].map(DirectionRecordMapper.toRecord),
      sleep: SleepScheduleRecordMapper.toRecord(
        updateSleepSettings(
          createEmptySleepSchedule(),
          { bedtime: '22:00', wakeTime: '07:00', timeZone: 'Asia/Chita', enabled: false },
          now,
        ),
      ),
    },
  );
  return todayRecord;
}

test('build tomorrow, discard the other date preview and save only the selected day', async ({
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
  const todayBefore = await seed(page);
  await page.reload();
  await expect(page.getByRole('region', { name: 'План на сегодня', exact: true })).toBeVisible();
  await page.goto('/#/v2/routine/day');
  const card = page.locator('.planner-day-autopilot');
  await expect(card.getByLabel('Начать с', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('entry.png'), fullPage: true });
  await info.attach('styles.json', {
    contentType: 'application/json',
    body: JSON.stringify(
      await page.evaluate(() => {
        const target = document.querySelector('.planner-day-autopilot')!;
        const styles = getComputedStyle(target);
        return {
          route: location.hash,
          stylesheets: [...document.styleSheets].map(
            (sheet) => sheet.href ?? sheet.ownerNode?.textContent?.slice(0, 100),
          ),
          background: styles.backgroundColor,
          color: styles.color,
          font: styles.fontFamily,
        };
      }),
    ),
  });
  const switcher = page.getByRole('group', { name: 'День автопилота', exact: true });
  await switcher.getByRole('button', { name: 'Завтра', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/routine\/day\?day=tomorrow$/);
  await expect(switcher.getByRole('button', { name: 'Завтра', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await switcher
      .getByRole('button', { name: 'Завтра', exact: true })
      .evaluate((button) => (button as HTMLElement).offsetHeight),
  ).toBeGreaterThanOrEqual(44);
  await expect(page.locator('time[datetime="2026-10-11"]')).toBeVisible();
  await expect(card.getByLabel('Начать с', { exact: true })).toHaveValue('09:00');
  await card.getByLabel('Закончить до', { exact: true }).fill('22:00');
  await card.locator('.autopilot-form__routine > summary').click();
  await expect(card.getByLabel('Начало прогулки', { exact: true })).toBeDisabled();
  await expect(card.getByLabel('Начало прогулки', { exact: true })).toHaveValue('18:16');
  await card
    .getByRole('combobox', { name: 'Главный фокус', exact: true })
    .selectOption(JSON.stringify({ kind: 'direction', id: 'tomorrow-investments' }));
  await card.getByLabel('Пожелания на день', { exact: true }).fill('Инвестиции');
  await card.getByRole('button', { name: 'Собрать план на завтра', exact: true }).click();
  const preview = card.getByRole('list', { name: 'Предложенные блоки', exact: true });
  await expect(preview).toContainText('Действие tomorrow-planned');
  await expect(preview).toContainText('Действие tomorrow-backlog');
  await switcher.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Собрать мой день', exact: true })).toBeVisible();
  await expect(preview).toHaveCount(0);
  await expect(card.getByLabel('Пожелания на день', { exact: true })).toHaveValue('');
  await switcher.getByRole('button', { name: 'Завтра', exact: true }).click();
  await expect(card.getByLabel('Пожелания на день', { exact: true })).toHaveValue('Инвестиции');
  await expect(preview).toHaveCount(0);
  await card.getByRole('button', { name: 'Собрать план на завтра', exact: true }).click();
  await expect(preview).toContainText('Действие tomorrow-planned');
  await page.screenshot({ path: info.outputPath('tomorrow-preview.png'), fullPage: true });
  await card.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(card).toContainText('План применён');
  await page.reload();
  await expect(switcher.getByRole('button', { name: 'Завтра', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    card.getByRole('list', { name: 'Сохранённое расписание', exact: true }),
  ).toContainText('Действие tomorrow-planned');
  const actions = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const request = db.transaction('lifeActions').objectStore('lifeActions').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records;
  });
  expect(actions.find((action) => action.id === 'tomorrow-today')).toEqual(todayBefore);
  expect(actions.find((action) => action.id === 'tomorrow-backlog')).toMatchObject({
    plannedDate: '2026-10-11',
  });
  expect(actions.find((action) => action.id === 'tomorrow-planned')).toMatchObject({
    plannedDate: '2026-10-11',
  });
  await page.screenshot({ path: info.outputPath('tomorrow-saved.png'), fullPage: true });
  await switcher.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(card.getByLabel('Пожелания на день', { exact: true })).toHaveValue('');
  await expect(
    card.getByRole('list', { name: 'Сохранённое расписание', exact: true }),
  ).not.toContainText('Действие tomorrow-planned');
  await expect(
    card.getByRole('list', { name: 'Сохранённое расписание', exact: true }),
  ).not.toContainText('Действие tomorrow-backlog');
  await expect(page).toHaveURL(/\/routine\/day$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
