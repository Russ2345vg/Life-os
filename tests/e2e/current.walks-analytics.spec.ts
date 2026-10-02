import { expect, test } from '@playwright/test';

test('analytics shows the same completed walk and opens its source record', async ({ page }) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ритм прогулок' })).toBeVisible();
  await expect(page.getByText('Дней с прогулками: 1.')).toBeVisible();
  await page.getByText('Прогулки, вошедшие в расчёт (1)').click();
  await page.getByRole('button', { name: 'Открыть прогулку 1' }).click();
  await expect(page.getByText('Прогулка завершена', { exact: true })).toBeVisible();
});
