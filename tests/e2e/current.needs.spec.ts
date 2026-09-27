import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { expect, test } from '@playwright/test';
import { DayDate, Direction, EntityId, Goal, LifeAction, LifeActionTitle } from '../../src/domain';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

test('needs inherit dynamically and allow an own goal override without crowding lists', async ({
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
  const direction = Direction.create({
    id: EntityId.create('need-direction'),
    name: 'Здоровье',
    need: 'Энергия и восстановление',
    now,
  });
  const goal = Goal.create({
    directionId: direction.id,
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
        const tx = db.transaction(['directions', 'goals', 'lifeActions'], 'readwrite');
        tx.objectStore('directions').put(records.direction);
        tx.objectStore('goals').put(records.goal);
        records.actions.forEach((record) => tx.objectStore('lifeActions').put(record));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      direction: DirectionRecordMapper.toRecord(direction),
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
  const details = page.locator('.planner-goal-details');
  await details.locator('summary').click();
  await page.screenshot({ path: testInfo.outputPath('needs-baseline.png'), fullPage: true });
  await expect(details).toContainText('Энергия и восстановление');
  await expect(details).toContainText('Из направления');
  await details.getByRole('link', { name: 'Изменить свойства цели' }).click();
  await page.getByText('Дополнительно', { exact: true }).click();
  await page.getByLabel('Потребность', { exact: true }).fill('Самостоятельность');
  await page.getByRole('button', { name: 'Сохранить цель', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Редактировать цель' })).not.toBeVisible();
  await page.reload();
  await page.locator('.planner-goal-details summary').click();
  await expect(page.locator('.planner-goal-details')).toContainText('Самостоятельность');
  await page.screenshot({ path: testInfo.outputPath('needs-own-goal.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/#/v2/actions/visibility-action-0');
  await expect(page.getByRole('heading', { name: 'Без даты', exact: true })).toBeVisible();
  await expect(page.locator('.planner-row-details')).toContainText('Самостоятельность');
  await expect(page.locator('.planner-row-details')).toContainText('Из цели');
  await page.locator('.planner-action-edit summary').click();
  const editor = page.locator('.planner-action-edit');
  await editor.getByLabel('Потребность', { exact: true }).fill('Отдых');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.planner-row-details .planner-entity-need')).toHaveText(
    'Потребность: Отдых',
  );
  await page.getByText('Повторение и вклад в цели', { exact: true }).click();
  await page.getByText('Сделать повторяющимся', { exact: true }).click();
  await expect(page.getByLabel('Потребность повторений', { exact: true })).toHaveValue('Отдых');
  await page.getByRole('button', { name: 'Сохранить расписание', exact: true }).click();
  await expect(page.getByText('Изменить будущие повторения', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.planner-row-details .planner-entity-need')).toHaveText(
    'Потребность: Отдых',
  );
  await page.getByText('Повторение и вклад в цели', { exact: true }).click();
  await page.getByText('Изменить будущие повторения', { exact: true }).click();
  await expect(page.getByLabel('Потребность повторений', { exact: true })).toHaveValue('Отдых');
  await page.screenshot({
    path: testInfo.outputPath('needs-action-and-series.png'),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/#/v2/goals/visibility-goal?edit=1');
  await page.getByText('Дополнительно', { exact: true }).click();
  await expect(page.getByLabel('Потребность', { exact: true })).toHaveValue('Самостоятельность');
  await page.getByLabel('Потребность', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Сохранить цель', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Редактировать цель' })).not.toBeVisible();
  await page.locator('.planner-goal-details summary').click();
  await expect(page.locator('.planner-goal-details')).toContainText('Энергия и восстановление');
  await page.goto('/#/v2/directions/need-direction');
  await expect(page.getByRole('heading', { name: 'Здоровье', exact: true })).toBeVisible();
  await page.getByText('Потребность', { exact: true }).click();
  await expect(page.locator('.planner-entity-need')).toHaveText(
    'Потребность: Энергия и восстановление',
  );
  await page.getByRole('button', { name: 'Описать', exact: true }).first().click();
  await page.getByLabel('Потребность', { exact: true }).fill('Спокойствие');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByLabel('Потребность', { exact: true })).not.toBeVisible();
  await page.goto('/#/v2/goals/visibility-goal');
  await page.locator('.planner-goal-details summary').click();
  await expect(page.locator('.planner-goal-details')).toContainText('Спокойствие');
  await page.reload();
  await page.locator('.planner-goal-details summary').click();
  await expect(page.locator('.planner-goal-details')).toContainText('Спокойствие');
  expect(errors).toEqual([]);
});
