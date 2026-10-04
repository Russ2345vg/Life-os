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
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { SphereRecordMapper } from '../../src/infrastructure/persistence/mappers/SphereRecordMapper';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';

const panel = (page: Page) => page.getByRole('dialog', { name: 'Быстрый доступ', exact: true });
const search = (page: Page) => panel(page).getByRole('searchbox');
async function seed(page: Page, entry = '/') {
  await page.goto(`${entry}#/v2/today`);
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const now = new Date();
  const sphere = Sphere.create({ id: EntityId.create('quick-sphere'), name: 'Работа QA', now });
  const direction = Direction.create({
    id: EntityId.create('quick-direction'),
    name: 'Развитие проекта',
    sphereId: sphere.id,
    now,
  });
  const goal = Goal.create({
    id: EntityId.create('quick-goal'),
    title: 'Запустить проект',
    directionId: direction.id,
    now,
  });
  const action = LifeAction.createDraft({
    id: EntityId.create('quick-action'),
    title: LifeActionTitle.create('Подготовить отчёт'),
    goalId: goal.id,
    createdAt: now,
    eventId: EntityId.create('quick-created'),
  });
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('lifeos');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(Object.keys(records), 'readwrite');
        for (const [store, rows] of Object.entries(records))
          rows.forEach((row) => tx.objectStore(store).put(row));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      lifeActions: [LifeActionRecordMapper.toRecord(action)],
      spheres: [SphereRecordMapper.toRecord(sphere)],
      directions: [DirectionRecordMapper.toRecord(direction)],
      goals: [GoalRecordMapper.toRecord(goal)],
    },
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
}
async function open(page: Page, returnToResult = false) {
  await page.getByRole('button', { name: 'Поиск и добавление', exact: true }).last().click();
  if (returnToResult)
    await expect(panel(page).getByRole('button', { name: /^Подготовить отчёт/ })).toBeFocused();
  else await expect(search(page)).toBeFocused();
  await expect(panel(page).getByRole('list', { name: 'Результаты поиска' })).toBeVisible();
}

test('quick access searches all sections, changes date and preserves the Today draft', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  const draft = page.getByRole('textbox', { name: 'Новое действие на сегодня' });
  await draft.fill('Несохранённый план');
  await open(page);
  await search(page).fill('ОТЧЕТ работа');
  const result = panel(page).getByRole('listitem');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('Подготовить отчёт');
  await panel(page).getByRole('button', { name: 'Изменить дату: Подготовить отчёт' }).click();
  await panel(page).getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Дата изменена' })).toBeVisible();
  await expect(result).toContainText('Сегодня');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(draft).toHaveValue('Несохранённый план');
  await expect(page.getByRole('button', { name: 'Подготовить отчёт', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Поиск и добавление', exact: true })).toBeFocused();
  await draft.fill('');
  await open(page);
  await search(page).fill('проект');
  await expect(panel(page).getByRole('listitem')).toHaveCount(3);
  await search(page).fill('Работа QA');
  await expect(panel(page).getByRole('listitem')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await panel(page).boundingBox();
  expect(bounds!.x + bounds!.width).toBeCloseTo(page.viewportSize()!.width, 0);
  expect(bounds!.y).toBe(0);
  expect(errors).toEqual([]);
});

test('quick access above a modal creates once, preserves its draft and guards page navigation', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Создать с параметрами', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Новое действие', exact: true });
  const title = editor.getByLabel('Название', { exact: true });
  await title.fill('Черновик редактора');
  await page.keyboard.press('Control+k');
  await expect(search(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Черновик редактора');
  await open(page);
  await panel(page).getByRole('button', { name: 'Добавить действие', exact: true }).click();
  await panel(page).getByLabel('Что хотите сделать?', { exact: true }).fill('Задача из панели');
  await panel(page).getByRole('button', { name: 'Создать действие', exact: true }).dblclick();
  await expect(
    panel(page).getByRole('status').filter({ hasText: 'Действие создано' }),
  ).toBeVisible();
  await expect(panel(page).getByRole('listitem')).toHaveCount(1);
  await expect(panel(page).getByRole('listitem')).toContainText('Без даты');
  await panel(page)
    .getByRole('button', { name: /^Задача из панели/ })
    .click();
  const actionPanel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await expect(actionPanel).toBeVisible();
  await expect(page).toHaveURL(/#\/v2\/actions\/new\?date=\d{4}-\d{2}-\d{2}&action=/);
  await actionPanel.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(panel(page)).toBeVisible();
  await expect(title).toHaveValue('Черновик редактора');
  await search(page).fill('Запустить проект');
  await panel(page)
    .getByRole('button', { name: /^Запустить проект/ })
    .first()
    .click();
  await expect(panel(page).getByRole('alertdialog')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Остаться', exact: true })).toBeFocused();
  await panel(page).getByRole('button', { name: 'Остаться', exact: true }).click();
  await expect(title).toHaveValue('Черновик редактора');
  await panel(page)
    .getByRole('button', { name: /^Запустить проект/ })
    .first()
    .click();
  await panel(page).getByRole('button', { name: 'Перейти без сохранения', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(/#\/v2\/goals\/quick-goal$/);
  await expect(page.locator('#planner-main-content')).toBeFocused();
});

test('quick access works in account and sleep, preserving their unfinished fields', async ({
  page,
}) => {
  const entry = '/tests/fixtures/quick-access-account.html';
  await seed(page, entry);
  await page.goto(`${entry}?screen=account#/v2/account`);
  const email = page.getByLabel('Электронная почта', { exact: true });
  await email.fill('draft@example.test');
  await open(page);
  await search(page).fill('Подготовить отчёт');
  await panel(page)
    .getByRole('button', { name: /^Подготовить отчёт/ })
    .click();
  const actionPanel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await expect(actionPanel).toBeVisible();
  await expect(page).toHaveURL(/#\/v2\/account\?action=quick-action$/);
  await actionPanel.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Закрыть быстрый доступ' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(email).toHaveValue('draft@example.test');
  await open(page, true);
  await panel(page).getByRole('button', { name: 'Добавить действие', exact: true }).click();
  await panel(page).getByLabel('Что хотите сделать?', { exact: true }).fill('Создано из аккаунта');
  await panel(page).getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(panel(page).getByRole('listitem')).toContainText('Создано из аккаунта');
  await page.keyboard.press('Escape');
  await expect(email).toHaveValue('draft@example.test');
  await email.fill('');
  await page.goto('/#/v2/sleep');
  const bedtime = page.getByLabel('Сон', { exact: true });
  await bedtime.fill('23:17');
  await open(page);
  await search(page).fill('Подготовить отчёт');
  await panel(page)
    .getByRole('button', { name: /^Подготовить отчёт/ })
    .click();
  await expect(actionPanel).toBeVisible();
  await expect(page).toHaveURL(/#\/v2\/sleep\?action=quick-action$/);
  await actionPanel.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Закрыть быстрый доступ' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(bedtime).toHaveValue('23:17');
  await open(page, true);
  await panel(page).getByRole('button', { name: 'Добавить действие', exact: true }).click();
  await panel(page).getByLabel('Что хотите сделать?', { exact: true }).fill('Создано из сна');
  await panel(page).getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(panel(page).getByRole('listitem')).toContainText('Создано из сна');
  await page.keyboard.press('Escape');
  await expect(bedtime).toHaveValue('23:17');
});

test('quick access reports reader failures and retry, retains create draft across close', async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.getAll;
    const fixture = window as Window & { quickAccessOriginalGetAll?: typeof original };
    fixture.quickAccessOriginalGetAll = original;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'goals') {
        throw new Error('QA reader unavailable');
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Поиск и добавление', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Не удалось загрузить записи');
  await page.evaluate(() => {
    const fixture = window as Window & {
      quickAccessOriginalGetAll?: typeof IDBObjectStore.prototype.getAll;
    };
    if (!fixture.quickAccessOriginalGetAll)
      throw new Error('Quick access fixture was not installed');
    IDBObjectStore.prototype.getAll = fixture.quickAccessOriginalGetAll;
    delete fixture.quickAccessOriginalGetAll;
  });
  await expect(panel(page).getByRole('listitem')).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(
    panel(page).getByRole('listitem').filter({ hasText: 'Подготовить отчёт' }),
  ).toHaveCount(1);
  await panel(page).getByRole('button', { name: 'Добавить действие', exact: true }).click();
  await panel(page).getByLabel('Что хотите сделать?', { exact: true }).fill('Черновик панели');
  await panel(page).getByRole('button', { name: 'Завтра', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Поиск и добавление', exact: true }).click();
  await expect(panel(page).getByLabel('Что хотите сделать?', { exact: true })).toHaveValue(
    'Черновик панели',
  );
  await expect(panel(page).getByRole('button', { name: 'Завтра', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('quick access respects composition, keyboard selection and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await page.evaluate(() =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'л', code: 'KeyK', ctrlKey: true, bubbles: true }),
    ),
  );
  await expect(search(page)).toBeFocused();
  await search(page).fill('Подготовить отчёт');
  await search(page).evaluate((input) =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
    ),
  );
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveCSS('animation-name', 'none');
  await search(page).press('ArrowDown');
  await expect(panel(page).getByRole('button', { name: /^Подготовить отчёт/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/v2\/today\?action=quick-action$/);
  await expect(page.getByRole('dialog', { name: 'Действие', exact: true })).toBeVisible();
});

test('quick access date changes preserve the inline action editor and its save remains valid', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/#/v2/actions/quick-action');
  const editor = page.locator('.planner-action-edit');
  await editor.locator('summary').click();
  await editor.getByLabel('Название', { exact: true }).fill('Незавершённое новое название');
  await editor.getByRole('textbox', { name: 'Описание', exact: true }).fill('Не терять описание');
  await open(page);
  await search(page).fill('Подготовить отчёт');
  await panel(page).getByRole('button', { name: 'Изменить дату: Подготовить отчёт' }).click();
  await panel(page).getByRole('button', { name: 'Завтра', exact: true }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Дата изменена' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(editor.getByLabel('Название', { exact: true })).toHaveValue(
    'Незавершённое новое название',
  );
  await expect(editor.getByRole('textbox', { name: 'Описание', exact: true })).toHaveValue(
    'Не терять описание',
  );
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.planner-notice')).toContainText('Действие изменено');
  await page.reload();
  await editor.locator('summary').click();
  await expect(editor.getByLabel('Название', { exact: true })).toHaveValue(
    'Незавершённое новое название',
  );
  await expect(editor.getByRole('textbox', { name: 'Описание', exact: true })).toHaveValue(
    'Не терять описание',
  );
});

test('quick access keeps failed creation retryable without false success or optimistic dates', async ({
  page,
}) => {
  await seed(page);
  await open(page);
  await panel(page).getByRole('button', { name: 'Добавить действие', exact: true }).click();
  await panel(page).getByLabel('Что хотите сделать?', { exact: true }).fill('Повтор после ошибки');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'lifeActions') {
        IDBObjectStore.prototype.put = original;
        throw new Error('QA save unavailable');
      }
      return original.apply(this, args);
    };
  });
  await panel(page).getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(panel(page).getByLabel('Что хотите сделать?', { exact: true })).toHaveValue(
    'Повтор после ошибки',
  );
  await expect(panel(page).getByRole('status').filter({ hasText: 'Действие создано' })).toHaveCount(
    0,
  );
  await panel(page).getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(
    panel(page).getByRole('status').filter({ hasText: 'Действие создано' }),
  ).toBeVisible();
  await expect(panel(page).getByRole('listitem')).toHaveCount(1);
  await panel(page).getByRole('button', { name: 'Изменить дату: Повтор после ошибки' }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'lifeActions') {
        IDBObjectStore.prototype.put = original;
        throw new Error('QA date unavailable');
      }
      return original.apply(this, args);
    };
  });
  await panel(page).getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(panel(page).getByRole('listitem')).toContainText('Без даты');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Дата изменена' })).toHaveCount(0);
});

test('quick access protects goal and sphere drafts in existing editor sheets', async ({ page }) => {
  await seed(page);
  for (const editorKind of ['goal', 'sphere'] as const) {
    await page.goto(editorKind === 'goal' ? '/#/v2/goals/new' : '/#/v2/spheres');
    if (editorKind === 'sphere')
      await page.getByRole('button', { name: 'Новая сфера', exact: true }).click();
    const editor = page.locator('dialog.planner-sheet');
    const title = editor.getByRole('textbox', { name: 'Название', exact: true });
    await title.fill(`Черновик ${editorKind}`);
    await open(page);
    await search(page).fill('Подготовить отчёт');
    await search(page).press('Enter');
    const actionPanel = page.getByRole('dialog', { name: 'Действие', exact: true });
    await expect(actionPanel).toBeVisible();
    await actionPanel.getByRole('button', { name: 'Закрыть панель' }).click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(title).toHaveValue(`Черновик ${editorKind}`);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
  }
});

test('quick access moves only one recurrence and never offers clearing a ready action date', async ({
  page,
}) => {
  await seed(page);
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const now = new Date();
  const actions = [0, 1].map((index) => {
    const date = addDays(today, index);
    const a = LifeAction.createDraft({
      id: EntityId.create(`repeat-${index}`),
      title: LifeActionTitle.create('Практика QA'),
      plannedDate: DayDate.create(date),
      createdAt: now,
      eventId: EntityId.create(`event-${index}`),
    });
    a.setPlanningMetadata({
      occurrence: { ruleId: 'quick-repeat', slot: date, originalDate: date, ruleRevision: 1 },
    });
    return a;
  });
  const ready = LifeAction.createDraft({
    id: EntityId.create('quick-ready'),
    title: LifeActionTitle.create('Подготовленное QA'),
    createdAt: now,
    eventId: EntityId.create('ready-create'),
  });
  ready.makeReady({
    expectedResult: ActionExpectedResult.create('Результат'),
    plannedDate: DayDate.create(today),
    occurredAt: now,
    eventId: EntityId.create('ready-event'),
  });
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('lifeos');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('lifeActions', 'readwrite');
        records.forEach((r) => tx.objectStore('lifeActions').put(r));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    [...actions, ready].map(LifeActionRecordMapper.toRecord),
  );
  await open(page);
  await search(page).fill('Подготовленное QA');
  await panel(page).getByRole('button', { name: 'Изменить дату: Подготовленное QA' }).click();
  await expect(panel(page).getByRole('button', { name: 'Без даты', exact: true })).toHaveCount(0);
  await search(page).fill('Практика QA');
  await expect(panel(page).getByRole('listitem')).toHaveCount(1);
  await expect(panel(page).getByRole('listitem')).toContainText('Это повторение');
  await panel(page).getByRole('button', { name: 'Изменить дату: Практика QA' }).click();
  await panel(page).getByRole('button', { name: 'Без даты', exact: true }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Дата изменена' })).toBeVisible();
  const dates = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('lifeos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const rows = await new Promise<Array<{ id: string; plannedDate: string | null }>>(
      (resolve, reject) => {
        const r = db.transaction('lifeActions').objectStore('lifeActions').getAll();
        r.onsuccess = () => resolve(r.result as Array<{ id: string; plannedDate: string | null }>);
        r.onerror = () => reject(r.error);
      },
    );
    db.close();
    return rows
      .filter((r) => r.id.startsWith('repeat-'))
      .map((r) => ({ id: r.id, date: r.plannedDate }))
      .sort((a, b) => a.id.localeCompare(b.id));
  });
  expect(dates).toEqual([
    { id: 'repeat-0', date: null },
    { id: 'repeat-1', date: addDays(today, 1) },
  ]);
});
