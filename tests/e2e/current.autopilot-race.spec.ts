import { expect, test } from '@playwright/test';
test.use({ timezoneId: 'Asia/Chita' });
test('late old date response and stale draft save retain the current wish text', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-10T00:00:00Z'));
  await page.goto('/tests/fixtures/autopilot-race.html');
  await expect(page.getByText('Загружаю предпочтения…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Показать 11 октября' }).click();
  const wishes = page.getByLabel('Пожелания на день', { exact: true });
  await wishes.fill('Сегодняшний текст');
  await page.getByRole('button', { name: 'Завершить старую загрузку' }).click();
  await expect(wishes).toHaveValue('Сегодняшний текст');
  await page.getByLabel('Начать с', { exact: true }).fill('09:00');
  await page.getByLabel('Закончить до').fill('22:00');
  await page.getByLabel('Подъём', { exact: true }).fill('07:00');
  await page.getByLabel('Отбой', { exact: true }).fill('23:00');
  await page.getByLabel('Предусмотреть прогулку').uncheck();
  await page.getByRole('button', { name: 'Изменить черновик извне' }).click();
  await expect(page.getByText('Внешнее сохранение завершено')).toBeVisible();
  await page.getByRole('button', { name: 'Собрать мой день', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(wishes).toHaveValue('Сегодняшний текст');
  await expect(page.getByRole('button', { name: 'Применить план', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Задержать следующую загрузку' }).click();
  await page.getByRole('button', { name: 'Загрузить сохранённые настройки' }).click();
  await expect(wishes).toBeDisabled();
  await expect(wishes).toHaveValue('Сегодняшний текст');
  await page.getByRole('button', { name: 'Завершить старую загрузку' }).click();
  await expect(wishes).toBeEnabled();
  await expect(wishes).toHaveValue('Текст другого редактора');
  await wishes.fill('Новый текст после загрузки');
  await page.getByRole('button', { name: 'Завершить старую загрузку' }).click();
  await expect(wishes).toHaveValue('Новый текст после загрузки');
});
