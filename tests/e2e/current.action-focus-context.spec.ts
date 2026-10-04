import { expect, test, type Page } from '@playwright/test';
import {
  ActionActualResult,
  Direction,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
} from '../../src/domain';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seed(page: Page) {
  await page.goto('/#/v2/actions', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const now = new Date();
  const direction = Direction.create({
    id: EntityId.create('result-direction'),
    name: 'Дом без цели',
    now,
  });
  const goal = Goal.create({
    id: EntityId.create('result-goal'),
    title: 'Чистый дом',
    directionId: direction.id,
    status: 'active',
    now,
  });
  const focusAction = LifeAction.createDraft({
    id: EntityId.create('focus-action'),
    title: LifeActionTitle.create('Помодоро E2E'),
    createdAt: now,
    eventId: EntityId.create('focus-created'),
  });
  const directResult = LifeAction.createDraft({
    id: EntityId.create('direct-result'),
    title: LifeActionTitle.create('Убрать шерсть'),
    directionId: direction.id,
    createdAt: now,
    eventId: EntityId.create('direct-created'),
  });
  directResult.complete(
    ActionActualResult.create('Шерсть убрана с дивана.'),
    now,
    EntityId.create('direct-complete'),
  );
  const goalResult = LifeAction.createDraft({
    id: EntityId.create('goal-result'),
    title: LifeActionTitle.create('Пропылесосить'),
    goalId: goal.id,
    createdAt: now,
    eventId: EntityId.create('goal-created'),
  });
  goalResult.complete(
    ActionActualResult.create('Пол чистый и готов к гостям.'),
    now,
    EntityId.create('goal-complete'),
  );
  await page.evaluate(
    async (records) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['directions', 'goals', 'lifeActions'],
          'readwrite',
        );
        transaction.objectStore('directions').put(records.direction);
        transaction.objectStore('goals').put(records.goal);
        records.actions.forEach((record) => transaction.objectStore('lifeActions').put(record));
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    {
      direction: DirectionRecordMapper.toRecord(direction),
      goal: GoalRecordMapper.toRecord(goal),
      actions: [focusAction, directResult, goalResult].map(LifeActionRecordMapper.toRecord),
    },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

test('action context opens a persistent Pomodoro tied to work time', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  await page.getByRole('link', { name: 'Помодоро E2E' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Начать фокус' }).click();
  await expect(page.getByRole('timer', { name: 'Осталось времени' })).toHaveText('25:00');
  await page.getByRole('button', { name: 'Начать фокус' }).click();
  await expect(page.getByRole('button', { name: 'Пауза' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(page.getByRole('button', { name: /Фокус · .*Помодоро E2E/ })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Фокус · .*Помодоро E2E/ }).click();
  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect(page.getByRole('button', { name: 'Продолжить фокус' })).toBeVisible();
  await page.getByRole('button', { name: 'Закончить работу' }).click();
  await expect(page.getByRole('button', { name: /Фокус · .*Помодоро E2E/ })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Помодоро E2E' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('direction-only actions and completed notes appear in their contexts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  await page.goto('/#/v2/goals', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Пол чистый и готов к гостям.')).toBeVisible();
  await page.getByRole('link', { name: 'Чистый дом', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Итоги действий' })).toContainText(
    'Пол чистый и готов к гостям.',
  );
  await page.goto('/#/v2/directions/result-direction', { waitUntil: 'domcontentloaded' });
  const results = page.getByRole('region', { name: 'Итоги действий' });
  await expect(results).toContainText('Шерсть убрана с дивана.');
  await expect(results).toContainText('Пол чистый и готов к гостям.');
  await page.goto('/#/v2/actions/new', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Название' }).fill('Действие направления E2E');
  await page.getByRole('combobox', { name: /Направление/ }).selectOption('result-direction');
  await page.getByRole('button', { name: 'Создать действие' }).click();
  await page.goto('/#/v2/actions', { waitUntil: 'commit' });
  await expect(page.getByRole('link', { name: 'Действие направления E2E' })).toBeVisible();
  const context = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<
      Array<{ title: string; directionId: string | null; goalId: string | null }>
    >((resolve, reject) => {
      const transaction = database.transaction('lifeActions', 'readonly');
      const request = transaction.objectStore('lifeActions').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return records.find((record) => record.title === 'Действие направления E2E');
  });
  expect(context).toMatchObject({ directionId: 'result-direction', goalId: null });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
