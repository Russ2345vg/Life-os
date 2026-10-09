import { expect, test } from '@playwright/test';

test('analytics opens from navigation and preserves its calendar period in the URL', async ({
  page,
}) => {
  await page.goto('/#/v2/today');
  await page.getByRole('button', { name: 'Ещё', exact: true }).click();
  await page.getByRole('link', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Аналитика', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Пока нет записей за этот период' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Месяц', exact: true }).click();
  await expect(page).toHaveURL(/#\/v2\/analytics\?period=month/);
  await page.getByRole('button', { name: 'Предыдущий период' }).click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-01/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});
