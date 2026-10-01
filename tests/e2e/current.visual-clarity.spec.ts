import { expect, test, type Page } from '@playwright/test';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../src/domain';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seedTodayAction(page: Page) {
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const now = new Date();
  const action = LifeAction.createDraft({
    id: EntityId.create('visual-clarity-action'),
    title: LifeActionTitle.create('Подготовить важный разговор о планах на следующую неделю'),
    plannedDate: DayDate.fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    createdAt: now,
    eventId: EntityId.create('visual-clarity-created'),
  });
  await page.evaluate(async (record) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      tx.objectStore('lifeActions').put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, LifeActionRecordMapper.toRecord(action));
  await page.reload();
  await expect(
    page.getByRole('button', { name: action.title.toString(), exact: true }).first(),
  ).toBeVisible();
}

test('Today shows the first action before secondary context without horizontal overflow', async ({
  page,
}) => {
  await seedTodayAction(page);
  const layout = await page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('.planner-action-row--today');
    const focus = document.querySelector<HTMLElement>('.planner-month-focus');
    const plan = document.querySelector<HTMLElement>('.planner-day-workspace');
    const sidebar = document.querySelector<HTMLElement>('.planner-today-sidebar');
    if (!action || !focus || !plan || !sidebar) throw new Error('Today layout is incomplete');
    return {
      actionTop: action.getBoundingClientRect().top,
      actionFontSize: getComputedStyle(action).fontSize,
      focusAfterPlan: Boolean(
        plan.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      focusInSidebar: sidebar.contains(focus),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(layout.actionTop).toBeLessThanOrEqual(page.viewportSize()!.width <= 640 ? 650 : 500);
  expect(layout.actionFontSize).toBe('16px');
  expect(layout.focusAfterPlan).toBe(true);
  expect(layout.focusInSidebar).toBe(true);
  expect(layout.overflow).toBeLessThanOrEqual(1);
});

test('Diary uses the shared 24 px header rhythm', async ({ page }) => {
  await page.goto('/#/v2/diary?period=week&date=2026-09-21');
  const header = page.locator('.planner-diary-header');
  await expect(header).toBeVisible();
  expect(await header.evaluate((element) => getComputedStyle(element).gap)).toBe('24px');
});

test('unsaved action confirmation has a rounded surface', async ({ page }) => {
  await seedTodayAction(page);
  await page
    .getByRole('button', {
      name: 'Подготовить важный разговор о планах на следующую неделю',
      exact: true,
    })
    .first()
    .click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await panel.getByRole('textbox', { name: 'Название' }).fill('Черновик изменения');
  await panel.getByRole('button', { name: 'Закрыть панель' }).click();
  const confirmation = panel.getByRole('alertdialog', { name: 'Несохранённые изменения' });
  await expect(confirmation).toBeVisible();
  expect(
    await confirmation.evaluate((element) => getComputedStyle(element).borderTopLeftRadius),
  ).toBe('16px');
});
