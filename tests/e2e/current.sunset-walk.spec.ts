import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Asia/Chita' });
test('shared sunset time, explicit city selection and offline settings', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.clock.install({ time: new Date('2026-10-11T00:00:00Z') });
  await page.clock.setFixedTime(new Date('2026-10-11T00:00:00Z'));
  await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            id: 2026126,
            name: 'Борзя',
            admin1: 'Забайкальский край',
            country: 'Россия',
            latitude: 50.39138,
            longitude: 116.53355,
            timezone: 'Asia/Chita',
          },
          {
            id: 6779633,
            name: 'Борзя',
            admin1: 'Амурская область',
            country: 'Россия',
            latitude: 52,
            longitude: 128,
            timezone: 'Asia/Yakutsk',
          },
        ],
      },
    }),
  );
  await page.goto('/#/v2/walks/plan');
  const settings = page.getByRole('region', { name: 'Прогулка перед закатом' });
  await expect(settings.getByText('Прогулка 18:16 · Закат 18:31', { exact: true })).toBeVisible();
  await settings.getByLabel('Найти город').fill('Борзя');
  await settings.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(settings.getByRole('radio')).toHaveCount(2);
  await expect(settings.getByRole('button', { name: 'Сохранить город и время' })).toBeDisabled();
  await settings.getByRole('radio', { name: 'Борзя · Забайкальский край · Россия' }).check();
  await settings.getByRole('button', { name: 'Сохранить город и время' }).click();
  await expect(
    settings.getByRole('status').filter({ hasText: 'Настройки сохранены' }),
  ).toBeVisible();
  await expect(
    settings.getByText('Системные уведомления доступны в приложении Windows и Android.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Добавить в план' }).click();
  await expect(page.locator('.walk-plan-list').getByText(/18:16/)).toBeVisible();
  await page.goto('/#/v2/today');
  await expect(page.locator('.planner-action-copy').getByText(/18:16/)).toBeVisible();
  await page.goto('/#/v2/routine/day');
  const form = page.locator('.autopilot-form');
  await expect(form.getByLabel('Начало прогулки', { exact: true })).toBeDisabled();
  await expect(form.getByLabel('Начало прогулки', { exact: true })).toHaveValue('18:16');
  await page.getByRole('button', { name: 'Завтра', exact: true }).click();
  await expect(form.getByLabel('Начало прогулки', { exact: true })).toHaveValue('18:14');
  await page.screenshot({
    path: `artifacts/visual-qa/sunset-walk/after-autopilot-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto('/#/v2/walks/plan');
  await page.reload();
  await expect(settings.getByText('Прогулка 18:16 · Закат 18:31', { exact: true })).toBeVisible();
  await settings.getByLabel('Найти город').focus();
  await settings.getByLabel('Найти город').fill('Борзя');
  await page.keyboard.press('Tab');
  await expect(settings.getByRole('button', { name: 'Найти', exact: true })).toBeFocused();
  await page.screenshot({
    path: `artifacts/visual-qa/sunset-walk/after-walk-${info.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('city search empty and error can be retried without losing saved city', async ({ page }) => {
  let attempt = 0;
  await page.route('https://geocoding-api.open-meteo.com/**', (route) => {
    attempt++;
    return route.fulfill(attempt === 1 ? { json: {} } : { status: 503, body: 'Unavailable' });
  });
  await page.goto('/#/v2/walks/plan');
  const settings = page.getByRole('region', { name: 'Прогулка перед закатом' });
  await settings.getByLabel('Найти город').fill('Борзя');
  await settings.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(settings.getByText('Города не найдены. Уточните название.')).toBeVisible();
  await settings.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(settings.getByRole('alert')).toBeVisible();
  await expect(
    settings.getByText('Борзя · Забайкальский край · Россия · Asia/Chita', { exact: true }),
  ).toBeVisible();
});

test('a timezone saved inside the app immediately updates the shared walk time', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-11T00:00:00Z') });
  await page.clock.setFixedTime(new Date('2026-10-11T00:00:00Z'));
  await page.goto('/#/v2/walks/plan');
  await expect(
    page
      .getByRole('region', { name: 'Прогулка перед закатом' })
      .getByText('Прогулка 18:16 · Закат 18:31', { exact: true }),
  ).toBeVisible();
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('23:00');
  await page.getByLabel('Подъём', { exact: true }).fill('07:00');
  await page.getByLabel('Часовой пояс', { exact: true }).fill('Europe/Berlin');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Сон и подъём', exact: true })).toBeVisible();
  await page.goto('/#/v2/walks/plan');
  await expect(
    page
      .getByRole('region', { name: 'Прогулка перед закатом' })
      .getByText('Прогулка 11:16 · Закат 11:31', { exact: true }),
  ).toBeVisible();
});
