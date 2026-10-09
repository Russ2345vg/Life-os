import { expect, test } from '@playwright/test';

test('household list collapses, remembers its state and keeps completion after reload', async ({
  page,
}, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  await page.goto('/#/v2/goals');
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const tomorrow = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Импорт плана' });
  await dialog.getByLabel('Файл плана').setInputFiles({
    name: 'household.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'lifeos-plan',
        version: 1,
        id: 'household-2026-10-v1',
        title: 'Порядок',
        startDate: today,
        endDate: tomorrow,
        spheres: [{ key: 'home', name: 'Дом' }],
        directions: [{ key: 'order', sphereKey: 'home', name: 'Домашний порядок' }],
        goals: [{ key: 'clean', directionKey: 'order', title: 'Чистый дом', dueDate: tomorrow }],
        actions: [
          { key: 'floor', goalKey: 'clean', title: 'Пропылесосить зал', date: today },
          { key: 'shelf', goalKey: 'clean', title: 'Протереть полку', date: today },
          { key: 'sink', goalKey: 'clean', title: 'Помыть раковину', date: tomorrow },
        ],
      }),
    ),
  });
  await dialog.getByRole('button', { name: 'Добавить план', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('План добавлен');
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.goto('/#/v2/today');
  const group = page.locator('details[aria-label="Порядок"]');
  const summary = group.locator(':scope > summary');
  await expect(summary).toContainText('Выполнено 0 из 2');
  await expect(
    group.getByRole('button', { name: 'Пропылесосить зал', exact: true }),
  ).not.toBeVisible();
  await summary.click();
  await expect(group.getByRole('button', { name: 'Пропылесосить зал', exact: true })).toBeVisible();
  // Completion is confirmed asynchronously by the existing application command.
  await group.getByRole('checkbox', { name: 'Выполнить: Пропылесосить зал', exact: true }).click();
  await expect(summary).toContainText('Выполнено 1 из 2');
  await page.reload();
  await expect(group.getByRole('button', { name: 'Протереть полку', exact: true })).toBeVisible();
  await expect(summary).toContainText('Выполнено 1 из 2');
  await summary.click();
  await page.reload();
  await expect(
    group.getByRole('button', { name: 'Протереть полку', exact: true }),
  ).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('household-collapsed.png'), fullPage: true });
  await summary.click();
  await page.screenshot({ path: testInfo.outputPath('household-expanded.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === 'lifeos.today.household-expanded') throw new Error('Storage unavailable');
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'lifeos.today.household-expanded') throw new Error('Storage unavailable');
      return setItem.call(this, key, value);
    };
  });
  await page.reload();
  await expect(group).not.toHaveAttribute('open');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(group.getByRole('button', { name: 'Протереть полку', exact: true })).toBeVisible();
  await summary.click();
  await page
    .locator('.planner-day-switch')
    .getByRole('button', { name: 'Завтра', exact: true })
    .click();
  await expect(summary).toContainText('Выполнено 0 из 1');
  await summary.click();
  await expect(group.getByRole('button', { name: 'Помыть раковину', exact: true })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
