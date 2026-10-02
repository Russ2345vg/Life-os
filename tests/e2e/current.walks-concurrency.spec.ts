import { expect, test } from '@playwright/test';

test('a stale reflection draft cannot overwrite a newer edit from another tab', async ({
  page,
}) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить прогулку', exact: true }).click();
  await page.getByText('Добавить итог и оценку', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Итог прогулки' }).fill('Черновик первой вкладки');

  const other = await page.context().newPage();
  await other.goto(page.url());
  await other.getByText('Добавить итог и оценку', { exact: true }).click();
  await other.getByRole('textbox', { name: 'Итог прогулки' }).fill('Сохранено во второй вкладке');
  await other.getByRole('button', { name: 'Сохранить итог' }).click();
  await expect(other.getByText('Итог сохранён')).toBeVisible();

  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Загрузить актуальную запись' })).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить итог' }).click();
  await expect(page.getByRole('alert')).toContainText('Запись изменилась');
  await page.reload();
  await expect(
    page.getByRole('paragraph').filter({ hasText: /^Сохранено во второй вкладке$/ }),
  ).toBeVisible();
  await other.close();
});

test('a stale thought draft cannot overwrite a newer edit from another tab', async ({ page }) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Новая мысль', exact: true }).fill('Исходная мысль');
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  await page.goto('/#/v2/walks/captures');
  await page.getByRole('button', { name: 'Изменить мысль' }).click();
  await page.getByRole('textbox', { name: 'Текст мысли' }).fill('Черновик первой вкладки');

  const other = await page.context().newPage();
  await other.goto(page.url());
  await other.getByRole('button', { name: 'Изменить мысль' }).click();
  await other.getByRole('textbox', { name: 'Текст мысли' }).fill('Сохранено во второй вкладке');
  await other.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(other.getByText('Сохранено во второй вкладке', { exact: true })).toBeVisible();

  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Загрузить актуальную мысль' })).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('alert')).toContainText('Запись изменилась');
  await page.reload();
  await expect(page.getByText('Сохранено во второй вкладке', { exact: true })).toBeVisible();
  await other.close();
});

test('editing a thought updates the version used to create an action', async ({ page }) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Новая мысль', exact: true }).fill('Исходная мысль');
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  await page.goto('/#/v2/walks/captures');
  await page.getByRole('button', { name: 'Изменить мысль' }).click();
  await page.getByRole('textbox', { name: 'Текст мысли' }).fill('Исправленная мысль');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByText('Исправленная мысль', { exact: true })).toBeVisible();
  await page.getByText('Создать действие из мысли').click();
  await expect(page.getByRole('textbox', { name: 'Название действия' })).toHaveValue(
    'Исправленная мысль',
  );
  await page.getByRole('button', { name: 'Создать черновик действия' }).click();
  await expect(page).toHaveURL(/#\/v2\/actions\//);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
