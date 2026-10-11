import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Chita' });

test('guided preparation pauses its timer, advances only saved steps and resumes after reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  await configureSleep(page);
  await addStretching(page);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await saveTiming(page, '30', '2');
  await page.getByRole('button', { name: 'Начать подготовку', exact: true }).focus();
  await page.keyboard.press('Enter');
  const guide = page.getByRole('region', { name: 'Пошаговая подготовка', exact: true });
  await expect(
    guide.getByRole('heading', { name: 'Проветрить комнату', exact: true }),
  ).toBeFocused();
  await expect(page.locator('.sleep-groups')).toHaveCount(0);
  await expect(guide.getByRole('group', { name: 'Таймер растяжки' })).toHaveCount(0);
  await guide.getByRole('button', { name: 'Готово — следующий', exact: true }).click();
  await expect(
    guide.getByRole('heading', { name: 'Подготовить кровать', exact: true }),
  ).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'Начать подготовку', exact: true }).click();
  await expect(
    guide.getByRole('heading', { name: 'Подготовить кровать', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Прогресс вечерней подготовки' }),
  ).toHaveAttribute('aria-valuenow', '1');
  for (const title of ['Подготовить одежду', 'Поставить стакан воды', 'Растяжка']) {
    await expect(guide.getByRole('group', { name: 'Таймер растяжки' })).toHaveCount(0);
    await guide.getByRole('button', { name: 'Готово — следующий', exact: true }).click();
    await expect(guide.getByRole('heading', { name: title, exact: true })).toBeFocused();
  }
  await expect(guide.getByLabel('Осталось времени', { exact: true })).toHaveText('02:00');
  await guide.getByRole('button', { name: 'Запустить таймер', exact: true }).click();
  await page.clock.runFor(60_000);
  await expect(guide.getByLabel('Осталось времени', { exact: true })).toHaveText('01:00');
  await guide.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.clock.runFor(30_000);
  await expect(guide.getByLabel('Осталось времени', { exact: true })).toHaveText('01:00');
  await guide.getByRole('button', { name: 'Продолжить таймер', exact: true }).click();
  await page.clock.runFor(60_000);
  await expect(guide.getByRole('status').filter({ hasText: 'Время вышло' })).toContainText(
    'Время вышло',
  );
  await expect(guide.getByRole('heading', { name: 'Растяжка', exact: true })).toBeVisible();
  await guide.getByRole('button', { name: 'Сбросить таймер', exact: true }).click();
  await expect(guide.getByLabel('Осталось времени', { exact: true })).toHaveText('02:00');
  await guide.getByRole('button', { name: 'Запустить таймер', exact: true }).click();
  await page.clock.runFor(10_000);
  await guide.getByRole('button', { name: 'К списку', exact: true }).click();
  await page.getByRole('button', { name: 'Начать подготовку', exact: true }).click();
  await expect(guide.getByLabel('Осталось времени', { exact: true })).toHaveText('02:00');
  for (const control of await guide.locator('button:visible, input:visible').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await guide.screenshot({ path: testInfo.outputPath('guided-card.png') });
  await page.screenshot({ path: testInfo.outputPath('guided-preparation.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Начать подготовку', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Растяжка', exact: true })).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Прогресс вечерней подготовки' }),
  ).toHaveAttribute('aria-valuenow', '4');
  await expect(guide.getByLabel('Осталось времени', { exact: true })).toHaveText('02:00');
  await guide.getByRole('button', { name: 'Готово — следующий', exact: true }).click();
  await expect(guide.getByRole('status')).toContainText('Подготовка выполнена');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  expect(errors).toEqual([]);
});

async function addStretching(page: Page) {
  const form = page.getByRole('form', { name: 'Добавить пункт в Личное', exact: true });
  await form.getByRole('textbox').fill('Растяжка');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(
    page.getByRole('form', { name: 'Переименовать Растяжка', exact: true }),
  ).toBeVisible();
}

async function saveTiming(page: Page, total: string, stretch: string) {
  await page.getByText('Настроить время', { exact: true }).click();
  const form = page.getByRole('form', { name: 'Настройка времени подготовки', exact: true });
  await form.getByLabel('Общее время подготовки, включая растяжку', { exact: true }).fill(total);
  await form.getByLabel('Пункт растяжки', { exact: true }).selectOption({ label: 'Растяжка' });
  await form.getByLabel('Длительность растяжки, минут', { exact: true }).fill(stretch);
  await form.getByRole('button', { name: 'Сохранить время подготовки', exact: true }).click();
  await expect(form).not.toBeVisible();
}

test('preparation timing saves one budget, preserves alarm proof and retries failures', async ({
  page,
}, testInfo) => {
  const errors = collectBrowserErrors(page);
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  await configureSleep(page, '23:00');
  await addStretching(page);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await seedAndroidReport(page, 'CONFIRMED');
  await page.reload();
  await page.getByRole('button', { name: 'Вечер', exact: true }).click();
  const info = page.getByRole('region', { name: 'Время вечерней подготовки', exact: true });
  await expect(info).toContainText('22:30');
  await page.getByText('Настроить время', { exact: true }).click();
  const form = page.getByRole('form', { name: 'Настройка времени подготовки', exact: true });
  await form.getByLabel('Пункт растяжки', { exact: true }).selectOption({ label: 'Растяжка' });
  await form.getByLabel('Общее время подготовки, включая растяжку', { exact: true }).fill('5');
  await form.getByRole('button', { name: 'Сохранить время подготовки', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('общее время');
  await form.getByLabel('Общее время подготовки, включая растяжку', { exact: true }).fill('30');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'sleepSchedules') {
        IDBObjectStore.prototype.put = put;
        throw new Error('Не удалось сохранить время подготовки');
      }
      return put.apply(this, args);
    };
  });
  await form.getByRole('button', { name: 'Сохранить время подготовки', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Не удалось сохранить время');
  await expect(
    form.getByLabel('Общее время подготовки, включая растяжку', { exact: true }),
  ).toHaveValue('30');
  await form.screenshot({ path: testInfo.outputPath('preparation-timing-error.png') });
  await form.getByRole('button', { name: 'Сохранить время подготовки', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Подтверждение будильника Android', exact: true }),
  ).toContainText('Телефон подтвердил будильник');
  await page.reload();
  await page.getByRole('button', { name: 'Вечер', exact: true }).click();
  await page.getByText('Настроить время', { exact: true }).click();
  await expect(form.getByLabel('Длительность растяжки, минут', { exact: true })).toHaveValue('10');
  await expect(
    form.getByLabel('Пункт растяжки', { exact: true }).locator('option:checked'),
  ).toHaveText('Растяжка');
  for (const control of await form.locator('input, select, button').all()) {
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await form.screenshot({ path: testInfo.outputPath('preparation-timing-settings.png') });
  await page.getByText('Настроить время', { exact: true }).click();
  await page.clock.setSystemTime(new Date('2026-10-10T13:40:00Z'));
  await page.clock.fastForward(60_000);
  await expect(info).toContainText('Можно начинать подготовку');
  await page.getByRole('button', { name: 'Завершить подготовку', exact: true }).click();
  await expect(info).not.toContainText('Можно начинать подготовку');
  await info.screenshot({ path: testInfo.outputPath('preparation-completed.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('preparation timing crosses midnight and requires a new selection for unavailable stretching', async ({
  page,
}, testInfo) => {
  const errors = collectBrowserErrors(page);
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  await configureSleep(page, '00:10');
  await addStretching(page);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await saveTiming(page, '30', '10');
  const info = page.getByRole('region', { name: 'Время вечерней подготовки', exact: true });
  await expect(info).toContainText('23:40');
  await expect(info).toContainText('10 окт');
  await info.screenshot({ path: testInfo.outputPath('preparation-midnight.png') });
  await page.getByRole('button', { name: '＋ Добавить пункт', exact: true }).click();
  const rename = page.getByRole('form', { name: 'Переименовать Растяжка', exact: true });
  await rename.getByRole('textbox').fill('Мягкая растяжка');
  await rename.getByRole('button', { name: 'Сохранить', exact: true }).click();
  const item = page.locator('.sleep-catalog-group li').filter({
    has: page.getByRole('textbox', { name: 'Переименовать Мягкая растяжка', exact: true }),
  });
  // The controlled checkbox reflects the durable repository update, not an optimistic toggle.
  await item.getByRole('checkbox').click();
  await expect(item.getByRole('checkbox')).not.toBeChecked();
  await expect(item.getByRole('checkbox')).toBeEnabled();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(info).toContainText('Пункт растяжки недоступен');
  await page.getByRole('button', { name: 'Начать подготовку', exact: true }).click();
  const guide = page.getByRole('region', { name: 'Пошаговая подготовка', exact: true });
  for (const title of [
    'Подготовить кровать',
    'Подготовить одежду',
    'Поставить стакан воды',
    'Растяжка',
  ]) {
    await guide.getByRole('button', { name: 'Готово — следующий', exact: true }).click();
    await expect(guide.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(guide.getByRole('group', { name: 'Таймер растяжки' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('synced Android confirmation stays visible on Windows and becomes stale after wake changes', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  await configureSleep(page);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Подтверждение будильника Android', exact: true });
  await expect(panel).toContainText('Нет подтверждения от телефона');
  await expect(panel).toContainText('дождитесь синхронизации аккаунта');
  await seedAndroidReport(page, 'CONFIRMED');
  await page.reload();
  await expect(panel.getByRole('status').first()).toHaveText(
    'Телефон подтвердил будильник на 07:15',
  );
  await expect(panel).toContainText('11 октября');
  await expect(panel).toContainText('21:00');
  await expect(panel.getByRole('button', { name: 'Пробный сигнал · 20 секунд' })).toBeDisabled();
  const check = panel.getByRole('button', { name: 'Проверить статус', exact: true });
  await check.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('status').first()).toHaveText(
    'Телефон подтвердил будильник на 07:15',
  );
  for (const control of await panel.getByRole('button').all())
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await panel.screenshot({ path: testInfo.outputPath('android-confirmation-card.png') });
  await page.screenshot({ path: testInfo.outputPath('android-confirmation.png'), fullPage: true });
  await page.getByRole('button', { name: 'Только ближайший подъём', exact: true }).click();
  const form = page.getByRole('form', { name: 'Разовое время подъёма', exact: true });
  await form.getByLabel('Разовое время', { exact: true }).fill('09:00');
  await form.getByRole('button', { name: 'Сохранить разовое время', exact: true }).click();
  await expect(panel.getByRole('status').first()).toHaveText('Изменения ещё не подтверждены');
  await expect(panel).not.toHaveClass(/sleep-alarm-status--success/);
  await expect(panel).toContainText('21:00');
  await panel.screenshot({ path: testInfo.outputPath('android-stale-card.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  expect(errors).toEqual([]);
});

test('incoming alarm sync updates the open screen without replacing unsaved sleep times', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  await page.goto('/tests/fixtures/sleep-alarm-sync.html');
  const panel = page.getByRole('region', { name: 'Подтверждение будильника Android', exact: true });
  await expect(panel).toContainText('Нет подтверждения от телефона');
  const form = page.locator('.sleep-observation-form');
  await form.getByLabel('Во сколько лёг?').fill('23:10');
  const apply = (outcome: 'CONFIRMED' | 'ERROR', timeZone?: string) =>
    page.evaluate(
      async ({ outcome, timeZone }) => {
        await (
          window as Window & {
            sleepAlarmSyncFixture: {
              importReport(outcome: 'CONFIRMED' | 'ERROR', timeZone?: string): Promise<void>;
            };
          }
        ).sleepAlarmSyncFixture.importReport(outcome, timeZone);
      },
      { outcome, timeZone },
    );
  await apply('CONFIRMED');
  await expect(panel.getByRole('status').first()).toHaveText(
    'Телефон подтвердил будильник на 07:15',
  );
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('23:10');
  await apply('ERROR');
  await expect(panel.getByRole('status').first()).toHaveText('Ошибка постановки');
  await expect(panel).not.toHaveClass(/sleep-alarm-status--success/);
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('23:10');
  await apply('ERROR', 'Pacific/Kiritimati');
  await expect(panel.getByRole('status').first()).toHaveText('Изменения ещё не подтверждены');
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('23:10');
  await expect(form.getByLabel('Дата подъёма', { exact: true })).toHaveValue('2026-10-10');
  await form.getByLabel('Во сколько встал?').fill('07:00');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(page.getByText('Ночь сохранена', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () =>
      (
        window as Window & { sleepAlarmSyncFixture: { savedTimeZone(): Promise<string | null> } }
      ).sleepAlarmSyncFixture.savedTimeZone(),
    ),
  ).toBe('Asia/Chita');
});

test('synced Android permission and error reports show a next action rather than success', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  await configureSleep(page);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Подтверждение будильника Android', exact: true });
  for (const [outcome, label] of [
    ['PERMISSION_REQUIRED', 'Нужны разрешения на телефоне'],
    ['ERROR', 'Ошибка постановки'],
    ['NOT_CONFIRMED', 'Телефон не подтвердил постановку'],
  ] as const) {
    await seedAndroidReport(page, outcome);
    await page.reload();
    await expect(panel.getByRole('status').first()).toHaveText(label);
    await expect(panel).not.toHaveClass(/sleep-alarm-status--success/);
    await expect(panel).toContainText('Android');
    await expect(panel).toContainText('21:00');
    await panel.screenshot({
      path: testInfo.outputPath(`android-${outcome.toLowerCase()}-card.png`),
    });
  }
});

async function seedAndroidReport(
  page: Page,
  outcome: 'CONFIRMED' | 'PERMISSION_REQUIRED' | 'ERROR' | 'NOT_CONFIRMED',
) {
  await page.evaluate(async (outcome) => {
    const mapperPath = '/src/infrastructure/persistence/mappers/SleepScheduleRecordMapper.ts';
    const confirmationPath = '/src/application/sleep/WakeAlarmConfirmation.ts';
    const gatewayPath = '/src/application/sleep/WakeAlarmGateway.ts';
    const [mapper, confirmation, gateway] = await Promise.all([
      import(/* @vite-ignore */ mapperPath) as Promise<
        typeof import('../../src/infrastructure/persistence/mappers/SleepScheduleRecordMapper')
      >,
      import(/* @vite-ignore */ confirmationPath) as Promise<
        typeof import('../../src/application/sleep/WakeAlarmConfirmation')
      >,
      import(/* @vite-ignore */ gatewayPath) as Promise<
        typeof import('../../src/application/sleep/WakeAlarmGateway')
      >,
    ]);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('lifeos');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const record = await new Promise<unknown>((resolve, reject) => {
        const get = database
          .transaction('sleepSchedules')
          .objectStore('sleepSchedules')
          .get('sleep-schedule');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      const state = mapper.SleepScheduleRecordMapper.fromRecord(record);
      const now = new Date();
      const schedule = confirmation.buildWakeAlarmSchedule(state, now)!;
      const report = confirmation.createAndroidAlarmReport(
        state,
        {
          ...gateway.unavailableWakeAlarmStatus(),
          supported: true,
          state: 'SCHEDULED',
          exactAlarmGranted: true,
          notificationsGranted: true,
          fullScreenGranted: true,
          acknowledgedSettingsVersion: schedule.settingsVersion,
          nextOccurrenceId: schedule.nextOccurrence?.id ?? null,
          nextScheduledAt: schedule.nextOccurrence?.scheduledAt ?? null,
        },
        now,
      )!;
      const tx = database.transaction('sleepSchedules', 'readwrite');
      tx.objectStore('sleepSchedules').put(
        mapper.SleepScheduleRecordMapper.toRecord({
          ...state,
          androidAlarmReport: { ...report, outcome },
        }),
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      database.close();
    }
  }, outcome);
}

test('guided preparation keeps the current step after a failed write and allows retry', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  await configureSleep(page);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Начать подготовку', exact: true }).click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'sleepSchedules') {
        IDBObjectStore.prototype.put = put;
        throw new Error('Не удалось сохранить шаг. Повторите попытку.');
      }
      return put.apply(this, args);
    };
  });
  const guide = page.getByRole('region', { name: 'Пошаговая подготовка', exact: true });
  await guide.getByRole('button', { name: 'Готово — следующий', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить');
  await expect(
    guide.getByRole('heading', { name: 'Проветрить комнату', exact: true }),
  ).toBeVisible();
  await guide.getByRole('button', { name: 'Готово — следующий', exact: true }).click();
  await expect(
    guide.getByRole('heading', { name: 'Подготовить кровать', exact: true }),
  ).toBeVisible();
});

async function configureSleep(page: Page, bedtime = '22:30') {
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill(bedtime);
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Список подготовки' })).toBeVisible();
  await page.getByRole('button', { name: '＋ Добавить пункт', exact: true }).click();
}

async function seedTrustedWakeDraft(page: Page) {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('lifeos');
      opening.addEventListener('success', () => resolve(opening.result));
      opening.addEventListener('error', () => reject(opening.error));
    });
    const schedule = await new Promise<{
      settings: { timeZone: string };
      nightCycles: Array<{ id: string; cycleDate: string; plannedWakeAt: string }>;
    }>((resolve, reject) => {
      const request = database
        .transaction('sleepSchedules')
        .objectStore('sleepSchedules')
        .get('sleep-schedule');
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });
    const cycleDate = '2026-10-03';
    const cycle = schedule.nightCycles.find((item) => item.cycleDate === cycleDate);
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sleepObservations', 'readwrite');
      transaction.objectStore('sleepObservations').put({
        schemaVersion: 1,
        id: `sleep-observation:${cycleDate}`,
        cycleDate,
        nightCycleId: cycle?.id ?? null,
        wentToBedAt: null,
        wokeAt: '2026-10-03T22:15:00.000Z',
        wakeSource: 'ALARM_QR',
        wakeOccurrenceId: `wake:${cycleDate}`,
        timeZone: schedule.settings.timeZone,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('error', () => reject(transaction.error));
      transaction.addEventListener('abort', () => reject(transaction.error));
    });
    database.close();
  });
}

test('sleep additions appear in the current night and persist while later renames preserve its snapshot', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await configureSleep(page);
  const form = page.getByRole('form', { name: 'Добавить пункт в Личное', exact: true });
  await form.getByRole('textbox').fill('Подготовить сумку');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  const rename = page.getByRole('form', { name: 'Переименовать Подготовить сумку', exact: true });
  await expect(rename.getByRole('textbox')).toHaveValue('Подготовить сумку');
  await expect(page.locator('.sleep-groups')).toContainText('Подготовить сумку');
  await rename.getByRole('textbox').fill('Подготовить сумку и ключи');
  await rename.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Переименовать Подготовить сумку и ключи', exact: true }),
  ).toHaveValue('Подготовить сумку и ключи');
  await page.reload();
  await expect(page.locator('.sleep-groups')).toContainText('Подготовить сумку');
  await expect(page.locator('.sleep-groups')).not.toContainText('Подготовить сумку и ключи');
  await page.getByRole('button', { name: '＋ Добавить пункт', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Переименовать Подготовить сумку и ключи', exact: true }),
  ).toHaveValue('Подготовить сумку и ключи');
  await page.screenshot({ path: testInfo.outputPath('sleep-catalog.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('failed sleep catalog additions preserve the entered title for retry', async ({ page }) => {
  await configureSleep(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'sleepSchedules') throw new Error('Не удалось сохранить пункт.');
      return put.apply(this, args);
    };
  });
  const form = page.getByRole('form', { name: 'Добавить пункт в Личное', exact: true });
  await form.getByRole('textbox').fill('Подготовить документы');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить пункт.');
  await expect(form.getByRole('textbox')).toHaveValue('Подготовить документы');
});

test('manual morning observation persists, updates the chart and stays usable on mobile', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-04T01:00:00Z') });
  await configureSleep(page);
  await expect(page.getByRole('heading', { name: 'Записать сон' })).toBeVisible();
  await expect(page.getByText('начало часа без экранов')).toHaveCount(0);
  const form = page.locator('.sleep-observation-form');
  await expect(form.getByLabel('Дата подъёма', { exact: true })).toHaveValue('2026-10-04');
  await expect(form.getByLabel('Во сколько встал?')).toHaveValue('');
  await form.getByLabel('Во сколько лёг?').fill('22:30');
  await form.getByLabel('Во сколько встал?').fill('07:15');
  await form.getByLabel('Во сколько встал?').press('Enter');

  await expect(page.getByText('Ночь сохранена')).toBeVisible();
  await expect(page.getByText('Факт: 22:30–07:15')).toBeVisible();
  await expect(page.getByText(/Время в постели: 8 ч 45 мин/)).toBeVisible();
  await page.reload();
  await expect(page.getByText('Факт: 22:30–07:15')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('trusted alarm dismissal prefills wake time and remains editable before confirmation', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-04T01:00:00Z') });
  await configureSleep(page);
  await seedTrustedWakeDraft(page);
  await page.reload();

  const form = page.locator('.sleep-observation-form');
  await expect(page.getByText('Подъём предложен по отключению будильника через QR.')).toBeVisible();
  await expect(form.getByLabel('Во сколько встал?')).toHaveValue('07:15');
  await form.getByLabel('Во сколько лёг?').fill('22:45');
  await form.getByLabel('Во сколько встал?').fill('08:20');
  await form.getByRole('button', { name: 'Сохранить ночь' }).click();

  await expect(page.getByText('Ночь сохранена')).toBeVisible();
  await expect(page.getByText('Факт: 22:45–08:20')).toBeVisible();
});
