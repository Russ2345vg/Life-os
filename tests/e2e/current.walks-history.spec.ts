import { expect, test } from '@playwright/test';

test('a completed walk can be filtered, removed and restored with its history intact', async ({
  page,
}) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await page.getByRole('combobox', { name: 'Состояние' }).selectOption('completed');
  await expect(page.getByRole('button', { name: /Открыть прогулку/ })).toBeVisible();
  await page.getByRole('button', { name: /Открыть прогулку/ }).click();
  await page.getByText('Управление записью').click();
  await page.getByRole('button', { name: 'Удалить прогулку' }).click();
  await expect(page.getByText('Прогулка удалена. История и мысли сохранены.')).toBeVisible();
  await page.getByRole('button', { name: 'Восстановить прогулку' }).click();
  await expect(page.getByText('Прогулка удалена. История и мысли сохранены.')).toHaveCount(0);
});
