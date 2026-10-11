import { expect, test, type Page } from '@playwright/test';
import { Direction, EntityId } from '../../src/domain';
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
  const directions = ['Инвестиции', 'Дом'].map((name, index) =>
    Direction.create({ id: EntityId.create(`organization-d${index}`), name, now }),
  );
  const actions = ['a', 'b', 'c', 'home'].map((id) => {
    const action = createLifeActionDraft(`organization-${id}`);
    action.setContext(null, directions[id === 'home' ? 1 : 0]!.id, null);
    action.setTimePlanning({
      estimateMinutes: 30,
      scheduledStartMinute: null,
      scheduledDurationMinutes: null,
    });
    return action;
  });
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
      actions: actions.map(LifeActionRecordMapper.toRecord),
      directions: directions.map(DirectionRecordMapper.toRecord),
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
test('organization settings save templates and apply ordered balanced work with persistent pins', async ({
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
  await card.getByText('Баланс, шаблоны и порядок дел', { exact: true }).click();
  await card.getByRole('button', { name: 'Добавить направление', exact: true }).click();
  await card.getByRole('button', { name: 'Добавить направление', exact: true }).click();
  await card.getByLabel('Доля: Инвестиции', { exact: true }).fill('60');
  await card.getByLabel('Доля: Дом', { exact: true }).fill('40');
  await card.getByLabel('Группировать похожие дела', { exact: true }).check();
  await card
    .getByRole('combobox', { name: 'Настроить действие', exact: true })
    .selectOption('organization-a');
  await card.getByLabel('Контекст действия', { exact: true }).fill('Компьютер');
  await card
    .getByRole('combobox', { name: 'Добавить предшественника', exact: true })
    .selectOption('organization-c');
  await card.getByLabel('Начать с', { exact: true }).fill('09:00');
  await card.getByLabel('Закончить до', { exact: true }).fill('22:00');
  await card.locator('.autopilot-form__routine > summary').click();
  await card.getByLabel('Начало прогулки', { exact: true }).fill('14:00');
  await card.getByLabel('Название шаблона', { exact: true }).fill('Мой смешанный день');
  await card.getByRole('button', { name: 'Сохранить новый шаблон', exact: true }).click();
  await expect(card.getByText('Шаблон сохранён.', { exact: true })).toBeVisible();
  await card.getByLabel('Доля: Инвестиции', { exact: true }).fill('50');
  await card
    .getByRole('combobox', { name: 'Шаблон дня', exact: true })
    .selectOption({ label: 'Мой смешанный день' });
  await expect(card.getByLabel('Доля: Инвестиции', { exact: true })).toHaveValue('60');
  await page.screenshot({ path: info.outputPath('organization-form.png'), fullPage: true });
  await card.getByRole('button', { name: 'Собрать мой день', exact: true }).click();
  const timeline = card.getByRole('list', { name: 'Предложенные блоки', exact: true });
  await expect(timeline).toContainText('Действие organization-home');
  const rows = timeline.getByRole('listitem').filter({ has: page.locator('button') });
  const titles = await rows.locator('strong').allTextContents();
  expect(titles.indexOf('Действие organization-c')).toBeLessThan(
    titles.indexOf('Действие organization-a'),
  );
  const a = timeline.getByRole('listitem').filter({ hasText: 'Действие organization-a' });
  const time = await a.locator('time').innerText();
  await a.getByRole('button', { name: 'Закрепить время', exact: true }).click();
  await expect(a.getByRole('button', { name: 'Снять закрепление', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(card).toContainText('План применён');
  await page.reload();
  await expect(
    card.getByRole('heading', { name: 'Сохранённое расписание', exact: true }),
  ).toBeVisible();
  const saved = card
    .getByRole('list', { name: 'Сохранённое расписание', exact: true })
    .getByRole('listitem')
    .filter({ hasText: 'Действие organization-a' });
  await expect(saved.locator('time')).toHaveText(time);
  await expect(saved.getByRole('button', { name: 'Снять закрепление', exact: true })).toBeVisible();
  await card.getByLabel('Пересобрать будущие блоки', { exact: true }).check();
  await card.getByRole('button', { name: 'Собрать мой день', exact: true }).click();
  await expect(
    timeline.getByRole('listitem').filter({ hasText: 'Действие organization-a' }).locator('time'),
  ).toHaveText(time);
  await page.screenshot({ path: info.outputPath('organization-preview.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  expect(errors).toEqual([]);
});
test('template conflict preserves input and supports durable recovery update and deletion', async ({
  page,
  context,
}, info) => {
  await page.clock.install({ time: new Date('2026-10-10T00:00:00Z') });
  await page.clock.setFixedTime(new Date('2026-10-10T00:00:00Z'));
  await page.goto('/#/v2/today');
  await expect(page.getByRole('region', { name: 'План на сегодня', exact: true })).toBeVisible();
  await seed(page);
  await page.goto('/#/v2/routine/day');
  const card = page.locator('.planner-day-autopilot');
  await card.getByText('Баланс, шаблоны и порядок дел', { exact: true }).click();
  await card.getByLabel('Название шаблона', { exact: true }).fill('Мой день');
  const other = await context.newPage();
  await other.clock.install({ time: new Date('2026-10-10T00:00:00Z') });
  await other.clock.setFixedTime(new Date('2026-10-10T00:00:00Z'));
  await other.goto('/#/v2/routine/day');
  await other.getByText('Баланс, шаблоны и порядок дел', { exact: true }).click();
  await other.getByRole('button', { name: 'Сохранить настройки организации', exact: true }).click();
  await expect(other.getByText('Настройки организации сохранены.', { exact: true })).toBeVisible();
  await other.close();
  await card.getByRole('button', { name: 'Сохранить новый шаблон', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Настройки изменились');
  await expect(card.getByLabel('Название шаблона', { exact: true })).toHaveValue('Мой день');
  await page.screenshot({ path: info.outputPath('organization-conflict.png'), fullPage: true });
  await card.getByRole('button', { name: 'Загрузить сохранённые настройки', exact: true }).click();
  await expect(card.getByRole('alert')).toHaveCount(0);
  await card.getByRole('button', { name: 'Сохранить новый шаблон', exact: true }).click();
  await expect(card.getByText('Шаблон сохранён.', { exact: true })).toBeVisible();
  await card
    .getByRole('combobox', { name: 'Шаблон дня', exact: true })
    .selectOption({ label: 'Мой день' });
  await card.getByLabel('Название шаблона', { exact: true }).fill('Мой выходной');
  await card.getByRole('button', { name: 'Обновить шаблон', exact: true }).click();
  await expect(card.getByText('Шаблон обновлён.', { exact: true })).toBeVisible();
  await page.reload();
  await card.getByText('Баланс, шаблоны и порядок дел', { exact: true }).click();
  await card
    .getByRole('combobox', { name: 'Шаблон дня', exact: true })
    .selectOption({ label: 'Мой выходной' });
  await card.getByRole('button', { name: 'Удалить шаблон', exact: true }).click();
  await expect(card.getByText('Шаблон удалён.', { exact: true })).toBeVisible();
  await page.reload();
  await card.getByText('Баланс, шаблоны и порядок дел', { exact: true }).click();
  await expect(
    card.getByRole('combobox', { name: 'Шаблон дня', exact: true }).locator('option'),
  ).toHaveCount(1);
});
