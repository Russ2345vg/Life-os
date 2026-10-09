import { expect, test } from '@playwright/test';
import { openDisclosure } from './helpers/disclosures';

test('a walk started from Today returns to Today after completion', async ({ page }) => {
  await page.goto('/#/v2/today');
  await openDisclosure(page, '.planner-today-context');
  await page.getByRole('link', { name: 'Прогулка', exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/walks\?origin=today/);
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить прогулку', exact: true }).click();
  await expect(page.getByText('Источник: Сегодня')).toBeVisible();
  await page.getByRole('button', { name: 'Вернуться к сегодня' }).click();
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
});
