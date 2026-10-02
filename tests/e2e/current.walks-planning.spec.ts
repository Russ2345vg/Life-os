import { expect, test } from '@playwright/test';

test('a planned walk appears as an action and starts from its action card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/walks/plan');
  await expect(page.getByRole('heading', { name: 'Запланировать прогулку' })).toBeVisible();
  await page
    .getByRole('spinbutton', { name: 'Ориентир по времени, минуты — необязательно' })
    .fill('20');
  await page.getByRole('button', { name: 'Добавить в план' }).click();
  await expect(page.getByRole('button', { name: 'Открыть действие' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Прогулок в неделю — необязательно' }).fill('3');
  await page.getByRole('button', { name: 'Сохранить цель' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Личная цель сохранена' })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('spinbutton', { name: 'Прогулок в неделю — необязательно' }),
  ).toHaveValue('3');
  await page.getByRole('button', { name: 'Открыть действие' }).click();
  await expect(page.getByRole('button', { name: 'Начать прогулку по плану' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать прогулку по плану' }).click();
  await expect(page.getByText('Идёт прогулка', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить прогулку', exact: true }).click();
  await expect(page.getByText('Прогулка завершена', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
