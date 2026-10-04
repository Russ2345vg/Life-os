import { expect, test, type Page } from '@playwright/test';

async function configureSleep(page: Page) {
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Список подготовки' })).toBeVisible();
  await page.getByRole('button', { name: '＋ Добавить пункт', exact: true }).click();
}

async function makeCurrentNightDue(page: Page) {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('lifeos');
      opening.addEventListener('success', () => resolve(opening.result));
      opening.addEventListener('error', () => reject(opening.error));
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sleepSchedules', 'readwrite');
      const store = transaction.objectStore('sleepSchedules');
      const loading = store.get('sleep-schedule');
      loading.addEventListener('success', () => {
        const record = loading.result as {
          nightCycles: Array<{ plannedSleepAt: string; plannedWakeAt: string }>;
        };
        const cycle = record.nightCycles.at(-1)!;
        cycle.plannedSleepAt = new Date(Date.now() - 10 * 60 * 60_000).toISOString();
        cycle.plannedWakeAt = new Date(Date.now() - 60 * 60_000).toISOString();
        store.put(record);
      });
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('error', () => reject(transaction.error));
      transaction.addEventListener('abort', () => reject(transaction.error));
    });
    database.close();
  });
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
    const cycle = schedule.nightCycles.at(-1)!;
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sleepObservations', 'readwrite');
      transaction.objectStore('sleepObservations').put({
        schemaVersion: 1,
        id: `sleep-observation:${cycle.cycleDate}`,
        cycleDate: cycle.cycleDate,
        nightCycleId: cycle.id,
        wentToBedAt: null,
        wokeAt: cycle.plannedWakeAt,
        wakeSource: 'ALARM_QR',
        wakeOccurrenceId: `wake:${cycle.cycleDate}`,
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
  await configureSleep(page);
  await expect(page.getByRole('heading', { name: 'Как прошла ночь?' })).toHaveCount(0);
  await expect(page.getByText('начало часа без экранов')).toHaveCount(0);
  await makeCurrentNightDue(page);
  await page.reload();

  const form = page.locator('.sleep-observation-form');
  await expect(page.getByRole('heading', { name: 'Как прошла ночь?' })).toBeVisible();
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
