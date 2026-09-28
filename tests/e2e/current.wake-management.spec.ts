import { expect, test } from '@playwright/test';

test('an open one-time form cannot change the following day after its target has passed', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-28T20:00:00+09:00') });
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByLabel('Часовой пояс', { exact: true }).fill('Asia/Chita');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  const wake = page.getByRole('region', { name: 'Управление подъёмом' });
  await wake.getByRole('button', { name: 'Только ближайший подъём', exact: true }).click();
  await wake.getByLabel('Разовое время', { exact: true }).fill('08:45');
  await page.clock.setSystemTime(new Date('2026-09-29T08:00:00+09:00'));
  await wake.getByRole('button', { name: 'Сохранить разовое время', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('Ближайший подъём изменился');
  await expect(
    wake.getByRole('button', { name: 'Сохранить разовое время', exact: true }),
  ).toBeDisabled();
  await expect(wake.locator('.wake-management__time')).toHaveText('07:15');
  await expect(wake.locator('.wake-management__date')).toHaveText('среда, 30 сентября');
  await wake.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.reload();
  await expect(wake.locator('.wake-management__time')).toHaveText('07:15');
});

test('wake controls re-enable a disabled schedule and show the ordinary settings form', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-28T20:00:00+09:00') });
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByLabel('Часовой пояс', { exact: true }).fill('Asia/Chita');
  await page.getByLabel('Расписание включено', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  const wake = page.getByRole('region', { name: 'Управление подъёмом' });
  await expect(wake).toContainText('Будильник выключен');
  await wake.getByRole('button', { name: 'Включить будильник', exact: true }).click();
  await expect(wake.locator('.wake-management__date')).toHaveText('вторник, 29 сентября');
  await wake.getByRole('button', { name: 'Обычное расписание', exact: true }).click();
  await expect(page.getByLabel('Сон', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Подъём', { exact: true })).toHaveValue('07:15');
});

test('one-time wake persists, cancels safely, skips once, and keeps browser readiness honest', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-09-28T20:00:00+09:00') });
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByLabel('Часовой пояс', { exact: true }).fill('Asia/Chita');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  const wake = page.getByRole('region', { name: 'Управление подъёмом' });
  await expect(wake).toHaveCount(1);
  await expect(wake.locator('.wake-management__time')).toHaveText('07:15');
  await expect(wake).toContainText('вторник, 29 сентября');
  await expect(wake).toContainText('Проверка доступна в приложении на Android');
  await expect(wake.getByRole('button', { name: /Пробный сигнал/ })).toBeDisabled();
  await wake.getByRole('button', { name: 'Только ближайший подъём', exact: true }).click();
  await wake.getByLabel('Разовое время', { exact: true }).fill('06:30');
  await wake.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(wake.locator('.wake-management__time')).toHaveText('07:15');
  await wake.getByRole('button', { name: 'Только ближайший подъём', exact: true }).click();
  await wake.getByLabel('Разовое время', { exact: true }).fill('06:30');
  await wake.getByRole('button', { name: 'Сохранить разовое время', exact: true }).click();
  await expect(wake.locator('.wake-management__time')).toHaveText('06:30');
  await page.reload();
  await expect(wake.locator('.wake-management__time')).toHaveText('06:30');
  await expect(wake).toContainText('Следующий подъём — 07:15');
  await wake.getByRole('button', { name: 'Отменить разовое время', exact: true }).click();
  await expect(wake.locator('.wake-management__time')).toHaveText('07:15');
  await wake.getByRole('button', { name: 'Пропустить ближайший', exact: true }).click();
  await expect(wake.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
  await wake.getByRole('button', { name: 'Отмена', exact: true }).press('Escape');
  await expect(
    wake.getByRole('button', { name: 'Пропустить ближайший', exact: true }),
  ).toBeFocused();
  await wake.getByRole('button', { name: 'Пропустить ближайший', exact: true }).click();
  await expect(wake).toContainText('среда, 30 сентября');
  await wake.getByRole('button', { name: 'Подтвердить пропуск', exact: true }).click();
  await expect(wake.locator('.wake-management__date')).toHaveText('среда, 30 сентября');
  await page.reload();
  await expect(wake.locator('.wake-management__date')).toHaveText('среда, 30 сентября');
  await expect(page.getByRole('heading', { name: 'Список подготовки', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('wake-management.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('late one-time wake survives reopening after normal wake time', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-28T20:00:00+09:00') });
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByLabel('Часовой пояс', { exact: true }).fill('Asia/Chita');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  const wake = page.getByRole('region', { name: 'Управление подъёмом' });
  await wake.getByRole('button', { name: 'Только ближайший подъём', exact: true }).click();
  await wake.getByLabel('Разовое время', { exact: true }).fill('09:00');
  await wake.getByRole('button', { name: 'Сохранить разовое время', exact: true }).click();
  await expect(wake.locator('.wake-management__time')).toHaveText('09:00');
  await page.clock.setSystemTime(new Date('2026-09-29T08:00:00+09:00'));
  await page.reload();
  await expect(wake.locator('.wake-management__time')).toHaveText('09:00');
  await wake.getByRole('button', { name: 'Отменить разовое время', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Обычное время уже прошло');
  await expect(wake.locator('.wake-management__time')).toHaveText('09:00');
});
