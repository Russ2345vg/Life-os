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
import { validateRule } from '../../src/domain/planner/RecurrenceRule';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { RecurrenceRuleRecordMapper } from '../../src/infrastructure/persistence/PlanningRecordMappers';
import { SphereRecordMapper } from '../../src/infrastructure/persistence/mappers/SphereRecordMapper';

async function seed(page: Page) {
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const clock = await page.evaluate(() => {
    const now = new Date();
    return {
      today: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      now: now.toISOString(),
    };
  });
  const { today } = clock;
  const now = new Date(clock.now);
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
  return { today, tomorrow: addDays(today, 1), now: clock.now };
}

async function seedRecurringSeries(page: Page) {
  const { today, now: nowIso } = await seed(page);
  const now = new Date(nowIso);
  const rule = validateRule({
    id: 'recurrence:e2e-series',
    title: 'Повторяемая задача QA',
    goalId: null,
    priority: null,
    startDate: today,
    endDate: null,
    maxCompletions: null,
    paused: false,
    pauseUntil: null,
    schedule: { kind: 'daily' },
    revision: 1,
    effectiveFrom: today,
    version: 1,
    schemaVersion: 1,
    updatedAt: now.toISOString(),
  });
  const occurrences = [today, addDays(today, 1), addDays(today, 2)].map((date, index) => {
    const value = LifeAction.createDraft({
      id: EntityId.create(`e2e-series-${index}`),
      title: LifeActionTitle.create(rule.title),
      plannedDate: DayDate.create(date),
      createdAt: now,
      eventId: EntityId.create(`e2e-series-created-${index}`),
    });
    value.setPlanningMetadata({
      occurrence: {
        ruleId: rule.id,
        slot: date,
        ruleRevision: rule.revision,
        originalDate: date,
      },
    });
    return value;
  });
  await page.evaluate(
    async ({ actionRecords, ruleRecord }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['lifeActions', 'recurrenceRules'], 'readwrite');
        actionRecords.forEach((record) => tx.objectStore('lifeActions').put(record));
        tx.objectStore('recurrenceRules').put(ruleRecord);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      actionRecords: occurrences.map(LifeActionRecordMapper.toRecord),
      ruleRecord: RecurrenceRuleRecordMapper.toRecord(rule),
    },
  );
  await page.goto('/#/v2/actions');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  return { today, ruleId: rule.id, title: rule.title };
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

test('Actions shows one recurring series and can remove one occurrence or the whole series', async ({
  page,
}) => {
  const { today, ruleId, title } = await seedRecurringSeries(page);
  const titleLink = page.getByRole('link', { name: title, exact: true });
  await expect(titleLink).toHaveCount(1);

  await page.getByRole('button', { name: `Действия: ${title}`, exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Удалить это повторение', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Удалить всю серию', exact: true }),
  ).toBeVisible();
  await page.getByRole('menuitem', { name: 'Удалить это повторение', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Остальная серия продолжится');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Удалить повторение', exact: true })
    .click();
  await expect(titleLink).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        async ({ date, id }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('lifeos');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
            const request = db.transaction('lifeActions').objectStore('lifeActions').getAll();
            request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
            request.onerror = () => reject(request.error);
          });
          db.close();
          return rows.some(
            (row) =>
              row.status === 'cancelled' &&
              (row.occurrence as { ruleId?: string; originalDate?: string } | undefined)?.ruleId ===
                id &&
              (row.occurrence as { originalDate?: string } | undefined)?.originalDate === date,
          );
        },
        { date: today, id: ruleId },
      ),
    )
    .toBe(true);

  await page.getByRole('button', { name: `Действия: ${title}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Удалить всю серию', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Выполненная история сохранится');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Удалить всю серию', exact: true })
    .click();
  await expect(titleLink).toHaveCount(0);
  await page.reload();
  await expect(titleLink).toHaveCount(0);
  expect(
    await page.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['lifeActions', 'recurrenceRules']);
      const rule = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const request = tx.objectStore('recurrenceRules').get(id);
        request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
        request.onerror = () => reject(request.error);
      });
      const actions = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = tx.objectStore('lifeActions').getAll();
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return {
        removed: typeof rule?.removedAt === 'string',
        open: actions.filter(
          (row) =>
            (row.occurrence as { ruleId?: string } | undefined)?.ruleId === id &&
            !['completed', 'cancelled'].includes(String(row.status)),
        ).length,
      };
    }, ruleId),
  ).toEqual({ removed: true, open: 0 });
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
  await page.getByLabel('Новое действие на завтра').fill('Быстрое действие завтра');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByText('Действие добавлено на завтра', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Быстрое действие завтра', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Создать с параметрами', exact: true }).click();
  await expect(page.locator('input[name="date"]')).toHaveValue(tomorrow);
  await page.getByLabel('Название', { exact: true }).fill('Действие завтра');
  await page.getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Завтра', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Действие завтра', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Создать с параметрами', exact: true }).click();
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
