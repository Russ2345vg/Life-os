import { expect, test, type Page } from '@playwright/test';

async function configureSleep(page: Page) {
  await page.goto('/#/v2/sleep');
  await page.getByLabel('Сон', { exact: true }).fill('22:30');
  await page.getByLabel('Подъём', { exact: true }).fill('07:15');
  await page.getByRole('button', { name: 'Сохранить время', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Список подготовки' })).toBeVisible();
  await page.getByRole('button', { name: '＋ Добавить пункт', exact: true }).click();
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
