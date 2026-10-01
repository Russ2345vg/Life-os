import { expect, test, type Page } from '@playwright/test';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../src/domain';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seed(page: Page, view: 'today' | 'actions') {
  await page.goto('/#/v2/actions');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  const date = await page.evaluate(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      iso: now.toISOString(),
    };
  });
  const action = LifeAction.createDraft({
    id: EntityId.create('completion-recovery'),
    title: LifeActionTitle.create('Проверить выполнение'),
    plannedDate: DayDate.fromParts(date.year, date.month, date.day),
    createdAt: new Date(date.iso),
    eventId: EntityId.create('created-recovery'),
  });
  await page.evaluate(async (record) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('lifeos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      tx.objectStore('lifeActions').put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, LifeActionRecordMapper.toRecord(action));
  await page.goto(`/#/v2/${view}`);
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Выполнить: Проверить выполнение', exact: true }),
  ).toBeVisible();
}

for (const view of ['today', 'actions'] as const) {
  test(`${view}: failed save can reload and make a fresh explicit attempt`, async ({ page }) => {
    await page.route('**/src/app/createLifeOsApplicationForEnvironment.ts', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
      import { createLifeOsApplication } from '/src/app/composition/createLifeOsApplication.ts';
      export async function createLifeOsApplicationForEnvironment() {
        const app = await createLifeOsApplication();
        const execute = app.completeLifeAction.execute.bind(app.completeLifeAction);
        let fail = true;
        app.completeLifeAction.execute = async (input) => {
          if (fail) { fail = false; throw new Error('Не удалось сохранить действие'); }
          return execute(input);
        };
        return app;
      }`,
      }),
    );
    await seed(page, view);
    await page
      .getByRole('checkbox', { name: 'Выполнить: Проверить выполнение', exact: true })
      .click();
    const failure = page.getByRole('alert').filter({ hasText: 'Не удалось сохранить действие' });
    await expect(failure).toBeVisible();
    expect((await readCompletion(page)).events).toHaveLength(0);
    await failure.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
    await expect(failure).toHaveCount(0);
    await page
      .getByRole('checkbox', { name: 'Выполнить: Проверить выполнение', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Итог задачи', exact: true })).toBeVisible();
    expect((await readCompletion(page)).events).toHaveLength(1);
  });
  test(`${view}: retries post-commit refresh without repeating completion`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/src/app/createLifeOsApplicationForEnvironment.ts', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `import { createLifeOsApplication } from '/src/app/composition/createLifeOsApplication.ts';
        export async function createLifeOsApplicationForEnvironment() {
          const app = await createLifeOsApplication();
          let armed = false;
          window.__completionWrites = 0;
          const execute = app.completeLifeAction.execute.bind(app.completeLifeAction);
          app.completeLifeAction.execute = async (input) => {
            window.__completionWrites++;
            const result = await execute(input);
            if (result.ok) armed = true;
            return result;
          };
          const owner = ${view === 'today' ? 'app.getPlannerToday' : 'app.planning.periods'};
          const method = ${JSON.stringify(view === 'today' ? 'execute' : 'load')};
          const read = owner[method].bind(owner);
          owner[method] = async (...args) => {
            if (armed) { armed = false; throw new Error('Post-commit read failed'); }
            return read(...args);
          };
          return app;
        }`,
      }),
    );
    await seed(page, view);
    await page
      .getByRole('checkbox', { name: 'Выполнить: Проверить выполнение', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Итог задачи', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Итог задачи', { exact: true }).fill('Не терять текст');
    const failure = page
      .getByRole('alert')
      .filter({ hasText: 'Действие выполнено. Не удалось обновить данные на экране.' });
    await expect(failure).toBeVisible();
    await expect(dialog.getByLabel('Итог задачи', { exact: true })).toHaveValue('Не терять текст');
    await dialog.getByRole('button', { name: 'Пропустить', exact: true }).click();
    await page.screenshot({ path: info.outputPath(`${view}-refresh-error.png`), fullPage: true });
    const before = await readCompletion(page);
    expect(before.action?.status).toBe('completed');
    expect(before.events).toHaveLength(1);
    await failure.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
    await expect(failure).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as Window & { __completionWrites?: number }).__completionWrites,
      ),
    ).toBe(1);
    expect(await readCompletion(page)).toEqual(before);
    await page.screenshot({ path: info.outputPath(`${view}-recovered.png`), fullPage: true });
    await page.reload();
    expect(await readCompletion(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
  test(`${view}: completion preserves its optional summary and layout`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seed(page, view);
    await page.screenshot({ path: info.outputPath(`${view}-before.png`), fullPage: true });
    await info.attach('baseline-styles', {
      body: JSON.stringify(
        await page.evaluate(() => {
          const root = document.querySelector('.planner-v2')!;
          const styles = getComputedStyle(root);
          return {
            route: location.hash,
            width: innerWidth,
            background: styles.backgroundColor,
            color: styles.color,
            font: styles.fontFamily,
            sheets: Array.from(document.styleSheets).map(
              (s) => s.href ?? s.ownerNode?.textContent?.slice(0, 90),
            ),
          };
        }),
      ),
      contentType: 'application/json',
    });
    await page
      .getByRole('checkbox', { name: 'Выполнить: Проверить выполнение', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Итог задачи', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Итог задачи', { exact: true }).fill('Сохранённый черновик итога');
    await expect(dialog.getByLabel('Итог задачи', { exact: true })).toHaveValue(
      'Сохранённый черновик итога',
    );
    await page.screenshot({ path: info.outputPath(`${view}-summary.png`), fullPage: true });
    await dialog.getByRole('button', { name: 'Пропустить', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('navigation ignores the late result of the previous completion refresh', async ({ page }) => {
  await page.route('**/src/app/createLifeOsApplicationForEnvironment.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    import { createLifeOsApplication } from '/src/app/composition/createLifeOsApplication.ts';
    export async function createLifeOsApplicationForEnvironment() {
      const app = await createLifeOsApplication();
      const execute = app.completeLifeAction.execute.bind(app.completeLifeAction);
      const read = app.getPlannerToday.execute.bind(app.getPlannerToday);
      let armed = false;
      app.completeLifeAction.execute = async (input) => { const result = await execute(input); armed = result.ok; return result; };
      app.getPlannerToday.execute = async (...args) => {
        if (armed) { armed = false; await new Promise((resolve) => { window.__releaseCompletionRead = resolve; }); throw new Error('Old screen failure'); }
        return read(...args);
      };
      return app;
    }`,
    }),
  );
  await seed(page, 'today');
  await page
    .getByRole('checkbox', { name: 'Выполнить: Проверить выполнение', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Итог задачи', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await page.goto('/#/v2/actions');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  await page.evaluate(() =>
    (window as Window & { __releaseCompletionRead?: () => void }).__releaseCompletionRead?.(),
  );
  // A second route load drains the old promise before checking feedback.
  await page.goto('/#/v2/actions/completion-recovery');
  await expect(
    page.getByRole('heading', { name: 'Проверить выполнение', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Итог задачи', exact: true })).toHaveCount(0);
});

async function readCompletion(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('lifeos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(['lifeActions', 'journal']);
    const read = <T>(request: IDBRequest<T>): Promise<T> =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [action, events] = await Promise.all([
      read<Record<string, unknown> | undefined>(
        tx.objectStore('lifeActions').get('completion-recovery'),
      ),
      read<Record<string, unknown>[]>(tx.objectStore('journal').getAll()),
    ]);
    db.close();
    return {
      action,
      events: events.filter(
        (e) => e.type === 'actionCompleted' && e.subjectId === 'completion-recovery',
      ),
    };
  });
}
