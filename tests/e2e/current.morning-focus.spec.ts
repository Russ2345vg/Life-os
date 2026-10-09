import { expect, test } from '@playwright/test';

test('morning focus uses the main action and keeps its work after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/routine/morning');
  const card = page.getByRole('region', { name: 'Главная задача дня' });
  await expect(card).toContainText('Выберите главное действие');
  await page.getByRole('button', { name: /Выбрать главное действие в плане на сегодня/ }).click();

  await page.getByRole('textbox', { name: 'Новое действие на сегодня' }).fill('Утренний фокус QA');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await page.getByRole('button', { name: 'Сделать главным: Утренний фокус QA' }).click();
  await page.goto('/#/v2/routine/morning');
  await expect(card).toContainText('Утренний фокус QA');
  await expect(card).toContainText('0 / 60 мин');

  const startMorningFocus = card.getByRole('button', { name: 'Начать фокус' });
  await expect(startMorningFocus).toBeDisabled();
  await expect(card).toContainText('Сначала завершите или пропустите зарядку');
  await page
    .getByRole('region', { name: 'Утренняя зарядка' })
    .getByRole('button', { name: 'Пропустить сегодня' })
    .click();
  await expect(startMorningFocus).toBeEnabled();
  await startMorningFocus.click();
  await expect(page.getByRole('timer', { name: 'Осталось времени' })).toHaveText('25:00');
  await page
    .getByRole('region', { name: 'Помодоро по действию' })
    .getByRole('button', { name: 'Начать фокус' })
    .click();
  await expect(page.getByRole('button', { name: 'Пауза' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith('lifeos-morning-focus-v1:')),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(card).toContainText('Утренний фокус QA');
  await expect(card).toContainText('0 / 60 мин');
  await expect(page.getByRole('button', { name: /Фокус · .*Утренний фокус QA/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
