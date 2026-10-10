import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../src/domain';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seedToday(page: Page) {
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const clock = await page.evaluate(() => {
    const now = new Date();
    return {
      now: now.toISOString(),
      today: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    };
  });
  const records = Array.from({ length: 12 }, (_, index) =>
    LifeActionRecordMapper.toRecord(
      LifeAction.createDraft({
        id: EntityId.create(`more-menu-action-${index}`),
        title: LifeActionTitle.create(`План на сегодня ${index + 1}`),
        plannedDate: DayDate.create(clock.today),
        createdAt: new Date(clock.now),
        eventId: EntityId.create(`more-menu-created-${index}`),
      }),
    ),
  );
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      records.forEach((record) => tx.objectStore('lifeActions').put(record));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, records);
  await page.reload();
  await expect(page.getByRole('button', { name: 'План на сегодня 1', exact: true })).toBeVisible();
}

test('More menu stays above Today cards and its links remain clickable', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedToday(page);
  const viewports =
    info.project.name === 'desktop-chrome'
      ? [
          { width: 1440, height: 1000 },
          { width: 1440, height: 900 },
          { width: 1280, height: 720 },
        ]
      : [
          { width: 390, height: 844 },
          { width: 320, height: 700 },
        ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    const more = page.getByRole('button', { name: 'Ещё', exact: true });
    await more.click();
    const menu = page.locator('#planner-more-menu');
    await expect(menu).toHaveCSS('opacity', '1');
    const metrics = await menu.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const sidebar = element.closest('.planner-sidebar')!;
      return {
        menu: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        sidebarZIndex: getComputedStyle(sidebar).zIndex,
        links: Array.from(element.querySelectorAll('a'))
          .filter((link) => link.getBoundingClientRect().height > 0)
          .map((link) => {
            const box = link.getBoundingClientRect();
            const points = [0.1, 0.5, 0.9].map((fraction) => ({
              x: box.x + box.width * fraction,
              y: box.y + box.height / 2,
            }));
            return {
              label: link.textContent?.trim(),
              height: box.height,
              reachable: points.every(({ x, y }) => link.contains(document.elementFromPoint(x, y))),
              interceptedBy: points.map(({ x, y }) => document.elementFromPoint(x, y)?.className),
            };
          }),
      };
    });
    const prefix = `more-menu-${viewport.width}x${viewport.height}`;
    await writeFile(info.outputPath(prefix + '.json'), JSON.stringify(metrics, null, 2));
    await page.screenshot({ path: info.outputPath(prefix + '.png') });
    expect(metrics.links.every((link) => link.reachable)).toBe(true);
    expect(metrics.links.every((link) => link.height >= 44)).toBe(true);
    expect(metrics.menu.x).toBeGreaterThanOrEqual(0);
    expect(metrics.menu.y).toBeGreaterThanOrEqual(0);
    expect(metrics.menu.x + metrics.menu.width).toBeLessThanOrEqual(viewport.width);
    expect(metrics.menu.y + metrics.menu.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await menu.getByRole('link', { name: 'Входящие', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Входящие', exact: true })).toBeVisible();
    await expect(menu).toBeHidden();
    await page.goto('/#/v2/today');
    await more.click();
    await menu.getByRole('link', { name: 'Входящие', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();
  }
  expect(errors).toEqual([]);
});
