import { expect, test, type Page } from '@playwright/test';
import {
  ActionActualResult,
  ActionSession,
  Direction,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
} from '../../src/domain';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { ActionSessionRecordMapper } from '../../src/infrastructure/persistence/mappers/ActionSessionRecordMapper';
import { createPomodoro, startPomodoroPhase } from '../../src/domain/pomodoro/ActionPomodoroCycle';

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

test('custom focus settings survive reload and active focus retains its duration', async ({
  page,
}) => {
  await seed(page);
  const openFocus = async () => {
    await page.getByRole('link', { name: 'Помодоро E2E' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Начать фокус' }).click();
  };
  await openFocus();
  await page.getByLabel('Фокус, минут', { exact: true }).fill('50');
  await page.getByLabel('Короткий перерыв, минут', { exact: true }).fill('10');
  await page.getByLabel('Длинный перерыв, минут', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await expect(page.getByRole('timer')).toHaveText('50:00');
  await page.reload();
  await openFocus();
  await expect(page.getByLabel('Фокус, минут', { exact: true })).toHaveValue('50');
  await page.getByRole('button', { name: 'Начать фокус', exact: true }).click();
  await page.getByLabel('Фокус, минут', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await expect(page.getByRole('timer')).toHaveText(/^(49|50):/);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: 'Закончить работу' }).click();
  await openFocus();
  await expect(page.getByRole('timer')).toHaveText('30:00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('finished focus appears in analytics with pauses excluded and exact deadline', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-09T09:00:00+09:00') });
  await seed(page);
  await page.getByRole('link', { name: 'Помодоро E2E' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Начать фокус' }).click();
  await page.getByLabel('Фокус, минут', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await page.getByRole('button', { name: 'Начать фокус', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
  await page.clock.fastForward(20_000);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Продолжить фокус' })).toBeVisible();
  await page.clock.fastForward(40_000);
  await page.getByRole('button', { name: 'Продолжить фокус' }).click();
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
  await page.clock.fastForward(50_000);
  await expect(page.getByRole('timer')).toHaveText('05:00');
  await page.getByRole('button', { name: 'Закрыть панель' }).click();
  await page.goto('/#/v2/analytics?period=week&date=2026-10-05&topic=time');
  const history = page.getByRole('region', { name: 'История фокусов' });
  await expect(history).toContainText('Помодоро E2E');
  await expect(history).toContainText('1 мин');
  await expect(history).toContainText('Завершён');
  await history.getByRole('button', { name: 'Открыть ↗' }).click();
  await expect(page.getByRole('heading', { name: 'Помодоро E2E' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('recovers a persisted pause when the stale timer deadline has passed', async ({ page }) => {
  const startedAt = new Date('2026-10-09T09:00:00+09:00');
  await page.clock.install({ time: startedAt });
  await seed(page);
  const session = ActionSession.start({
    id: EntityId.create('paused-recovery'),
    lifeActionId: EntityId.create('focus-action'),
    startedAt,
    eventId: EntityId.create('recovery-started'),
    kind: 'focus',
  });
  session.pause(new Date(startedAt.getTime() + 20_000), EntityId.create('recovery-paused'));
  const snapshot = startPomodoroPhase(
    createPomodoro('focus-action', 'Помодоро E2E', {
      focusMinutes: 1,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
    }),
    startedAt.getTime(),
    session.id.toString(),
  );
  await page.evaluate(
    async ({ record, snapshot }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('lifeos');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('actionSessions', 'readwrite');
        tx.objectStore('actionSessions').put(record);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      localStorage.setItem('lifeos-action-pomodoro-v1', JSON.stringify(snapshot));
    },
    { record: ActionSessionRecordMapper.toRecord(session), snapshot },
  );
  await page.clock.setSystemTime(new Date(startedAt.getTime() + 90_000));
  await page.reload();
  await page.getByRole('link', { name: 'Помодоро E2E' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Начать фокус' }).click();
  await expect(page.getByRole('button', { name: 'Продолжить фокус' })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('00:40');
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('lifeos-action-pomodoro-v1') ?? 'null'),
    ),
  ).toMatchObject({ phase: 'paused', remainingMs: 40_000, completedFocuses: 0 });
});

test('direction-only actions and completed notes appear in their contexts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  await page.goto('/#/v2/goals', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Пол чистый и готов к гостям.')).toBeVisible();
  await page.getByRole('link', { name: 'Чистый дом', exact: true }).click();
  await expect(page.getByRole('region', { name: 'История успехов' })).toContainText(
    'Пол чистый и готов к гостям.',
  );
  await page.goto('/#/v2/directions/result-direction', { waitUntil: 'domcontentloaded' });
  const results = page.getByRole('region', { name: 'История успехов' });
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

test('window restore failure preserves completed focus and offers a retry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/focus-window-failure.html', async (route) => {
    const response = await page.request.get('/');
    const html = await response.text();
    expect(html).toContain('/src/main.tsx');
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: html.replace('/src/main.tsx', '/tests/e2e/fixtures/focus-window-failure.tsx'),
    });
  });
  await page.goto('/focus-window-failure.html');
  await page.getByRole('button', { name: 'Начать фокус', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть панель' }).click();
  await page.getByRole('button', { name: 'Свернуть тестовое окно' }).click();
  await page.setViewportSize({ width: 340, height: 230 });
  const mini = page.getByRole('region', { name: 'Мини-таймер фокуса' });
  const bounds = await mini.getByRole('button', { name: 'Завершить', exact: true }).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(230);
  await mini.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(mini.getByRole('alert')).toContainText('QA restore failure');
  await expect(mini.getByRole('timer')).toHaveText('00:00');
  await expect(mini.getByRole('button', { name: 'Пауза', exact: true })).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lifeos-action-pomodoro-v1')))
    .toBeNull();
  const statuses = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('lifeos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const statuses = await new Promise<string[]>((resolve, reject) => {
      const r = db.transaction('actionSessions').objectStore('actionSessions').getAll();
      r.onsuccess = () =>
        resolve((r.result as { status: string }[]).map((record) => record.status));
      r.onerror = () => reject(r.error);
    });
    db.close();
    return statuses;
  });
  expect(statuses).toEqual(['completed']);
  await mini.getByRole('button', { name: 'Открыть LifeOS ↗' }).click();
  await expect(mini).toBeHidden();
  expect(errors).toEqual([]);
});
