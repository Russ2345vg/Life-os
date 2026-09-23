import { expect, test, type Page } from '@playwright/test';

function observeRuntimeIssues(page: Page, issues: string[] = []): string[] {
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text());
  });
  return issues;
}

test('starts in the current workspace and replaces removed routes with Today', async ({ page }) => {
  const issues = observeRuntimeIssues(page);
  await page.goto('/#/routine/evening?date=2026-09-22');
  await expect(page).toHaveURL(/#\/v2\/today$/);
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Рабочий интерфейс' })).toBeVisible();
  await expect(page.getByText('Старая версия', { exact: true })).toHaveCount(0);
  expect(issues).toEqual([]);
});

test('opens every primary current route directly and survives reload', async ({ context }) => {
  test.slow();
  const issues: string[] = [];
  for (const path of [
    'today',
    'spheres',
    'directions',
    'goals',
    'actions',
    'inbox',
    'account',
  ] as const) {
    const routePage = await context.newPage();
    observeRuntimeIssues(routePage, issues);
    try {
      await routePage.goto(`/#/v2/${path}`);
      await expect(
        routePage.locator('#planner-main-content').getByRole('heading').first(),
      ).toBeVisible();
      if (path === 'account') {
        await expect(
          routePage.getByText('Данные хранятся только на этом устройстве'),
        ).toBeVisible();
      }
      await routePage.reload({ waitUntil: 'domcontentloaded' });
      await expect(routePage).toHaveURL(new RegExp(`#\\/v2\\/${path}$`));
      await expect(
        routePage.locator('#planner-main-content').getByRole('heading').first(),
      ).toBeVisible();
    } finally {
      await routePage.close();
    }
  }
  expect(issues).toEqual([]);
});

test('keeps the current workspace usable at desktop and mobile widths', async ({ page }, info) => {
  const issues = observeRuntimeIssues(page);
  const sizes =
    info.project.name === 'mobile-chrome'
      ? [
          { width: 390, height: 844 },
          { width: 360, height: 800 },
        ]
      : [
          { width: 1440, height: 900 },
          { width: 1280, height: 720 },
        ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/#/v2/today');
    await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      mainVisible: document.getElementById('planner-main-content')?.getClientRects().length ?? 0,
    }));
    expect(layout.content).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.mainVisible).toBeGreaterThan(0);
    await page.getByRole('link', { name: 'К содержимому', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#planner-main-content')).toBeFocused();
  }
  expect(issues).toEqual([]);
});
