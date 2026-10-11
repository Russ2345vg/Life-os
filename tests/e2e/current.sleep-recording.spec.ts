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

test('morning feedback remains subjective and follows the selected wake date', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSleep(page);
  await page.getByRole('button', { name: 'Утро', exact: true }).click();
  const form = page.locator('.sleep-observation-form');
  await form.getByLabel('Дата подъёма', { exact: true }).fill('2026-10-08');
  const card = page.getByRole('region', { name: 'Как прошла ночь?', exact: true });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Хорошо', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(card.getByRole('status')).toHaveText('Оценка сохранена');
  await card.screenshot({ path: testInfo.outputPath('morning-partial.png') });
  await card.getByRole('button', { name: 'Устал', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Устал', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(form.getByLabel('Во сколько встал?')).toHaveValue('');
  const history = page
    .locator('.sleep-observation-chart li')
    .filter({ has: page.locator('time[datetime="2026-10-07"]') });
  await expect(history).toContainText('Качество сна: Хорошо');
  await expect(history).toContainText('Утром: Устал');
  await expect(history).toContainText('Время сна не записано');
  await expect(page.locator('.sleep-observation-chart__fact')).toHaveCount(0);
  await form.getByLabel('Дата подъёма', { exact: true }).fill('2026-10-09');
  await expect(card.getByRole('button', { name: 'Хорошо', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Утро', exact: true }).click();
  await form.getByLabel('Дата подъёма', { exact: true }).fill('2026-10-08');
  await expect(card.getByRole('button', { name: 'Хорошо', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const control of await card.getByRole('button').all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath('morning-feedback.png'), fullPage: true });
  await card.getByRole('button', { name: 'Сбросить оценку', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Хорошо', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(history).not.toContainText('Качество сна: Хорошо');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('morning feedback retries failed saves and protects dirty times', async ({
  page,
}, testInfo) => {
  await openSleep(page);
  await page.getByRole('button', { name: 'Утро', exact: true }).click();
  const card = page.getByRole('region', { name: 'Как прошла ночь?', exact: true });
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'sleepObservations') {
        IDBObjectStore.prototype.put = put;
        throw new Error('Не удалось сохранить оценку');
      }
      return put.apply(this, args);
    };
  });
  await card.getByRole('button', { name: 'Плохо', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Не удалось сохранить оценку');
  await expect(card.getByRole('alert')).toHaveCSS('color', 'rgb(240, 154, 154)'); // shared --danger token
  await card.screenshot({ path: testInfo.outputPath('morning-feedback-error.png') });
  await card.getByRole('button', { name: 'Повторить сохранение оценки', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Плохо', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const form = page.locator('.sleep-observation-form');
  await form.getByLabel('Во сколько лёг?').fill('23:10');
  await expect(card.getByRole('button', { name: 'Бодр', exact: true })).toBeDisabled();
  await expect(card).toContainText('Сначала сохраните времена');
  await card.screenshot({ path: testInfo.outputPath('morning-feedback-dirty.png') });
  await page.getByRole('button', { name: 'Вечер', exact: true }).click();
  await page.getByRole('button', { name: 'Утро', exact: true }).click();
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('23:10');
  await form.getByRole('button', { name: 'Сбросить изменения', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Бодр', exact: true })).toBeEnabled();
});

test('incoming morning feedback waits for a dirty manual form without losing its timezone', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-10T00:00:00Z') });
  await page.goto('/tests/fixtures/sleep-alarm-sync.html');
  await page.getByRole('button', { name: 'Утро', exact: true }).click();
  const form = page.locator('.sleep-observation-form');
  const card = page.getByRole('region', { name: 'Как прошла ночь?', exact: true });
  await form.getByLabel('Во сколько лёг?').fill('23:10');
  await page.evaluate(async () => {
    await (
      window as Window & {
        sleepAlarmSyncFixture: { importFeedback(cycleDate: string): Promise<void> };
      }
    ).sleepAlarmSyncFixture.importFeedback('2026-10-09');
  });
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('23:10');
  await expect(form.getByLabel('Дата подъёма', { exact: true })).toHaveValue('2026-10-10');
  await expect(card.getByRole('button', { name: 'Бодр', exact: true })).toBeDisabled();
  await form.getByRole('button', { name: 'Сбросить изменения', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Бодр', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('old calendar windows load neighboring saved nights and dirty inputs guard date changes', async ({
  page,
}) => {
  await openSleep(page);
  const form = page.locator('.sleep-observation-form');
  await form.getByLabel('Дата подъёма', { exact: true }).fill('2026-09-06');
  await form.getByLabel('Во сколько лёг?').fill('23:00');
  await form.getByLabel('Во сколько встал?').fill('08:00');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await form.getByLabel('Дата подъёма', { exact: true }).fill('2026-09-07');
  await form.getByLabel('Во сколько лёг?').fill('23:00');
  await form.getByLabel('Во сколько встал?').fill('09:00');
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await page.reload();
  await form.getByLabel('Дата подъёма', { exact: true }).fill('2026-09-07');
  await expect(page.getByText('Факт: 23:00–08:00')).toBeVisible();
  await expect(page.getByText('Факт: 23:00–09:00')).toBeVisible();
  await form.getByLabel('Во сколько лёг?').fill('23:15');
  await expect(form.getByLabel('Дата подъёма', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Утро', exact: true }).click();
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('23:15');
  await form.getByRole('button', { name: 'Сбросить изменения', exact: true }).click();
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('23:00');
  await expect(form.getByLabel('Дата подъёма', { exact: true })).toBeEnabled();
});

test('sleep controls support keyboard, calendar periods and failed mark retry', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSleep(page);
  const bed = page.getByRole('button', { name: 'Ложусь', exact: true });
  await bed.focus();
  await expect(bed).toBeFocused();
  const controls = [bed, page.getByRole('button', { name: 'Утро', exact: true })];
  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'sleepObservations') {
        IDBObjectStore.prototype.put = put;
        throw new Error('Не удалось сохранить отметку. Повторите попытку.');
      }
      return put.apply(this, args);
    };
  });
  await bed.press('Enter');
  await expect(page.locator('.sleep-quick-entry').getByRole('alert')).toContainText(
    'Не удалось сохранить отметку',
  );
  await expect(bed).toBeEnabled();
  await bed.press('Enter');
  await expect(page.locator('.sleep-quick-entry').getByRole('status')).toContainText(
    'Время сохранено',
  );
  await page.getByRole('button', { name: 'Утро', exact: true }).click();
  const chart = page.locator('.sleep-observation-chart');
  await expect(chart.locator('li')).toHaveCount(7);
  await chart.getByRole('button', { name: '30 дней', exact: true }).click();
  await expect(chart.locator('li')).toHaveCount(30);
  await chart.getByRole('button', { name: '7 дней', exact: true }).click();
  if (await chart.locator('svg').isVisible())
    expect((await chart.locator('svg').boundingBox())!.height).toBeLessThan(250);
  await chart.getByRole('button', { name: 'Записать сон', exact: true }).click();
  await expect(page.locator('input[name="wentToBed"]')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('sleep-empty-calendar.png'), fullPage: true });
});

test('quick sleep marks survive overnight and remain drafts until confirmation', async ({
  page,
}, testInfo) => {
  await openSleep(page);
  await page.screenshot({ path: testInfo.outputPath('sleep-evening.png'), fullPage: true });
  const styles = await page.locator('.sleep-observation-card').evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      background: css.background,
      color: css.color,
      padding: css.padding,
      radius: css.borderRadius,
      accent: css.getPropertyValue('--planner-accent'),
      stylesheets: [...document.styleSheets].map((sheet) => sheet.href),
    };
  });
  await testInfo.attach('sleep-computed-styles', {
    body: JSON.stringify(styles),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: 'Ложусь', exact: true }).click();
  await page.reload();
  await page.clock.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  await page.reload();
  await page.getByRole('button', { name: 'Я проснулся', exact: true }).click();
  await expect(page.getByText('Не подтверждено', { exact: true })).toBeVisible();
  const form = page.locator('.sleep-observation-form');
  await expect(form.getByLabel('Дата подъёма', { exact: true })).toHaveValue('2026-10-10');
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('21:00');
  await expect(form.getByLabel('Во сколько встал?')).toHaveValue('09:00');
  await form.getByLabel('Во сколько лёг?').fill('21:10');
  await page.getByRole('button', { name: 'Вечер', exact: true }).click();
  await expect(form.getByLabel('Во сколько лёг?')).toHaveValue('21:10');
  await expect(page.getByRole('button', { name: 'Ложусь', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Утро', exact: true }).click();
  await form.getByRole('button', { name: 'Сохранить ночь', exact: true }).click();
  await expect(page.getByText('Факт: 21:10–09:00')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sleep-morning.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

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
