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

test('reflection walk keeps an answer with its question and can continue the theme', async ({
  page,
}) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Настроить' }).click();
  await page.getByLabel('Намерение').selectOption('reflection');
  await page
    .getByRole('textbox', { name: 'Вопрос — необязательно' })
    .fill('Почему я откладываю проект?');
  await page.getByLabel('Подсказки').selectOption('ownQuestion');
  await page
    .getByLabel('Настроить прогулку')
    .getByRole('button', { name: 'Начать прогулку' })
    .click();
  await expect(page.getByText('Почему этот вопрос важен для вас сейчас?')).toBeVisible();
  await page.getByRole('textbox', { name: 'Ответ на вопрос' }).fill('Неясен первый шаг');
  await page.getByRole('button', { name: 'Сохранить ответ' }).click();
  await expect(page.getByText('Ответ сохранён')).toBeVisible();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await expect(page.getByText('Что вы уже знаете, а что пока только предполагаете?')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'К предыдущему вопросу' }).click();
  await expect(page.getByText('Неясен первый шаг')).toBeVisible();
  await page.getByRole('button', { name: 'Завершить прогулку' }).click();
  await page.getByText('Добавить итог и оценку', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Что понял' }).fill('Нужен первый шаг');
  await page.getByRole('textbox', { name: 'Что осталось открытым' }).fill('Сроки');
  await page.getByRole('textbox', { name: 'Что хочу сделать' }).fill('Написать план');
  await page.getByRole('button', { name: 'Сохранить итог' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Итог сохранён' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.walk-reflection-summary').getByText('Написать план')).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить тему' }).click();
  await expect(page.getByText('Почему я откладываю проект?')).toBeVisible();
});

test('reflection setup offers problem analysis and ready themes', async ({ page }) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Настроить' }).click();
  await page.getByLabel('Намерение').selectOption('reflection');
  await expect(
    page.getByLabel('Подсказки').getByRole('option', { name: 'Разобраться с проблемой' }),
  ).toBeAttached();
  await expect(
    page.getByLabel('Подсказки').getByRole('option', { name: 'Итоги дня' }),
  ).toBeAttached();
  await expect(
    page.getByLabel('Подсказки').getByRole('option', { name: 'Отношения' }),
  ).toBeAttached();
  await page.getByLabel('Подсказки').selectOption('problem');
  await page
    .getByLabel('Настроить прогулку')
    .getByRole('button', { name: 'Начать прогулку' })
    .click();
  await expect(page.getByText('Что именно происходит?')).toBeVisible();
});
