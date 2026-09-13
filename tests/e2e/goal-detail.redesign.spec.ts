import { expect, test, type Page } from '@playwright/test';

// Every test uses Playwright's fresh browser context and disposable local data.
// No user's existing browser profile or sync account is opened.
async function createGoal(page: Page, title: string) {
  await page.goto('/#/goals');
  await page.getByRole('tab', { name: 'Направления', exact: true }).click();
  await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  await page.locator('#direction-name').fill('Личное развитие');
  await page
    .locator('form')
    .filter({ has: page.locator('#direction-name') })
    .getByRole('button', { name: 'Создать направление', exact: true })
    .click();
  await expect(page.locator('#direction-name')).toHaveCount(0);
  await page.goto('/#/goals/new');
  await page.getByLabel('Название цели', { exact: true }).fill(title);
  await page
    .getByLabel('Почему это важно', { exact: true })
    .fill('Работать спокойнее и видеть главное.');
  await page.getByLabel('Почему сейчас', { exact: true }).fill('Основные сценарии уже работают.');
  await page
    .getByLabel('Критерий достижения', { exact: true })
    .fill('Экран удобен на компьютере и телефоне.');
  await page
    .getByLabel('Следующее продвижение', { exact: true })
    .fill('Проверить основные сценарии');
  await page.getByLabel('Текущее значение', { exact: true }).fill('40');
  await page.locator('#goal-stage-active').click();
  await page.getByLabel('Направление', { exact: true }).selectOption({ label: 'Личное развитие' });
  await page.getByRole('button', { name: 'Создать цель', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
}

test('goal detail keeps decision creation, focus and a fresh second form', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await createGoal(page, 'Проверка деталей цели');
  const region = page.getByRole('region', { name: 'Управление целью и связи' });
  const trigger = region.getByRole('button', { name: 'Создать решение', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  const title = dialog.getByLabel('Формулировка решения *', { exact: true });
  await expect(title).toBeFocused();
  await expect(dialog.getByRole('combobox', { name: 'Цель', exact: true })).toBeDisabled();
  const close = dialog.getByRole('button', { name: 'Закрыть форму решения' });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator('button').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog
    .locator('form')
    .getByRole('button', { name: 'Создать решение', exact: true })
    .click();
  await expect(dialog.locator('[aria-invalid="true"]').first()).toBeVisible();
  await title.fill('Проверить удобство экрана');
  await dialog.getByLabel('Ожидаемый результат *', { exact: true }).fill('Проверка завершена');
  await dialog
    .locator('form')
    .getByRole('button', { name: 'Создать решение', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    region.getByText('Решение создано и связано с целью.', { exact: true }),
  ).toBeVisible();
  await expect(region.locator('.goal-detail-related > ul')).toContainText(
    'Проверить удобство экрана',
  );
  await trigger.click();
  await expect(title).toHaveValue('');
  await expect(title).toBeFocused();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(region.locator('.goal-detail-related > ul')).toContainText(
    'Проверить удобство экрана',
  );
  await page.getByRole('link', { name: 'Редактировать', exact: true }).click();
  await page.getByLabel('Название цели', { exact: true }).fill('Обновлённая цель');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обновлённая цель', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Обновлённая цель', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('goal detail reflows, reveals secondary data and preserves lifecycle controls', async ({
  page,
}, info) => {
  await createGoal(page, 'Запустить новую версию LifeOS');
  const region = page.getByRole('region', { name: 'Управление целью и связи' });
  const widths = info.project.name === 'desktop-chrome' ? [1600, 1280] : [390, 360];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : width < 500 ? 844 : 900 });
    await expect(
      region.getByRole('button', { name: 'Создать решение', exact: true }),
    ).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const controls = await page
      .locator(
        '.goal-detail-page button:visible, .goal-detail-page summary:visible, .goal-detail-page a:visible',
      )
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(controls.every((height) => height >= 44)).toBe(true);
    await page.locator('.goal-detail-heading h1').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width < 500) {
      const primary = await page.locator('.goal-detail-primary').boundingBox();
      const navigation = await page.locator('.application-bottom-navigation').boundingBox();
      expect(primary).not.toBeNull();
      expect(navigation).not.toBeNull();
      expect(primary!.y + primary!.height).toBeLessThanOrEqual(navigation!.y);
    }
    await info.attach(`goal-detail-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
  await page
    .locator('.goal-detail-information')
    .filter({ hasText: 'Информация цели' })
    .locator('summary')
    .press('Enter');
  await expect(page.getByText('Обновлена', { exact: true })).toBeVisible();
  await page.locator('.goal-detail-more summary').click();
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByRole('button', { name: 'Архивировать', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Запустить новую версию LifeOS', exact: true }),
  ).toBeVisible();
  await region.getByRole('button', { name: 'Приостановить', exact: true }).click();
  await expect(region.getByRole('button', { name: 'Возобновить', exact: true })).toBeVisible();
  await region.getByRole('button', { name: 'Возобновить', exact: true }).click();
  await expect(region.getByRole('button', { name: 'Приостановить', exact: true })).toBeVisible();
  await region.getByRole('button', { name: 'Завершить цель', exact: true }).click();
  await expect(page.locator('.goal-detail-page')).toHaveAttribute('data-goal-status', 'achieved');
  await expect(region.getByRole('button', { name: 'Создать решение', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await info.attach('goal-detail-completed', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('goal detail tolerates cover images, long text and a missing goal', async ({ page }, info) => {
  await createGoal(page, 'Цель с обложкой');
  await page.getByRole('link', { name: 'Редактировать', exact: true }).click();
  const longTitle =
    'Долгосрочная цель с подробным описанием результата и условий достижения '.repeat(2);
  await page.getByLabel('Название цели', { exact: true }).fill(longTitle);
  await page
    .getByLabel('Почему это важно', { exact: true })
    .fill('Подробное объяснение смысла цели. '.repeat(45));
  await page.locator('#goal-cover').setInputFiles('public/evening-center-v2-landscape.png');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.goal-detail-cover img')).toBeVisible();
  await page.setViewportSize({
    width: info.project.name === 'desktop-chrome' ? 1280 : 360,
    height: 800,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(longTitle.trim());
  await page.evaluate(() => window.scrollTo(0, 0));
  await info.attach('goal-detail-long-cover', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.goto('/#/goals/goal-qa-missing');
  await expect(page.getByRole('heading', { name: 'Цель не найдена', exact: true })).toBeVisible();
  await info.attach('goal-detail-not-found', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.getByRole('link', { name: 'Вернуться в Альбом целей', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Альбом целей', exact: true })).toBeVisible();
  // Leaving detail retains the same shared application atmosphere.
  await expect(page.locator('.application-shell:has(.goal-detail-page)')).toHaveCount(0);
  expect(
    await page
      .locator('body')
      .evaluate((body) => getComputedStyle(body, '::before').backgroundImage),
  ).toContain('lifeos-forest-atmosphere.png');
});
