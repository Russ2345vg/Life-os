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
  await page.goto('/#/v2/goals');
  await expect(page.getByRole('heading', { name: 'Цели', exact: true })).toBeVisible();
  const id = (value: string) => EntityId.create(value);
  const now = new Date('2026-10-01T08:00:00Z');
  const direction = Direction.create({ id: id('success-direction'), name: 'Учиться новому', now });
  const goal = Goal.create({
    id: id('success-goal'),
    title: 'Прочитать книгу и применить идеи',
    directionId: direction.id,
    status: 'active',
    now,
  });
  const empty = Goal.create({ id: id('success-empty'), title: 'Новая цель', now });
  const foreign = Goal.create({ id: id('success-foreign-goal'), title: 'Другая цель', now });
  const create = (
    key: string,
    title: string,
    goalId: EntityId | null,
    directionId: EntityId | null,
    day: number | null,
    note: string | null,
  ) => {
    const action = LifeAction.createDraft({
      id: id(key),
      title: LifeActionTitle.create(title),
      goalId,
      directionId,
      createdAt: now,
      eventId: id(key + '-created'),
    });
    if (day !== null)
      action.complete(
        note === null ? null : ActionActualResult.create(note),
        new Date(`2026-10-0${day}T12:00:00Z`),
        id(key + '-completed'),
      );
    return action;
  };
  const actions = [
    create(
      'success-result',
      'Применить одну идею из книги с длинным названием для проверки переноса',
      goal.id,
      null,
      3,
      'Стал спокойнее реагировать на сложные разговоры.\nСначала выслушал собеседника.',
    ),
    create('success-no-result', 'Прочитать первую главу', goal.id, null, 4, null),
    create(
      'success-direct',
      'Обсудить идеи с другом',
      null,
      direction.id,
      2,
      'Нашёл новый способ.',
    ),
    create('success-open', 'Продолжить чтение', goal.id, null, null, null),
    create('success-foreign', 'Действие другой цели', foreign.id, null, 5, 'Чужой итог.'),
  ];
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['goals', 'directions', 'lifeActions'], 'readwrite');
        records.goals.forEach((record) => tx.objectStore('goals').put(record));
        tx.objectStore('directions').put(records.direction);
        records.actions.forEach((record) => tx.objectStore('lifeActions').put(record));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      goals: [goal, empty, foreign].map(GoalRecordMapper.toRecord),
      direction: DirectionRecordMapper.toRecord(direction),
      actions: actions.map(LifeActionRecordMapper.toRecord),
    },
  );
  await page.reload();
}

function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('goal and direction histories include successes without a result and preserve context', async ({
  page,
}, info) => {
  const errors = observe(page);
  await seed(page);
  const history = page.getByRole('region', { name: 'История успехов', exact: true });
  for (const [route, count] of [
    ['goals/success-goal', 2],
    ['directions/success-direction', 3],
  ] as const) {
    await page.goto(`/#/v2/${route}`);
    await expect(history.locator('li')).toHaveCount(count);
    await expect(history.locator('li').first()).toContainText('Прочитать первую главу');
    await expect(history).toContainText('Стал спокойнее');
    await expect(history).not.toContainText('Продолжить чтение');
    await expect(history).not.toContainText('Чужой итог');
    const firstLink = history.getByRole('link', { name: 'Прочитать первую главу', exact: true });
    await firstLink.focus();
    await expect(firstLink).toBeFocused();
    expect((await firstLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: info.outputPath(
        route.startsWith('goals') ? 'goal-history.png' : 'direction-history.png',
      ),
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (route.startsWith('directions')) {
      const goalLinks = history.getByRole('link', {
        name: 'Прочитать книгу и применить идеи',
        exact: true,
      });
      await expect(goalLinks).toHaveCount(2);
      await goalLinks.first().focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/goals\/success-goal$/);
    }
  }
  await page.goto('/#/v2/goals/success-empty');
  await expect(history.locator('li')).toHaveCount(0);
  await expect(history).toContainText('Здесь появятся завершённые действия.');
  expect(errors).toEqual([]);
});

test('editing, completing without a result and reopening update both histories after reload', async ({
  page,
}) => {
  const errors = observe(page);
  await seed(page);
  await page.goto('/#/v2/actions/success-result');
  const result = page.locator('.planner-completion-result');
  await result.locator('summary').click();
  await result.getByLabel('Итог задачи', { exact: true }).fill('Уточнённый результат успеха.');
  await result.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(result.getByRole('status').filter({ hasText: 'Итог сохранён' })).toBeVisible();
  await page.goto('/#/v2/actions/success-open');
  await page.getByRole('checkbox', { name: 'Выполнить: Продолжить чтение', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Итог задачи', exact: true })
    .getByRole('button', { name: 'Пропустить', exact: true })
    .click();
  const history = page.getByRole('region', { name: 'История успехов', exact: true });
  for (const [route, count] of [
    ['goals/success-goal', 3],
    ['directions/success-direction', 4],
  ] as const) {
    await page.goto(`/#/v2/${route}`);
    await page.reload();
    await expect(history.locator('li')).toHaveCount(count);
    await expect(history.locator('li').first()).toContainText('Продолжить чтение');
    await expect(history).toContainText('Уточнённый результат успеха.');
  }
  await page.goto('/#/v2/goals/success-goal');
  const completed = page.locator('.planner-goal-completed');
  await completed.locator(':scope > summary').click();
  await completed
    .locator('li')
    .filter({ hasText: 'Продолжить чтение' })
    .getByRole('button', { name: 'Вернуть в работу', exact: true })
    .click();
  await expect(history.locator('li')).toHaveCount(2);
  await page.goto('/#/v2/directions/success-direction');
  await page.reload();
  await expect(history.locator('li')).toHaveCount(3);
  await expect(history).not.toContainText('Продолжить чтение');
  expect(errors).toEqual([]);
});
