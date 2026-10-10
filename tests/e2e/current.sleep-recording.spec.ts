import { expect, test, type Page } from '@playwright/test';

async function openSleep(page: Page) {
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Список подготовки' })).toBeVisible();
}

test.use({ timezoneId: 'Asia/Chita' });

test('an after-midnight bedtime uses the selected wake date and rejects a future morning', async ({
  page,
}) => {
  await openSleep(page);
  await page.clock.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  await page.reload();
  const form = page.locator('.sleep-observation-form');
  await form.getByLabel('Во сколько лёг?').fill('00:35');
  await form.getByLabel('Во сколько встал?').fill('09:45');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Время подъёма ещё не наступило');
  await form.getByLabel('Во сколько встал?').fill('08:20');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(page.getByText('Факт: 00:35–08:20')).toBeVisible();
  const observation = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<
      Array<{ cycleDate: string; wentToBedAt: string; wokeAt: string }>
    >((resolve, reject) => {
      const request = db.transaction('sleepObservations').objectStore('sleepObservations').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records[0];
  });
  expect(observation?.cycleDate).toBe('2026-10-09');
  expect(new Date(observation!.wentToBedAt).toISOString()).toBe('2026-10-09T15:35:00.000Z');
  expect(new Date(observation!.wokeAt).toISOString()).toBe('2026-10-09T23:20:00.000Z');
});

test('the recording date advances while the page remains open overnight', async ({ page }) => {
  await openSleep(page);
  const date = page.locator('.sleep-observation-form').getByLabel('Дата подъёма', { exact: true });
  await expect(date).toHaveValue('2026-10-09');
  await page.clock.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  await page.clock.fastForward(60_000);
  await expect(date).toHaveValue('2026-10-10');
  await expect(date).toHaveAttribute('max', '2026-10-10');
});

test('midnight and manual alarm refresh preserve the date and unsaved times', async ({ page }) => {
  await openSleep(page);
  const form = page.locator('.sleep-observation-form');
  await form.getByLabel('Во сколько лёг?').fill('23:10');
  await form.getByLabel('Во сколько встал?').fill('08:05');
  await page.clock.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  await page.clock.fastForward(60_000);
  await expect(form.getByLabel('Дата подъёма', { exact: true })).toHaveAttribute(
    'max',
    '2026-10-10',
  );
  await page.getByRole('button', { name: 'Проверить статус', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Сохранить ночь', exact: true })).toBeEnabled();
  await expect(form.getByLabel('Дата подъёма', { exact: true })).toHaveValue('2026-10-09');
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('23:10');
  await expect(form.getByLabel('Во сколько встал?')).toHaveValue('08:05');
});

test('morning recording remains available after the schedule advances to the next night', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSleep(page);
  await page.clock.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  await page.reload();
  const form = page.locator('.sleep-observation-form');
  await expect(page.getByRole('heading', { name: 'Записать сон', exact: true })).toBeVisible();
  await expect(form.getByLabel('Дата подъёма', { exact: true })).toHaveValue('2026-10-10');
  await form.getByLabel('Во сколько лёг?').fill('22:30');
  await form.getByLabel('Во сколько встал?').fill('07:15');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(page.getByText('Ночь сохранена', { exact: true })).toBeVisible();
  await expect(page.getByText('Факт: 22:30–07:15')).toBeVisible();
  await page.reload();
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('22:30');
  await expect(form.getByLabel('Во сколько встал?')).toHaveValue('07:15');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('sleep-recorded.png'), fullPage: true });
});

test('a missed night can be recorded and revised without creating a duplicate', async ({
  page,
}) => {
  await openSleep(page);
  const form = page.locator('.sleep-observation-form');
  await form.getByLabel('Дата подъёма', { exact: true }).fill('2026-09-07');
  await form.getByLabel('Во сколько лёг?').fill('23:30');
  await form.getByLabel('Во сколько встал?').fill('08:10');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(page.getByText('Факт: 23:30–08:10')).toBeVisible();
  await form.getByLabel('Дата подъёма', { exact: true }).fill('2026-10-08');
  await expect(form.getByLabel('Во сколько встал?')).toHaveValue('');
  await page.reload();
  await form.getByLabel('Дата подъёма', { exact: true }).fill('2026-09-07');
  await expect(form.getByLabel('Во сколько встал?')).toHaveValue('08:10');
  await form.getByLabel('Во сколько встал?').fill('08:25');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(page.getByText('Факт: 23:30–08:25')).toBeVisible();
  const count = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction('sleepObservations').objectStore('sleepObservations').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  });
  expect(count).toBe(1);
});

test('a failed save keeps entered times through focus refresh and allows retry', async ({
  page,
}) => {
  await openSleep(page);
  const form = page.locator('.sleep-observation-form');
  await form.getByLabel('Во сколько лёг?').fill('23:15');
  await form.getByLabel('Во сколько встал?').fill('08:05');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'sleepObservations') {
        IDBObjectStore.prototype.put = put;
        throw new Error('Не удалось сохранить ночь. Повторите попытку.');
      }
      return put.apply(this, args);
    };
  });
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Не удалось сохранить ночь');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('23:15');
  await expect(form.getByLabel('Во сколько встал?')).toHaveValue('08:05');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(page.getByText('Факт: 23:15–08:05')).toBeVisible();
});

test('a future wake time cannot be recorded as an actual night', async ({ page }) => {
  await openSleep(page);
  await page.clock.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  await page.reload();
  const form = page.locator('.sleep-observation-form');
  await form.getByLabel('Во сколько лёг?').fill('22:30');
  await form.getByLabel('Во сколько встал?').fill('10:00');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Время подъёма ещё не наступило');
  await expect(page.getByText('Ночь сохранена', { exact: true })).toHaveCount(0);
  await form.getByLabel('Во сколько встал?').fill('08:20');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(page.getByText('Факт: 22:30–08:20')).toBeVisible();
});
