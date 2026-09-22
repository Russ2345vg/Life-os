import { expect, test, type Page } from '@playwright/test';
import {
  ActionExpectedResult,
  DayDate,
  Direction,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
  Sphere,
} from '../../src/domain';
import { addDays } from '../../src/domain/planner/PlanningPeriod';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { SphereRecordMapper } from '../../src/infrastructure/persistence/mappers/SphereRecordMapper';

async function seed(page: Page) {
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const now = new Date(`${today}T10:00:00`);
  const sphere = Sphere.create({ id: EntityId.create('daily-sphere'), name: 'Здоровье QA', now });
  const directions = ['Тело', 'Сон'].map((name, index) =>
    Direction.create({
      id: EntityId.create(`daily-direction-${index}`),
      name,
      sphereId: sphere.id,
      now,
    }),
  );
  const goal = Goal.create({
    id: EntityId.create('daily-goal'),
    title: 'Достигнутая цель',
    status: 'active',
    now,
  }).update({ title: 'Достигнутая цель', status: 'achieved', stage: 'achieved' }, now);
  const actions = ['Прогулка', 'Подготовленное действие'].map((title, index) =>
    LifeAction.createDraft({
      id: EntityId.create(`daily-action-${index}`),
      title: LifeActionTitle.create(title),
      description: 'Подробности действия',
      plannedDate: DayDate.create(today),
      createdAt: now,
      eventId: EntityId.create(`created-${index}`),
    }),
  );
  actions[1]!.makeReady({
    expectedResult: ActionExpectedResult.create('Готово'),
    plannedDate: DayDate.create(today),
    occurredAt: now,
    eventId: EntityId.create('ready'),
  });
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['lifeActions', 'spheres', 'directions', 'goals'], 'readwrite');
        for (const [store, rows] of Object.entries(records))
          rows.forEach((record) => tx.objectStore(store).put(record));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      lifeActions: actions.map(LifeActionRecordMapper.toRecord),
      spheres: [SphereRecordMapper.toRecord(sphere)],
      directions: directions.map(DirectionRecordMapper.toRecord),
      goals: [GoalRecordMapper.toRecord(goal)],
    },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Прогулка', exact: true })).toBeVisible();
  return { today, tomorrow: addDays(today, 1) };
}

test('Today opens the action body; completion stays completed until explicit reopen', async ({
  page,
}) => {
  await seed(page);
  const row = page
    .locator('.planner-entity-context')
    .filter({ has: page.getByRole('button', { name: 'Прогулка', exact: true }) });
  await row.getByText('Подробности действия').click();
  await expect(page).toHaveURL(/#\/v2\/actions\/daily-action-0$/);
  await page.goto('/#/v2/today');
  await page.getByRole('checkbox', { name: 'Выполнить: Прогулка', exact: true }).click();
  await expect(page).toHaveURL(/#\/v2\/today$/);
  await page.locator('.planner-completed > summary').click();
  const completed = page.getByRole('checkbox', { name: 'Выполнить: Прогулка', exact: true });
  await expect(completed).toBeChecked();
  await expect(completed).toBeDisabled();
  await completed.dispatchEvent('click');
  await expect(completed).toBeChecked();
  await page.getByRole('button', { name: 'Действия: Прогулка', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Вернуть в работу', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Выполнить: Прогулка', exact: true }),
  ).not.toBeChecked();
});

test('Tomorrow moves an existing ready action, creates with an optional date and keeps daily directions', async ({
  page,
}) => {
  const { today, tomorrow } = await seed(page);
  await page.getByLabel('Главное направление', { exact: true }).selectOption('daily-direction-0');
  await expect(page.getByRole('status')).toContainText('Главное направление сохранено');
  await page.getByRole('button', { name: 'Завтра', exact: true }).click();
  await page.getByLabel('Главное направление', { exact: true }).selectOption('daily-direction-1');
  await expect(page.getByRole('status')).toContainText('Главное направление сохранено');
  await page.getByRole('button', { name: '+ Выбрать существующее действие', exact: true }).click();
  const candidate = page
    .locator('.planner-tomorrow-candidates li')
    .filter({ hasText: 'Подготовленное действие' });
  await expect(candidate).toBeVisible();
  await candidate.getByRole('button', { name: 'На завтра', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Подготовленное действие', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Подготовленное действие', exact: true }).click();
  await expect(page).toHaveURL(/#\/v2\/actions\/daily-action-1$/);
  await expect(page.getByLabel('Плановая дата: Подготовленное действие')).toHaveValue(tomorrow);
  await page.goto('/#/v2/today?day=tomorrow');
  await page.getByRole('button', { name: 'Открыть форму нового действия' }).click();
  await expect(page.locator('input[name="date"]')).toHaveValue(tomorrow);
  await page.getByLabel('Название', { exact: true }).fill('Действие завтра');
  await page.getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Завтра', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Действие завтра', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть форму нового действия' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Без даты');
  await page.getByRole('dialog').getByRole('button', { name: 'Без даты', exact: true }).click();
  await page.getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Завтра', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Главное направление', { exact: true })).toHaveValue(
    'daily-direction-1',
  );
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(page.getByLabel('Главное направление', { exact: true })).toHaveValue(
    'daily-direction-0',
  );
  await expect(
    page.getByRole('button', { name: 'Подготовленное действие', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Главное направление', { exact: true }).selectOption('');
  await expect(page.getByLabel('Главное направление', { exact: true })).toHaveValue('');
  await expect(page.locator('.planner-eyebrow').last()).toContainText(
    String(Number(today.slice(-2))),
  );
});

test('entity menus support hold, cancel scroll gestures, keyboard and confirmed deletion at mobile widths', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 740 });
    const row = page
      .locator('.planner-entity-context')
      .filter({ has: page.getByRole('button', { name: 'Прогулка', exact: true }) });
    await row.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      isPrimary: true,
      clientX: 50,
      clientY: 200,
    });
    await row.dispatchEvent('pointermove', {
      pointerType: 'touch',
      isPrimary: true,
      clientX: 50,
      clientY: 230,
    });
    await page.waitForTimeout(560);
    await row.dispatchEvent('pointerup', { pointerType: 'touch' });
    await expect(page.getByRole('menu')).toHaveCount(0);
    await row.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      isPrimary: true,
      clientX: 50,
      clientY: 200,
    });
    await expect(page.getByRole('menu')).toBeVisible();
    await row.dispatchEvent('pointerup', { pointerType: 'touch' });
    await row.getByRole('button', { name: 'Прогулка', exact: true }).dispatchEvent('click');
    await expect(page).toHaveURL(/#\/v2\/today$/);
    const bounds = await page.getByRole('menu').boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Действия: Прогулка', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Удалить «Прогулка»?');
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(row).toBeVisible();
  }
  await page.getByRole('button', { name: 'Действия: Прогулка', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Прогулка', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an achieved Goal stays openable and exposes supported management commands', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/#/v2/goals/daily-goal');
  await expect(page.getByRole('heading', { name: 'Достигнутая цель', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Действия: Достигнутая цель', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Вернуть в активные', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Удалить', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Архивировать', exact: true }).click();
  await expect(page.locator('.planner-goal-context')).toContainText('В архиве');
});

test('Sphere deletion explains its linked Direction in the confirmation; Direction menus reuse edit and pause flows', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/#/v2/spheres/daily-sphere');
  await page.getByRole('button', { name: 'Действия: Здоровье QA', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('Тело');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Здоровье QA', exact: true })).toBeVisible();
  await page.goto('/#/v2/directions/daily-direction-0');
  await page.getByRole('button', { name: 'Действия: Тело', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Приостановить', exact: true }).click();
  await page.getByRole('button', { name: 'Действия: Тело', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Возобновить', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Возобновить', exact: true }).click();
  await page.getByRole('button', { name: 'Действия: Тело', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Редактировать', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Редактирование', exact: true })).toBeVisible();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Тело');
});
