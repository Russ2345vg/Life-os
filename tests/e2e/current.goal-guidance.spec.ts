import { expect, test } from '@playwright/test';
import { openDisclosure } from './helpers/disclosures';
import { DayDate, EntityId, Goal, LifeAction, LifeActionTitle } from '../../src/domain';
import { addDays, automaticPeriod, membershipId } from '../../src/domain/planner/PlanningPeriod';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

test('chooses the explicit goal step, adds it today, preserves the daily main and supports undo', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const now = new Date();
  const goal = Goal.create({
    id: EntityId.create('guidance-goal'),
    title: 'Подготовить портфолио',
    status: 'active',
    whyImportant: 'Найти новую работу',
    now,
  });
  const step = LifeAction.createDraft({
    id: EntityId.create('guidance-step'),
    title: LifeActionTitle.create('Описать проект'),
    goalId: goal.id,
    createdAt: now,
    eventId: EntityId.create('guidance-step-created'),
  });
  const selected = goal.selectNextAction(step.id, now);
  const main = LifeAction.createDraft({
    id: EntityId.create('guidance-main'),
    title: LifeActionTitle.create('Главное дело дня'),
    plannedDate: DayDate.create(today),
    isNext: true,
    createdAt: now,
    eventId: EntityId.create('guidance-main-created'),
  });
  const period = { ...automaticPeriod('week', today), primaryGoalId: goal.id.toString() };
  const membership = {
    id: membershipId(period.id, 'goal', goal.id.toString()),
    periodId: period.id,
    entityType: 'goal' as const,
    entityId: goal.id.toString(),
    focused: true,
    removed: false,
    schemaVersion: 1 as const,
    version: 1,
    updatedAt: now.toISOString(),
  };
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          ['goals', 'lifeActions', 'planningPeriods', 'periodMemberships'],
          'readwrite',
        );
        tx.objectStore('goals').put(records.goal);
        records.actions.forEach((record) => tx.objectStore('lifeActions').put(record));
        tx.objectStore('planningPeriods').put(records.period);
        tx.objectStore('periodMemberships').put(records.membership);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      goal: GoalRecordMapper.toRecord(selected),
      actions: [step, main].map(LifeActionRecordMapper.toRecord),
      period,
      membership,
    },
  );
  await page.reload();
  await openDisclosure(page, '.planner-today-context');
  await page.getByRole('button', { name: 'Выбрать шаг к цели' }).click();
  const dialog = page.getByRole('dialog', { name: 'Шаг к цели' });
  await expect(dialog).toContainText('Главная цель этой недели');
  await expect(dialog).toContainText('Вы выбрали это действие следующим шагом цели');
  await expect(dialog.getByRole('combobox', { name: 'Цель' })).toHaveValue('guidance-goal');
  await expect(dialog.getByRole('combobox', { name: 'Действие' })).toHaveValue('guidance-step');
  await dialog.getByRole('button', { name: 'Добавить на сегодня' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Отменить изменение даты' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Главное сегодня', exact: true })).toContainText(
    'Главное дело дня',
  );
  await expect(page.locator('[data-planner-action-id="guidance-step"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('goal-guidance-added.png'), fullPage: true });
  if (testInfo.project.name === 'desktop-chrome') {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: testInfo.outputPath('goal-guidance-added-1280.png') });
  }
  await page.getByRole('button', { name: 'Отменить изменение даты' }).click();
  await expect(page.getByRole('button', { name: 'Отменить изменение даты' })).toHaveCount(0);
  const remaining = page.getByRole('region', { name: 'Остальные действия', exact: true });
  await expect(remaining).toContainText('План пуст');
  await expect(remaining.getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: 'Выбрать шаг к цели' }).click();
  await expect(dialog).toContainText('Без даты');
  await expect(dialog.getByRole('combobox', { name: 'Действие' })).toHaveValue('guidance-step');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    const fixture = window as Window & { guidanceOriginalTransaction?: typeof original };
    fixture.guidanceOriginalTransaction = original;
    let committed = false;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const names = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
      if (committed && args[1] === 'readonly' && names.includes('lifeActions'))
        throw new Error('Проверка ошибки чтения после записи');
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite' && names.includes('lifeActions'))
        tx.addEventListener(
          'complete',
          () => {
            committed = true;
          },
          { once: true },
        );
      return tx;
    };
  });
  await dialog.getByRole('button', { name: 'Добавить на сегодня' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Дата сохранена. Не удалось обновить план');
  await expect(page.getByRole('button', { name: 'Отменить изменение даты' })).toBeVisible();
  await page.evaluate(() => {
    const fixture = window as Window & {
      guidanceOriginalTransaction?: typeof IDBDatabase.prototype.transaction;
    };
    if (fixture.guidanceOriginalTransaction)
      IDBDatabase.prototype.transaction = fixture.guidanceOriginalTransaction;
    delete fixture.guidanceOriginalTransaction;
  });
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-planner-action-id="guidance-step"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Главное сегодня', exact: true })).toContainText(
    'Главное дело дня',
  );
  expect(errors).toEqual([]);
});

test('requires a goal choice without a weekly primary and explains moving a dated step', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const nextDate = addDays(today, 1);
  const now = new Date();
  const goal = Goal.create({
    id: EntityId.create('guidance-choice-goal'),
    title: 'Очень длинная цель: подготовить содержательное портфолио для следующего этапа карьеры',
    status: 'active',
    now,
  });
  const step = LifeAction.createDraft({
    id: EntityId.create('guidance-choice-step'),
    title: LifeActionTitle.create('Написать подробное описание первого проекта'),
    goalId: goal.id,
    plannedDate: DayDate.create(nextDate),
    isNext: true,
    createdAt: now,
    eventId: EntityId.create('guidance-choice-created'),
  });
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
        tx.objectStore('lifeActions').put(records.action);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      goal: GoalRecordMapper.toRecord(goal.selectNextAction(step.id, now)),
      action: LifeActionRecordMapper.toRecord(step),
    },
  );
  await page.reload();
  await openDisclosure(page, '.planner-today-context');
  await page.getByRole('button', { name: 'Выбрать шаг к цели' }).click();
  const dialog = page.getByRole('dialog', { name: 'Шаг к цели' });
  await expect(dialog).toContainText('Главная цель недели не выбрана');
  await expect(dialog.getByRole('button', { name: 'Перенести на сегодня' })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Цель' }).selectOption('guidance-choice-goal');
  await expect(dialog.getByRole('combobox', { name: 'Действие' })).toHaveValue(
    'guidance-choice-step',
  );
  await expect(dialog).toContainText(`Сейчас запланировано: ${nextDate}`);
  await expect(dialog).toContainText('перестанет быть главным делом');
  if (testInfo.project.name === 'mobile-chrome') {
    await page.setViewportSize({ width: 320, height: 720 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({
    path: testInfo.outputPath('goal-guidance-transfer.png'),
    fullPage: true,
  });
  await dialog.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: testInfo.outputPath('goal-guidance-transfer-bottom.png') });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      const store = tx.objectStore('lifeActions');
      const request = store.get('guidance-choice-step');
      request.onsuccess = () =>
        store.put({ ...request.result, version: request.result.version + 1 });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await dialog.getByRole('button', { name: 'Перенести на сегодня' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Действие изменилось');
  await expect(page.getByRole('button', { name: 'Отменить изменение даты' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Выбор проверен' }).click();
  await dialog.getByRole('button', { name: 'Перенести на сегодня' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-planner-action-id="guidance-choice-step"]')).toBeVisible();
  await page.getByRole('button', { name: 'Отменить изменение даты' }).click();
  await expect(page.locator('[data-planner-action-id="guidance-choice-step"]')).toHaveCount(0);
  await page
    .getByRole('group', { name: 'План на день' })
    .getByRole('button', { name: 'Завтра' })
    .click();
  await openDisclosure(page, '.planner-today-context');
  await expect(page.getByRole('button', { name: 'Выбрать шаг к цели' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('empty guidance keeps keyboard focus, Escape return and the existing create-goal flow', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/today');
  await openDisclosure(page, '.planner-today-context');
  const trigger = page.getByRole('button', { name: 'Выбрать шаг к цели' });
  await expect(trigger).toBeVisible();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    const fixture = window as Window & { guidanceInitialRead?: typeof original };
    fixture.guidanceInitialRead = original;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const names = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
      if (args[1] === 'readwrite' && names.includes('planningPeriods'))
        throw new Error('Проверка ошибки начальной загрузки');
      return original.apply(this, args);
    };
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Шаг к цели' });
  await expect(dialog.getByRole('alert')).toContainText('Проверка ошибки начальной загрузки');
  await expect(dialog.getByRole('button', { name: 'Добавить на сегодня' })).toHaveCount(0);
  await page.evaluate(() => {
    const fixture = window as Window & {
      guidanceInitialRead?: typeof IDBDatabase.prototype.transaction;
    };
    if (fixture.guidanceInitialRead)
      IDBDatabase.prototype.transaction = fixture.guidanceInitialRead;
    delete fixture.guidanceInitialRead;
  });
  await dialog.getByRole('button', { name: 'Повторить загрузку' }).click();
  const create = dialog.getByRole('button', { name: 'Создать цель' });
  await expect(create).toBeVisible();
  await expect(create).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await dialog.getByRole('button', { name: 'Создать цель' }).click();
  await expect(page.getByRole('dialog', { name: 'Новая цель' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('late completion of a closed save cannot close a newly opened guidance sheet', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const now = new Date();
  const goal = Goal.create({
    id: EntityId.create('late-goal'),
    title: 'Новая привычка',
    status: 'active',
    now,
  });
  const step = LifeAction.createDraft({
    id: EntityId.create('late-step'),
    title: LifeActionTitle.create('Сделать один шаг'),
    goalId: goal.id,
    createdAt: now,
    eventId: EntityId.create('late-created'),
  });
  const selected = goal.selectNextAction(step.id, now);
  const period = { ...automaticPeriod('week', today), primaryGoalId: goal.id.toString() };
  const membership = {
    id: membershipId(period.id, 'goal', goal.id.toString()),
    periodId: period.id,
    entityType: 'goal' as const,
    entityId: goal.id.toString(),
    focused: true,
    removed: false,
    schemaVersion: 1 as const,
    version: 1,
    updatedAt: now.toISOString(),
  };
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          ['goals', 'lifeActions', 'planningPeriods', 'periodMemberships'],
          'readwrite',
        );
        tx.objectStore('goals').put(records.goal);
        tx.objectStore('lifeActions').put(records.action);
        tx.objectStore('planningPeriods').put(records.period);
        tx.objectStore('periodMemberships').put(records.membership);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      goal: GoalRecordMapper.toRecord(selected),
      action: LifeActionRecordMapper.toRecord(step),
      period,
      membership,
    },
  );
  await page.reload();
  await openDisclosure(page, '.planner-today-context');
  const trigger = page.getByRole('button', { name: 'Выбрать шаг к цели' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Шаг к цели' });
  await expect(dialog.getByRole('button', { name: 'Добавить на сегодня' })).toBeEnabled();
  await page.evaluate(() => {
    const original = IDBTransaction.prototype.addEventListener;
    const fixture = window as Window & {
      guidanceOriginalListener?: typeof original;
      guidanceDelayedCompleteDelivered?: boolean;
    };
    fixture.guidanceOriginalListener = original;
    IDBTransaction.prototype.addEventListener = function (type, callback, options) {
      if (
        type === 'complete' &&
        this.mode === 'readwrite' &&
        this.objectStoreNames.contains('lifeActions') &&
        callback
      ) {
        const delayed: EventListener = (event) => {
          window.setTimeout(() => {
            if (typeof callback === 'function') callback.call(this, event);
            else callback.handleEvent(event);
            fixture.guidanceDelayedCompleteDelivered = true;
          }, 700);
        };
        return original.call(this, type, delayed, options);
      }
      return original.call(this, type, callback, options);
    };
  });
  await dialog.getByRole('button', { name: 'Добавить на сегодня' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as Window & { guidanceDelayedCompleteDelivered?: boolean })
            .guidanceDelayedCompleteDelivered,
        ),
      ),
    )
    .toBe(true);
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    const fixture = window as Window & {
      guidanceOriginalListener?: typeof IDBTransaction.prototype.addEventListener;
    };
    if (fixture.guidanceOriginalListener)
      IDBTransaction.prototype.addEventListener = fixture.guidanceOriginalListener;
    delete fixture.guidanceOriginalListener;
  });
  expect(errors).toEqual([]);
});
