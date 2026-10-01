import { expect, test } from '@playwright/test';
import sample from '../fixtures/annual-plan.json' with { type: 'json' };

test('preview, reject a replacement file, import, reload and repeat without duplicates', async ({
  page,
}, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  await page.goto('/#/v2/goals');
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Импорт плана' });
  const upload = async (data: unknown) => {
    await dialog.getByLabel('Файл плана').setInputFiles({
      name: 'plan.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    });
  };
  await upload(sample);
  await expect(dialog.getByRole('heading', { name: sample.title })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('plan-preview.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await upload({ ...sample, version: 99 });
  await expect(dialog.getByRole('alert')).toContainText('версии 1');
  await expect(dialog.getByRole('button', { name: 'Добавить план', exact: true })).toHaveCount(0);
  await upload(sample);
  await dialog.getByRole('button', { name: 'Добавить план', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('План добавлен');
  await dialog.getByRole('status').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('plan-success.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('link', { name: sample.goals[0]!.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await upload(sample);
  await dialog.getByRole('button', { name: 'Добавить план', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Уже добавлено ранее');
  await expect(dialog).toContainText('Целей: 0');
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page.getByRole('link', { name: sample.goals[0]!.title, exact: true })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Импорт плана', exact: true })).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});
