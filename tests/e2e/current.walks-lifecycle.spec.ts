import { expect, test } from '@playwright/test';

test('walk starts without a form, survives pause and reload, saves thoughts and optional reflection', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/walks');
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByText('Идёт прогулка', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.getByText('На паузе', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('На паузе', { exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Новая мысль', exact: true })
    .fill('Сделать паузу перед важным решением');
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  await expect(
    page.getByText('Сделать паузу перед важным решением', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить прогулку', exact: true }).click();
  await expect(page.getByText('Прогулка завершена', { exact: true })).toBeVisible();
  await page.getByText('Добавить итог и оценку', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Итог прогулки', exact: true }).fill('Стало спокойнее');
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Итог сохранён' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('paragraph').filter({ hasText: /^Стало спокойнее$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await expect(page.getByText('Стало спокойнее', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  expect(errors).toEqual([]);
});

test('completion without ratings and abandoned walk both remain in history', async ({ page }) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByText('Другие действия', { exact: true }).click();
  await page.getByRole('button', { name: 'Прервать прогулку', exact: true }).click();
  await expect(page.getByText('Прогулка прервана', { exact: true })).toBeVisible();
});
