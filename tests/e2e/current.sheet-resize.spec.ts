import { expect, test } from '@playwright/test';

const WIDTH_STORAGE_KEY = 'lifeos.planner-sheet-width.v1';

test('shared editor width can be resized and persists between goals and actions', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Desktop resize interaction');
  await page.addInitScript((key) => window.localStorage.removeItem(key), WIDTH_STORAGE_KEY);
  await page.goto('/#/v2/goals');
  await page.getByRole('button', { name: 'Новая цель', exact: true }).click();

  const goalPanel = page.getByRole('dialog', { name: 'Новая цель' });
  const resizeHandle = goalPanel.getByRole('separator', { name: 'Изменить ширину панели' });
  await expect(goalPanel).toBeVisible();
  await expect(resizeHandle).toBeVisible();
  const initialBox = await goalPanel.boundingBox();
  const handleBox = await resizeHandle.boundingBox();
  expect(initialBox).not.toBeNull();
  expect(handleBox).not.toBeNull();

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 100);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 - 120, handleBox!.y + 100);
  await page.mouse.up();
  await expect(goalPanel).toHaveCSS('width', `${initialBox!.width + 120}px`);

  await goalPanel.getByRole('button', { name: 'Закрыть панель' }).click();
  await page.goto('/#/v2/actions');
  await page.getByRole('button', { name: 'Новое действие', exact: true }).click();
  const actionPanel = page.getByRole('dialog', { name: 'Новое действие' });
  await expect(actionPanel).toBeVisible();
  await expect(actionPanel).toHaveCSS('width', `${initialBox!.width + 120}px`);

  const actionResizeHandle = actionPanel.getByRole('separator', {
    name: 'Изменить ширину панели',
  });
  await actionResizeHandle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(actionPanel).toHaveCSS('width', `${initialBox!.width + 88}px`);
  await page.screenshot({ path: testInfo.outputPath('shared-sheet-desktop.png'), fullPage: true });
});

test('shared editor stays full width and hides the resize handle on mobile', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Mobile sheet behavior');
  await page.addInitScript(({ key, width }) => window.localStorage.setItem(key, String(width)), {
    key: WIDTH_STORAGE_KEY,
    width: 700,
  });
  await page.goto('/#/v2/goals');
  await page.getByRole('button', { name: 'Новая цель', exact: true }).click();

  const panel = page.getByRole('dialog', { name: 'Новая цель' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('separator', { name: 'Изменить ширину панели' })).toBeHidden();
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.width).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('shared-sheet-mobile.png'), fullPage: true });
});
