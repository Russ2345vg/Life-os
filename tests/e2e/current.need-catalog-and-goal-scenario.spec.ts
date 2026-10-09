import { expect, test } from '@playwright/test';
import { openDisclosure } from './helpers/disclosures';

test('a selected need shows its goal and inherited action on desktop and mobile', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/#/v2/goals');
  await page.getByRole('button', { name: 'Новая цель', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Заботиться о себе');
  await page.getByLabel('Потребность', { exact: true }).selectOption({ label: 'Здоровье' });
  await page.getByRole('button', { name: 'Создать цель', exact: true }).click();
  await page.getByRole('link', { name: 'Открыть цель', exact: true }).click();
  await page.getByRole('link', { name: '+ Добавить действие', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Сделать зарядку');
  await page.getByRole('button', { name: 'Создать действие', exact: true }).click();
  await page.goto('/#/v2/needs');
  await expect(page.getByRole('heading', { name: 'Потребности', exact: true })).toBeVisible();
  const needLink = page.locator('.planner-needs__list').getByRole('link', { name: /Здоровье/ });
  await needLink.focus();
  await expect(needLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Здоровье', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Заботиться о себе', exact: true })).toBeVisible();
  const actionLink = page.getByRole('link', { name: 'Сделать зарядку', exact: true });
  await expect(actionLink).toBeVisible();
  expect((await actionLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByText('От родителя', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('need-detail.png'), fullPage: true });
  await actionLink.click();
  await expect(page.getByRole('heading', { name: 'Сделать зарядку', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a custom need appears in the catalog and remains after reload', async ({ page }) => {
  await page.goto('/#/v2/goals');
  await page.getByRole('button', { name: 'Новая цель', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Тихий вечер');
  await page.getByLabel('Потребность', { exact: true }).selectOption('__custom__');
  await page.getByLabel('Своя потребность', { exact: true }).fill('Пространство для тишины');
  await page.getByRole('button', { name: 'Создать цель', exact: true }).click();
  await page.getByRole('link', { name: 'Открыть цель', exact: true }).click();
  await page.getByRole('link', { name: 'Пространство для тишины', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Пространство для тишины' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Тихий вечер', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Пространство для тишины' })).toBeVisible();
  await page.getByRole('link', { name: '← Все потребности', exact: true }).click();
  await expect(
    page.locator('.planner-needs__list').getByRole('link', { name: /Пространство для тишины/ }),
  ).toBeVisible();
});

test('a new action from a goal joins the selected existing scenario', async ({ page }) => {
  await page.goto('/#/v2/today');
  await openDisclosure(page, '.planner-scenarios-disclosure');
  const scenarios = page.getByRole('region', { name: 'Сценарии задач' });
  await scenarios.getByRole('button', { name: 'Создать сценарий', exact: true }).click();
  await scenarios
    .getByRole('textbox', { name: 'Название сценария', exact: true })
    .fill('Утренний ритм');
  await scenarios.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click();
  await expect(scenarios.getByRole('heading', { name: 'Утренний ритм 0 из 3' })).toBeVisible();
  await page.goto('/#/v2/goals');
  await page.getByRole('button', { name: 'Новая цель', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Читать регулярно');
  await page.getByRole('button', { name: 'Создать цель', exact: true }).click();
  await page.getByRole('link', { name: 'Открыть цель', exact: true }).click();
  await page.getByRole('link', { name: '+ Добавить действие', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Прочитать страницу');
  await page
    .getByLabel('Сценарий задач', { exact: false })
    .selectOption({ label: 'Утренний ритм · 0 из 3' });
  await page.getByRole('button', { name: 'Создать действие', exact: true }).click();
  await page.goto('/#/v2/today');
  await openDisclosure(page, '.planner-scenarios-disclosure');
  await scenarios
    .getByRole('combobox', { name: 'Сейчас я…' })
    .selectOption({ label: 'Утренний ритм' });
  await expect(scenarios.getByRole('heading', { name: 'Утренний ритм 1 из 3' })).toBeVisible();
  await expect(
    scenarios.getByRole('button', { name: 'Прочитать страницу', exact: true }),
  ).toBeVisible();
});
