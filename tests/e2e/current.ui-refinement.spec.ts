import { expect, test } from '@playwright/test';
import { EntityId, Goal } from '../../src/domain';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';

test('UI refinement preserves the goal creation origin and keyboard focus', async ({ page }) => {
  await page.goto('/#/v2/goals');
  await expect(page.getByRole('heading', { name: 'Цели', exact: true })).toBeVisible();
  const goal = Goal.create({
    id: EntityId.create('ui-refinement-goal'),
    title: 'Цель для проверки возврата',
    now: new Date(),
  });
  await page.evaluate(async (record) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('goals', 'readwrite');
      tx.objectStore('goals').put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, GoalRecordMapper.toRecord(goal));
  await page.reload();
  const next = page.getByRole('link', { name: 'Добавить следующий шаг', exact: true });
  await next.click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByLabel('Название', { exact: true })).toBeFocused();
  const dates = panel.getByRole('group', { name: 'Когда выполнить' });
  expect(await dates.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  for (const button of await dates.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/v2\/goals$/);
  await expect(page.locator('#planner-main-content')).toBeFocused();
  await next.click();
  await panel.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page).toHaveURL(/#\/v2\/goals$/);
  await page.getByRole('link', { name: goal.title, exact: true }).click();
  await page.getByRole('link', { name: 'Назначить следующий шаг', exact: true }).click();
  await expect(panel.getByLabel('Название', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/v2\/goals\/ui-refinement-goal$/);
});

test('UI refinement keeps navigation stable and the approved planning order', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const list = await page.locator('.planner-today-list').boundingBox();
  const settings = await page.locator('.planner-main-direction').boundingBox();
  const quick = await page
    .getByRole('textbox', { name: 'Новое действие на сегодня' })
    .boundingBox();
  expect(quick!.y).toBeLessThan(list!.y);
  if (page.viewportSize()!.width <= 760) {
    expect(list!.y).toBeLessThan(settings!.y);
  }
  const nav = page.getByRole('navigation', { name: 'Рабочий интерфейс' });
  const visibleLabels = await nav.locator('a:visible,button:visible').allTextContents();
  for (const destination of ['Входящие', 'Подготовка ко сну']) {
    await nav.getByRole('button', { name: 'Ещё', exact: true }).click();
    await page
      .locator('#planner-more-menu')
      .getByRole('link', { name: destination, exact: true })
      .click();
    await expect(nav.getByRole('button', { name: 'Ещё', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await nav.locator('a:visible,button:visible').allTextContents()).toEqual(visibleLabels);
  }
  await page.screenshot({ path: info.outputPath('stable-navigation.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('premium navigation stays usable between phone and tablet widths', async ({ page }) => {
  await page.setViewportSize({ width: 730, height: 900 });
  await page.goto('/#/v2/spheres');
  await expect(page.getByRole('heading', { name: 'Сферы жизни', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Рабочий интерфейс' });
  const bounds = await nav.boundingBox();
  expect(bounds!.y).toBeGreaterThan(750);
  expect(bounds!.width).toBeGreaterThan(700);
  await expect(nav.locator('[aria-current="page"]:visible')).toHaveCount(1);
  await nav.getByRole('button', { name: 'Ещё', exact: true }).click();
  await expect(
    page.locator('#planner-more-menu').getByRole('link', { name: 'Сферы', exact: true }),
  ).toBeVisible();
});

test('premium quick create follows the same visual and keyboard order on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/v2/today');
  const title = page.getByRole('textbox', { name: 'Новое действие на сегодня' });
  await title.fill('Проверка порядка фокуса');
  const create = page.getByRole('button', { name: 'Создать', exact: true });
  const options = page.getByRole('button', { name: 'Создать с параметрами', exact: true });
  const createBounds = await create.boundingBox();
  const optionsBounds = await options.boundingBox();
  expect(createBounds!.x).toBeLessThan(optionsBounds!.x);
  await create.focus();
  await page.keyboard.press('Tab');
  await expect(options).toBeFocused();
});
