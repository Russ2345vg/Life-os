import { expect, test } from '@playwright/test';

test('current workspace remains readable across its primary screens', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const routes = ['today', 'spheres', 'directions', 'goals', 'actions', 'inbox'] as const;
  for (const route of routes) {
    await page.goto(`/#/v2/${route}`);
    await expect(page.locator('#planner-main-content').getByRole('heading').first()).toBeVisible();
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      minTarget: Math.min(
        ...Array.from(
          document.querySelectorAll<HTMLElement>(
            '.planner-sidebar nav a, .planner-sidebar nav button',
          ),
        )
          .filter((element) => element.getClientRects().length > 0)
          .map((element) =>
            Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height),
          ),
      ),
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
    expect(metrics.minTarget).toBeGreaterThanOrEqual(40);
    await page.screenshot({
      path: info.outputPath(`${route}-${info.project.name}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  }
  expect(errors).toEqual([]);
});
