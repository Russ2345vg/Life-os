import { expect, test } from '@playwright/test';
import {
  ActionActualResult,
  DayDate,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
} from '../../src/domain';
import { automaticPeriod, addDays } from '../../src/domain/planner/PlanningPeriod';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { createReadyLifeAction } from '../../src/test/helpers/LifeActionTestFactory';

test('weekly review reads real results and persists an explicit move without replacing the main', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/goals');
  await expect(page.getByRole('heading', { name: 'Цели', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const current = automaticPeriod('week', today);
  const previous = automaticPeriod('week', addDays(current.startDate, -7));
  const id = EntityId.create;
  const now = new Date();
  const goal = Goal.create({
    id: id('weekly-goal'),
    title: 'Прочитать книги',
    status: 'active',
    now,
    measurement: {
      mode: 'count',
      unit: 'книги',
      target: 12,
      start: null,
      direction: 'at_least',
      cycle: null,
    },
  });
  const unmeasured = Goal.create({
    id: id('weekly-other'),
    title: 'Подготовить портфолио',
    status: 'active',
    now,
  });
  const completed = createReadyLifeAction('weekly-done', DayDate.create(previous.startDate));
  completed.setGoal(goal.id);
  completed.markInProgress(new Date(`${previous.startDate}T10:00:00`), id('started'));
  completed.complete(
    ActionActualResult.create('Книга прочитана'),
    new Date(`${previous.startDate}T12:00:00`),
    id('done'),
  );
  const draft = (key: string, title: string, date: string, main = false) =>
    LifeAction.createDraft({
      id: id(key),
      title: LifeActionTitle.create(title),
      plannedDate: DayDate.create(date),
      isNext: main,
      goalId: unmeasured.id,
      createdAt: now,
      eventId: id(`${key}-created`),
    });
  const todo = draft('weekly-todo', 'Описать проект', previous.startDate);
  const main = draft('weekly-main', 'Главное на сегодня', today, true);
  const contribution = (
    key: string,
    amount: number,
    date: string,
    source: 'initial' | 'manual',
  ) => ({
    id: key,
    version: 1,
    schemaVersion: 1,
    updatedAt: now.toISOString(),
    goalId: 'weekly-goal',
    actionId: null,
    completionKey: null,
    linkId: null,
    source,
    amount,
    effectiveDate: date,
    occurredAt: now.toISOString(),
    voided: false,
    reason: 'Подтверждённая запись',
  });
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('lifeos');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['goals', 'lifeActions', 'progressContributions'], 'readwrite');
          records.goals.forEach((r) => tx.objectStore('goals').put(r));
          records.actions.forEach((r) => tx.objectStore('lifeActions').put(r));
          records.contributions.forEach((r) => tx.objectStore('progressContributions').put(r));
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    {
      goals: [goal, unmeasured].map(GoalRecordMapper.toRecord),
      actions: [completed, todo, main].map(LifeActionRecordMapper.toRecord),
      contributions: [
        contribution('initial:weekly-goal', 0, previous.startDate, 'initial'),
        contribution('weekly-record', 1, previous.startDate, 'manual'),
      ],
    },
  );
  await page.reload();
  await page
    .getByRole('combobox', { name: 'Представление', exact: true })
    .selectOption('#/v2/goals?view=review');
  const overview = page.locator('.planner-weekly-review');
  await expect(overview.getByRole('heading', { name: 'Итоги недели' })).toBeVisible();
  await expect(overview.locator('.weekly-stats dd')).toHaveText(['1', '1', '1']);
  await expect(overview).toContainText('Учтённое изменение за неделю: 1 книги');
  await expect(overview).toContainText('Без измерения');
  await page.screenshot({ path: testInfo.outputPath('weekly-initial.png'), fullPage: true });
  const unfinished = page.getByRole('region', { name: 'Что продолжить' });
  await expect(unfinished).toContainText('Описать проект');
  await unfinished.getByRole('button', { name: 'Выбрать дату', exact: true }).click();
  const dateInput = unfinished.getByLabel('Новая дата: Описать проект', { exact: true });
  await expect(dateInput).toBeFocused();
  await dateInput.fill(addDays(today, 1));
  await unfinished.getByRole('button', { name: 'Сохранить дату' }).click();
  await expect(unfinished).toHaveCount(0);
  await expect(overview.getByRole('heading', { name: 'Итоги недели' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Что продолжить' })).toHaveCount(0);
  await overview.getByRole('button', { name: 'Следующая неделя', exact: true }).click();
  await expect(overview).toContainText('Неделя ещё идёт');
  const currentUnfinished = page.getByRole('region', { name: 'Что продолжить' });
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    const fixture = window as Window & { weeklyOriginalTransaction?: typeof original };
    fixture.weeklyOriginalTransaction = original;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const names = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
      if (names.includes('progressContributions')) {
        throw new Error('Проверка ошибки обновления обзора');
      }
      return original.apply(this, args);
    };
  });
  await currentUnfinished
    .getByRole('listitem')
    .filter({ hasText: 'Главное на сегодня' })
    .getByRole('button', { name: 'На сегодня', exact: true })
    .click();
  await expect(currentUnfinished).toContainText('Главное на сегодня');
  await expect(page.getByRole('alert')).toContainText('Показаны последние загруженные данные');
  await expect(overview.getByRole('heading', { name: 'Итоги недели' })).toBeVisible();
  await page.evaluate(() => {
    const fixture = window as Window & {
      weeklyOriginalTransaction?: typeof IDBDatabase.prototype.transaction;
    };
    if (fixture.weeklyOriginalTransaction)
      IDBDatabase.prototype.transaction = fixture.weeklyOriginalTransaction;
    delete fixture.weeklyOriginalTransaction;
  });
  await page.getByRole('button', { name: 'Повторить загрузку обзора', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    overview.getByRole('button', { name: 'Следующая неделя', exact: true }),
  ).toBeDisabled();
  await overview.getByRole('button', { name: 'Предыдущая неделя', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`week=${previous.startDate}`));
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`week=${previous.startDate}`));
  await expect(overview.getByRole('heading', { name: 'Итоги недели' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  const step = overview
    .locator('.weekly-goal')
    .filter({ hasText: 'Подготовить портфолио' })
    .locator('.weekly-step');
  await step.locator('summary').click();
  await expect(step).toContainText('Следующий шаг не выбран');
  await step.getByLabel('Связанное действие', { exact: true }).selectOption('weekly-main');
  await step.getByRole('button', { name: 'Выбрать следующим шагом', exact: true }).click();
  await expect(step).toContainText('Выбран: Главное на сегодня');
  await step.getByRole('button', { name: 'Назначить дату', exact: true }).click();
  await expect(step).toContainText(`Запланировано: ${today}`);
  await page.reload();
  await expect(overview.getByRole('heading', { name: 'Итоги недели' })).toBeVisible();
  await step.locator('summary').click();
  await expect(step).toContainText('Выбран: Главное на сегодня');
  await step.getByLabel('Связанное действие', { exact: true }).selectOption('weekly-todo');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    const fixture = window as Window & { weeklyOriginalTransaction?: typeof original };
    fixture.weeklyOriginalTransaction = original;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const names = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
      if (args[1] === 'readwrite' && names.includes('goals'))
        throw new Error('Не удалось выбрать шаг: проверка сохранения');
      return original.apply(this, args);
    };
  });
  await step.getByRole('button', { name: 'Выбрать следующим шагом', exact: true }).click();
  await expect(step.getByRole('alert')).toContainText('Не удалось выбрать шаг');
  await expect(step).toContainText('Выбран: Главное на сегодня');
  await page.evaluate(() => {
    const fixture = window as Window & {
      weeklyOriginalTransaction?: typeof IDBDatabase.prototype.transaction;
    };
    if (fixture.weeklyOriginalTransaction)
      IDBDatabase.prototype.transaction = fixture.weeklyOriginalTransaction;
    delete fixture.weeklyOriginalTransaction;
  });
  await step.getByRole('button', { name: 'Выбрать следующим шагом', exact: true }).click();
  await expect(step).toContainText('Выбран: Описать проект');
  await expect(step.getByRole('alert')).toHaveCount(0);
  await step.getByRole('button', { name: 'Создать связанное действие', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Новое действие цели', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Название', exact: true })).toBeFocused();
  await dialog.getByRole('textbox', { name: 'Название', exact: true }).fill('Отменённый черновик');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    step.getByRole('button', { name: 'Создать связанное действие', exact: true }),
  ).toBeFocused();
  await step.getByRole('button', { name: 'Создать связанное действие', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Название', exact: true })
    .fill('Выбрать примеры работ');
  await dialog
    .getByRole('group', { name: 'Когда выполнить', exact: true })
    .getByRole('button', { name: 'Сегодня', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`week=${previous.startDate}`));
  await expect(step).toContainText('Выбран: Описать проект');
  const choice = step.getByLabel('Связанное действие', { exact: true });
  await expect(choice).not.toContainText('Отменённый черновик');
  await choice.selectOption({ label: 'Выбрать примеры работ' });
  await step.getByRole('button', { name: 'Выбрать следующим шагом', exact: true }).click();
  await expect(step).toContainText('Выбран: Выбрать примеры работ');
  await step.getByLabel('Дата следующего шага', { exact: true }).fill(addDays(today, 1));
  await step.getByRole('button', { name: 'Назначить дату', exact: true }).click();
  await expect(step).toContainText(`Запланировано: ${addDays(today, 1)}`);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('weekly-next-step.png'), fullPage: true });
  await page.reload();
  await expect(overview.getByRole('heading', { name: 'Итоги недели' })).toBeVisible();
  await step.locator('summary').click();
  await expect(step).toContainText('Выбран: Выбрать примеры работ');
  await expect(step).toContainText(`Запланировано: ${addDays(today, 1)}`);
  await page.goto('/#/v2/today');
  await expect(page.locator('.planner-main')).toContainText('Главное на сегодня');
  await page.goto('/#/v2/today?day=tomorrow');
  await expect(page.locator('main')).toContainText('Выбрать примеры работ');
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lifeos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const value = await new Promise<{ plannedDate: string; isNext: boolean }>((resolve, reject) => {
      const req = db.transaction('lifeActions').objectStore('lifeActions').get('weekly-todo');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  });
  expect(stored).toMatchObject({ plannedDate: addDays(today, 1), isNext: false });
  expect(errors).toEqual([]);
});
