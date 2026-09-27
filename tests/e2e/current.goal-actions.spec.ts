import { expect, test } from '@playwright/test';
import { DayDate, EntityId, Goal, LifeAction, LifeActionTitle } from '../../src/domain';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

test('goal cards reveal the full action list without requiring a selected next step', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/#/v2/goals');
  await expect(page.getByRole('heading', { name: 'Цели', exact: true })).toBeVisible();
  const now = new Date();
  const goal = Goal.create({
    id: EntityId.create('visibility-goal'),
    title: 'Цель со всеми действиями',
    status: 'active',
    now,
  });
  const actions = ['Без даты', 'С датой', 'Дополнительное действие'].map((title, index) =>
    LifeAction.createDraft({
      id: EntityId.create(`visibility-action-${index}`),
      title: LifeActionTitle.create(title),
      goalId: goal.id,
      plannedDate: index === 1 ? DayDate.create('2026-10-01') : null,
      createdAt: now,
      eventId: EntityId.create(`visibility-created-${index}`),
    }),
  );
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['goals', 'lifeActions'], 'readwrite');
        tx.objectStore('goals').put(records.goal);
        records.actions.forEach((record) => tx.objectStore('lifeActions').put(record));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      goal: GoalRecordMapper.toRecord(goal),
      actions: actions.map(LifeActionRecordMapper.toRecord),
    },
  );
  await page.reload();
  await expect(page.getByRole('link', { name: goal.title, exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('goals-before-link-check.png'),
    fullPage: true,
  });
  await testInfo.attach('goal-styles', {
    body: JSON.stringify(
      await page.locator('.planner-goal-card-main').evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          color: styles.color,
          font: styles.fontFamily,
          accent: styles.getPropertyValue('--gold-main'),
          stylesheets: [...document.styleSheets].map(
            (sheet) => sheet.href ?? sheet.ownerNode?.textContent?.slice(0, 100),
          ),
        };
      }),
    ),
    contentType: 'application/json',
  });
  const link = page.getByRole('link', { name: 'Действия · 3', exact: true });
  await expect(link).toBeVisible();
  await link.focus();
  await expect(link).toBeFocused();
  const box = await link.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: goal.title, exact: true })).toBeVisible();
  for (const title of ['Без даты', 'С датой', 'Дополнительное действие']) {
    await expect(
      page.locator('.planner-goal-actions').getByRole('link', { name: title, exact: true }),
    ).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('goal-full-actions.png'), fullPage: true });
  expect(errors).toEqual([]);
});
