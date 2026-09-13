import { expect, test, type Page } from '@playwright/test';

async function openOverview(page: Page) {
  await page.goto('/#/goals');
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обзор управления', exact: true })).toBeVisible();
}

test('overview reflows and exposes an honest actionable empty state', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openOverview(page);
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [768, 1024],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('#management-focus-heading')).toContainText('Фокус не определён');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const sizes = await page.locator('.management-overview button:visible').evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return [rect.width, rect.height];
      }),
    );
    // Transformed DOMRects can report 43.999969px for a 44px layout box.
    for (const [w, h] of sizes) {
      expect(w, `button width at viewport ${width}`).toBeGreaterThanOrEqual(44 - 0.01);
      expect(h, `button height at viewport ${width}`).toBeGreaterThanOrEqual(44 - 0.01);
    }
    await page.screenshot({ path: info.outputPath(`overview-${width}.png`), fullPage: true });
  }
  await expect(page.getByRole('heading', { name: 'Следующий шаг', exact: true })).toBeVisible();
  await expect(page.getByText('Критичных', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Смотреть сигналы', exact: true }).click();
  await expect(page.locator('#overview-signals-heading')).toBeFocused();
  await expect(page.locator('.overview-signal-count')).toHaveText('Все сигналы: 1');
  await expect(page.locator('.overview-signal-list li')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('.overview-content')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.locator('.overview-focus .primary-button').press('Enter');
  await expect(page.getByRole('tab', { name: 'Направления', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('#management-focus-heading')).toHaveText('Фокус не определён');
  await page.getByRole('button', { name: 'Открыть день', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'День', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(errors).toEqual([]);
});

test('overview assigns and persists direction and goal focus through existing commands', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openOverview(page);
  await page.locator('.overview-focus .primary-button').click();
  await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  await page.locator('#direction-name').fill('Личное развитие');
  await page
    .locator('form')
    .filter({ has: page.locator('#direction-name') })
    .getByRole('button', { name: 'Создать направление', exact: true })
    .click();
  await expect(page.locator('#direction-name')).toHaveCount(0);
  await page.locator('summary[aria-label="Действия: Личное развитие"]').click();
  await page.getByRole('button', { name: 'Сделать главным', exact: true }).click();
  await expect(page.getByText('Главное направление обновлено.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('#management-focus-heading')).toHaveText('Личное развитие');
  await page.reload();
  await page.getByRole('button', { name: 'Управление', exact: true }).click();
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('#management-focus-heading')).toHaveText('Личное развитие');
  await page
    .locator('.overview-focus')
    .getByRole('button', { name: 'Открыть направление', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Личное развитие', exact: true }),
  ).toBeVisible();
  await page
    .locator('.direction-focus')
    .getByRole('button', { name: 'Создать цель', exact: true })
    .click();
  await page.locator('#direction-project-title').fill('Отменённый выбор');
  await page.locator('label[for="direction-project-main"]').click();
  await expect(page.locator('#direction-project-main')).toBeChecked();
  await page
    .locator('.direction-project-form')
    .getByRole('button', { name: 'Отмена', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('#management-focus-heading')).toHaveText('Личное развитие');
  await page
    .locator('.overview-focus')
    .getByRole('button', { name: 'Открыть направление', exact: true })
    .click();
  await page
    .locator('.direction-focus')
    .getByRole('button', { name: 'Создать цель', exact: true })
    .click();
  const title = 'Развивать_LifeOS_и_сохранять_длинные_названия_целей_без_обрезания';
  await page.locator('#direction-project-title').fill(title);
  await page.locator('label[for="direction-project-main"]').click();
  await expect(page.locator('#direction-project-main')).toBeChecked();
  await page
    .locator('.direction-project-form')
    .getByRole('button', { name: 'Создать цель', exact: true })
    .click();
  await expect(
    page.getByText('Цель создана в текущем направлении.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('#management-focus-heading')).toHaveText(title);
  await page.reload();
  await page.getByRole('button', { name: 'Управление', exact: true }).click();
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('#management-focus-heading')).toHaveText(title);
  await page
    .locator('.overview-focus')
    .getByRole('button', { name: 'Открыть цель', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await page
    .locator('.overview-signal-list')
    .getByRole('button', { name: 'Открыть цель', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Управление целью и связи' });
  await panel.getByRole('button', { name: 'Создать решение', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Формулировка решения *', { exact: true }).fill('Первый шаг');
  await dialog.getByLabel('Ожидаемый результат *', { exact: true }).fill('Связь с целью');
  await dialog
    .locator('form')
    .getByRole('button', { name: 'Создать решение', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('.overview-signal-list')).not.toContainText(
    'Главная цель без активных решений',
  );
  await expect(page.locator('.overview-signal-count')).toHaveText(
    `Все сигналы: ${await page.locator('.overview-signal-list li').count()}`,
  );
  for (const width of [1440, 1280, 768, 390, 360]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`overview-focus-${width}.png`), fullPage: true });
  }
  await page
    .locator('.overview-signal-list')
    .getByRole('button', { name: 'Открыть решение', exact: true })
    .click();
  await expect(page.getByRole('tab', { name: 'Решения', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('heading', { level: 2, name: 'Первый шаг', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('overview loading, error, retry and date changes never show false zero or stale results', async ({
  page,
}, info) => {
  await page.goto('/tests/fixtures/management-overview.html');
  const overview = page.locator('.management-overview');
  await expect(overview.getByRole('status')).toContainText('Загружаем обзор');
  await expect(overview.locator('.overview-row')).toHaveCount(0);
  await expect(overview).not.toContainText('Нет сигналов');
  await page.getByRole('button', { name: 'Reject query' }).click();
  await expect(overview.getByRole('alert')).toContainText('Не удалось загрузить');
  await expect(overview).not.toContainText('Нет сигналов');
  await page.screenshot({ path: info.outputPath('overview-error.png'), fullPage: true });
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(overview.getByRole('status')).toContainText('Загружаем обзор');
  await page.getByRole('button', { name: 'Change date' }).click();
  await expect(overview.locator('time')).toHaveAttribute('datetime', '2026-09-10');
  await page.getByRole('button', { name: 'Resolve query' }).click();
  await expect(overview.getByRole('status')).toContainText('Загружаем обзор');
  await page.getByRole('button', { name: 'Resolve query' }).click();
  await expect(overview.locator('#management-focus-heading')).toHaveText('Тестовое направление');
  await expect(overview.getByRole('status')).toHaveText('Нет сигналов, требующих внимания');
});
