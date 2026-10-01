import { expect, test, type Page } from '@playwright/test';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../src/domain';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seed(page: Page, second = false) {
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const now = new Date();
  const action = LifeAction.createDraft({
    id: EntityId.create('panel-action'),
    title: LifeActionTitle.create('Действие для панели'),
    plannedDate: DayDate.fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    createdAt: now,
    eventId: EntityId.create('panel-action-created'),
  });
  const additional = second
    ? LifeAction.createDraft({
        id: EntityId.create('panel-second-action'),
        title: LifeActionTitle.create('Второе действие'),
        plannedDate: DayDate.fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()),
        createdAt: now,
        eventId: EntityId.create('panel-second-action-created'),
      })
    : null;
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('lifeActions', 'readwrite');
        for (const record of records) tx.objectStore('lifeActions').put(record);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    [
      LifeActionRecordMapper.toRecord(action),
      ...(additional ? [LifeActionRecordMapper.toRecord(additional)] : []),
    ],
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Действие для панели', exact: true }),
  ).toBeVisible();
}

test('Today opens an action over its source and Back restores the same screen', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/#\/v2\/today\?action=panel-action$/);
  await page.goBack();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  await page.goForward();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(page).toHaveURL(/#\/v2\/today$/);
});

test('a direct action URL survives reload and missing actions have a safe empty state', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/#/v2/today?day=tomorrow&action=panel-action');
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await expect(panel.getByRole('heading', { name: 'Действие для панели' })).toBeVisible();
  await page.reload();
  await expect(panel.getByRole('heading', { name: 'Действие для панели' })).toBeVisible();
  await panel.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(page).toHaveURL(/#\/v2\/today\?day=tomorrow$/);
  await page.goto('/#/v2/today?action=missing-action');
  await expect(panel.getByText('Действие не найдено или находится в архиве.')).toBeVisible();
  await expect(panel.getByRole('checkbox')).toHaveCount(0);
});

test('editing the title, date, and time updates the source while its panel stays mounted', async ({
  page,
}) => {
  await seed(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await expect(panel.locator('.planner-action-panel__heading h2')).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('action-panel.png') });
  const layout = await panel.evaluate((dialog) => {
    const controls = [
      dialog.querySelector<HTMLButtonElement>('.planner-sheet-close'),
      [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent?.includes('Сохранить название'),
      ),
      dialog.querySelector<HTMLElement>('.planner-action-edit__more > summary'),
    ];
    return {
      width: dialog.clientWidth,
      contentWidth: dialog.scrollWidth,
      touchHeights: controls.map((control) => control?.getBoundingClientRect().height ?? 0),
    };
  });
  expect(layout.contentWidth).toBeLessThanOrEqual(layout.width + 1);
  if (page.viewportSize()!.width <= 640) {
    for (const height of layout.touchHeights) expect(height).toBeGreaterThanOrEqual(44);
  }
  await panel.getByRole('textbox', { name: 'Название' }).fill('Обновлённое действие');
  await panel.getByRole('button', { name: 'Сохранить название' }).click();
  await expect(panel.getByRole('heading', { name: 'Обновлённое действие' })).toBeVisible();
  await panel.getByRole('button', { name: 'Завтра', exact: true }).click();
  await expect(panel.getByLabel('Плановая дата: Обновлённое действие')).not.toHaveValue('');
  await panel.getByRole('button', { name: 'Планировать время' }).click();
  const time = page.getByRole('dialog', { name: 'Запланировать действие' });
  await time.getByRole('spinbutton', { name: 'Оценка работы, минуты' }).fill('45');
  await time.getByRole('textbox', { name: 'Начало' }).fill('10:00');
  await time.getByRole('spinbutton', { name: 'Длительность блока, минуты' }).fill('30');
  await time.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(time).toHaveCount(0);
  await expect(panel).toContainText('Оценка: 45 мин');
  await panel.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(page.getByRole('button', { name: 'Обновлённое действие', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Завтра', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Обновлённое действие', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('a failed title save keeps its draft and reports the error inside the panel', async ({
  page,
}) => {
  await page.route('**/src/app/createLifeOsApplicationForEnvironment.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `import { createLifeOsApplication } from '/src/app/composition/createLifeOsApplication.ts';
        export async function createLifeOsApplicationForEnvironment() {
          const app = await createLifeOsApplication();
          const edit = app.editPlannerActionDraft.execute.bind(app.editPlannerActionDraft);
          let fail = true;
          app.editPlannerActionDraft.execute = async (input) => {
            if (fail) { fail = false; throw new Error('Title write failed'); }
            return edit(input);
          };
          return app;
        }`,
    }),
  );
  await seed(page);
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  const title = panel.getByRole('textbox', { name: 'Название' });
  await title.fill('Попытка переименования');
  await panel.getByRole('button', { name: 'Сохранить название' }).click();
  await expect(
    panel.getByRole('alert').filter({ hasText: 'Title write failed' }).first(),
  ).toBeVisible();
  await expect(title).toHaveValue('Попытка переименования');
  await panel.getByRole('button', { name: 'Сохранить название' }).click();
  await expect(panel.getByRole('heading', { name: 'Попытка переименования' })).toBeVisible();
});

test('Actions keeps the current filter after inspecting an action', async ({ page }) => {
  await seed(page);
  await page.goto('/#/v2/actions');
  const search = page.getByRole('textbox', { name: 'Поиск действий' });
  await search.fill('Действие для панели');
  await page.getByRole('link', { name: 'Действие для панели', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Действие', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(search).toHaveValue('Действие для панели');
  await expect(page).toHaveURL(/#\/v2\/actions$/);
});

test('calendar, kanban, and tree open an action without changing their selected view', async ({
  page,
}) => {
  await seed(page);
  for (const view of ['calendar', 'kanban', 'tree'] as const) {
    await page.goto(`/#/v2/actions?view=${view}`);
    if (view === 'tree') await page.getByRole('button', { name: 'Без цели 1' }).click();
    const action = page.getByRole('link', { name: 'Действие для панели', exact: true }).first();
    await expect(action).toBeVisible();
    await action.click();
    const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`#\\/v2\\/actions\\?view=${view}&action=panel-action$`),
    );
    await panel.getByRole('button', { name: 'Закрыть панель' }).click();
    await expect(page).toHaveURL(new RegExp(`#\\/v2\\/actions\\?view=${view}$`));
  }
});

test('dirty title rejects browser Back and requires an explicit discard', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  const title = panel.getByRole('textbox', { name: 'Название' });
  await title.fill('Несохранённое название');
  await page.goBack();
  await expect(panel).toBeVisible();
  await expect(title).toHaveValue('Несохранённое название');
  await panel.getByRole('button', { name: 'Продолжить редактирование' }).click();
  await expect(page).toHaveURL(/#\/v2\/today\?action=panel-action$/);
  await panel.getByRole('button', { name: 'Закрыть панель' }).click();
  await panel.getByRole('button', { name: 'Закрыть без сохранения' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/#\/v2\/today$/);
});

test('search handoff restores its query and result after Back', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Поиск и добавление' }).last().click();
  const searchPanel = page.getByRole('dialog', { name: 'Быстрый доступ', exact: true });
  const query = searchPanel.getByRole('searchbox');
  await query.fill('Действие для панели');
  const result = searchPanel.getByRole('button', { name: /Действие для панели/ }).first();
  await result.click();
  await expect(page.getByRole('dialog', { name: 'Действие', exact: true })).toBeVisible();
  await expect(searchPanel).toHaveCount(0);
  await page.goBack();
  await expect(searchPanel).toBeVisible();
  await expect(query).toHaveValue('Действие для панели');
  await expect(result).toBeFocused();
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Действие', exact: true })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Действие', exact: true })
    .getByRole('button', { name: 'Закрыть панель' })
    .click();
  await expect(searchPanel).toBeVisible();
  await expect(query).toHaveValue('Действие для панели');
});

test('search can switch a dirty action after confirmation in its top dialog', async ({ page }) => {
  await seed(page, true);
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await panel.getByRole('textbox', { name: 'Название' }).fill('Несохранённое название');
  await panel.getByRole('button', { name: 'Поиск и добавление' }).click();
  const search = page.getByRole('dialog', { name: 'Быстрый доступ', exact: true });
  await search.getByRole('searchbox').fill('Второе действие');
  await search
    .getByRole('button', { name: /Второе действие/ })
    .first()
    .click();
  const confirmation = search.getByRole('alertdialog', { name: 'Несохранённые изменения' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Продолжить редактирование' }).click();
  await expect(search).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Название' })).toHaveValue(
    'Несохранённое название',
  );
  await search
    .getByRole('button', { name: /Второе действие/ })
    .first()
    .click();
  await confirmation.getByRole('button', { name: 'Закрыть без сохранения' }).click();
  await expect(search).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: 'Второе действие' })).toBeVisible();
  await expect(page).toHaveURL(/#\/v2\/today\?action=panel-second-action$/);
});

test('search opens an action over an unfinished account form without losing its fields', async ({
  page,
}) => {
  await page.route('**/src/app/createLifeOsApplicationForEnvironment.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `import { createLifeOsApplication } from '/src/app/composition/createLifeOsApplication.ts';
        export async function createLifeOsApplicationForEnvironment() {
          const app = await createLifeOsApplication();
          const load = app.accountSync.load.bind(app.accountSync);
          app.accountSync.load = async () => ({
            ...(await load()),
            availability: { available: true, reason: '' },
          });
          return app;
        }`,
    }),
  );
  await seed(page);
  await page.goto('/#/v2/account');
  const email = page.getByLabel('Электронная почта', { exact: true });
  await email.fill('draft@example.test');
  await page.getByRole('button', { name: 'Поиск и добавление' }).last().click();
  const searchPanel = page.getByRole('dialog', { name: 'Быстрый доступ', exact: true });
  await searchPanel.getByRole('searchbox').fill('Действие для панели');
  await searchPanel
    .getByRole('button', { name: /Действие для панели/ })
    .first()
    .click();
  const actionPanel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await expect(actionPanel).toBeVisible();
  await expect(page).toHaveURL(/#\/v2\/account\?action=panel-action$/);
  await actionPanel.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(email).toHaveValue('draft@example.test');
  await expect(searchPanel.getByRole('searchbox')).toHaveValue('Действие для панели');
});

test('closing and reopening the panel keeps a saved completion available for refresh retry', async ({
  page,
}) => {
  await page.route('**/src/app/createLifeOsApplicationForEnvironment.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `import { createLifeOsApplication } from '/src/app/composition/createLifeOsApplication.ts';
        export async function createLifeOsApplicationForEnvironment() {
          const app = await createLifeOsApplication();
          window.__panelCompletionWrites = 0;
          let failRefresh = false;
          const complete = app.completeLifeAction.execute.bind(app.completeLifeAction);
          app.completeLifeAction.execute = async (input) => {
            window.__panelCompletionWrites++;
            const result = await complete(input);
            if (result.ok) failRefresh = true;
            return result;
          };
          const read = app.getPlannerToday.execute.bind(app.getPlannerToday);
          app.getPlannerToday.execute = async (...args) => {
            if (failRefresh) {
              failRefresh = false;
              throw new Error('Post-commit read failed');
            }
            return read(...args);
          };
          return app;
        }`,
    }),
  );
  await seed(page);
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await panel.getByRole('checkbox', { name: 'Выполнить: Действие для панели' }).click();
  const summary = page.getByRole('dialog', { name: 'Итог задачи', exact: true });
  await expect(summary).toBeVisible();
  await summary.getByRole('button', { name: 'Пропустить' }).click();
  await expect(panel.getByRole('alert')).toContainText(
    'Действие выполнено. Не удалось обновить данные на экране.',
  );
  await panel.getByRole('button', { name: 'Закрыть панель' }).click();
  await page.goForward();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as Window & { __panelCompletionWrites?: number }).__panelCompletionWrites,
    ),
  ).toBe(1);
});

test('the first panel open after a Today refresh failure keeps its completion receipt', async ({
  page,
}) => {
  await page.route('**/src/app/createLifeOsApplicationForEnvironment.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `import { createLifeOsApplication } from '/src/app/composition/createLifeOsApplication.ts';
        export async function createLifeOsApplicationForEnvironment() {
          const app = await createLifeOsApplication();
          window.__panelCompletionWrites = 0;
          let failRefresh = false;
          const complete = app.completeLifeAction.execute.bind(app.completeLifeAction);
          app.completeLifeAction.execute = async (input) => {
            window.__panelCompletionWrites++;
            const result = await complete(input);
            if (result.ok) failRefresh = true;
            return result;
          };
          const read = app.getPlannerToday.execute.bind(app.getPlannerToday);
          app.getPlannerToday.execute = async (...args) => {
            if (failRefresh) {
              failRefresh = false;
              throw new Error('Post-commit read failed');
            }
            return read(...args);
          };
          return app;
        }`,
    }),
  );
  await seed(page);
  await page.getByRole('checkbox', { name: 'Выполнить: Действие для панели' }).click();
  const summary = page.getByRole('dialog', { name: 'Итог задачи', exact: true });
  await expect(summary).toBeVisible();
  await summary.getByRole('button', { name: 'Пропустить' }).click();
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Действие выполнено. Не удалось обновить данные на экране.',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await expect(panel.getByRole('alert')).toContainText(
    'Действие выполнено. Не удалось обновить данные на экране.',
  );
  await panel.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as Window & { __panelCompletionWrites?: number }).__panelCompletionWrites,
    ),
  ).toBe(1);
});

test('Back protects an unsaved completion summary attached to the panel', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await panel.getByRole('checkbox', { name: 'Выполнить: Действие для панели' }).click();
  const summary = page.getByRole('dialog', { name: 'Итог задачи', exact: true });
  await expect(summary).toBeVisible();
  await summary.getByLabel('Итог задачи', { exact: true }).fill('Черновик итога');
  await page.goBack();
  await expect(summary.getByRole('alertdialog', { name: 'Несохранённые изменения' })).toBeVisible();
  await summary.getByRole('button', { name: 'Продолжить редактирование' }).click();
  await expect(page).toHaveURL(/#\/v2\/today\?action=panel-action$/);
  await expect(summary.getByLabel('Итог задачи', { exact: true })).toHaveValue('Черновик итога');
  await page.goBack();
  await summary.getByRole('button', { name: 'Закрыть без сохранения' }).click();
  await expect(summary).toHaveCount(0);
  await expect(panel).toHaveCount(0);
});

test('Escape closes only the summary after its dirty draft is confirmed', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await panel.getByRole('checkbox', { name: 'Выполнить: Действие для панели' }).click();
  const summary = page.getByRole('dialog', { name: 'Итог задачи', exact: true });
  await summary.getByLabel('Итог задачи', { exact: true }).fill('Черновик итога');
  await page.keyboard.press('Escape');
  await expect(summary.getByRole('alertdialog', { name: 'Несохранённые изменения' })).toBeVisible();
  await summary.getByRole('button', { name: 'Продолжить редактирование' }).click();
  await expect(summary.getByLabel('Итог задачи', { exact: true })).toHaveValue('Черновик итога');
  await page.keyboard.press('Escape');
  await summary.getByRole('button', { name: 'Закрыть без сохранения' }).click();
  await expect(summary).toHaveCount(0);
  await expect(panel).toBeVisible();
});

test('dirty time editor protects Back and Escape without losing the action panel', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  await panel.getByRole('button', { name: 'Планировать время' }).click();
  const time = page.getByRole('dialog', { name: 'Запланировать действие' });
  await time.getByRole('spinbutton', { name: 'Оценка работы, минуты' }).fill('45');
  await page.goBack();
  await expect(time.getByRole('alertdialog', { name: 'Несохранённые изменения' })).toBeVisible();
  await time.getByRole('button', { name: 'Продолжить редактирование' }).click();
  await expect(page).toHaveURL(/#\/v2\/today\?action=panel-action$/);
  await expect(time.getByRole('spinbutton', { name: 'Оценка работы, минуты' })).toHaveValue('45');
  await page.keyboard.press('Escape');
  await expect(time.getByRole('alertdialog', { name: 'Несохранённые изменения' })).toBeVisible();
  await time.getByRole('button', { name: 'Закрыть без сохранения' }).click();
  await expect(time).toHaveCount(0);
  await expect(panel).toBeVisible();
});

test('the action menu and destructive confirmation stay in the panel top layer', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Действие для панели', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Действие', exact: true });
  const more = panel.getByRole('button', { name: 'Действия: Действие для панели' });
  await more.click();
  const menu = panel.getByRole('menu', { name: 'Действия: Действие для панели' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(panel).toBeVisible();
  await more.click();
  await menu.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
  const confirmation = panel.getByRole('alertdialog', { name: 'Подтвердить: Удалить действие' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Отмена' }).click();
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/#\/v2\/today\?action=panel-action$/);
});
