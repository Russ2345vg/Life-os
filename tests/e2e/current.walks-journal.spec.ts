import { expect, test } from '@playwright/test';

test('walk result is previewed and explicitly appended to the day diary', async ({ page }) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить прогулку', exact: true }).click();
  await page.getByText('Добавить итог и оценку', { exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Итог прогулки', exact: true })
    .fill('Появилась ясная мысль');
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Посмотреть перед переносом' })).toBeVisible();
  await page.getByRole('button', { name: 'Посмотреть перед переносом' }).click();
  await expect(page.getByRole('textbox', { name: 'Текст для переноса' })).toHaveValue(
    'Появилась ясная мысль',
  );
  await page.getByRole('button', { name: 'Добавить в заметку дня' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Итог добавлен' })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть дневник' }).click();
  await expect(page.getByText('Появилась ясная мысль', { exact: true })).toBeVisible();
});
