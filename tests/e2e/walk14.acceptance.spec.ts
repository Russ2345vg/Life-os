import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  DayDate,
  Decision,
  DecisionTitle,
  EntityId,
  PauseInterval,
  Walk,
  WalkCapture,
  WALK_MODE,
  WALK_TYPE,
  type WalkIntent,
} from '../../src/domain';
import { historyWalk } from '../../src/test/helpers/WalkHistoryFixtures';
import { WalkRecordMapper } from '../../src/infrastructure/persistence/mappers/WalkRecordMapper';
import { WalkCaptureRecordMapper } from '../../src/infrastructure/persistence/mappers/WalkCaptureRecordMapper';
import { DecisionRecordMapper } from '../../src/infrastructure/persistence/mappers/DecisionRecordMapper';

const VIEWPORTS = [
  { width: 1366, height: 768, intent: 'free' },
  { width: 1440, height: 900, intent: 'recovery' },
  { width: 1920, height: 1080, intent: 'reflection' },
  { width: 360, height: 800, intent: 'free' },
  { width: 390, height: 844, intent: 'recovery' },
  { width: 430, height: 932, intent: 'reflection' },
] as const;
const LONG_CAPTURE = 'Мысль без потери текста и без автоматического изменения других разделов. '
  .repeat(8)
  .slice(0, 500);
const LONG_QUESTION =
  'Какой следующий шаг стоит спокойно обдумать, прежде чем возвращаться к решению? '
    .repeat(5)
    .slice(0, 400);
const LONG_RESULT = 'Стало понятнее, что сначала нужно проверить исходные предположения. '
  .repeat(14)
  .slice(0, 900);
const LONG_TITLE = 'Обдумать выбор следующего шага и сохранить контекст решения '.repeat(3).trim();
test.use({ timezoneId: 'Asia/Chita' });

const issues = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  issues.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
});
test.afterEach(({ page }) => expect(issues.get(page)).toEqual([]));

async function navigateWalks(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await page
      .getByRole('dialog', { name: 'Меню LifeOS' })
      .getByRole('button', { name: 'Прогулки', exact: true })
      .click();
  } else {
    await page
      .getByRole('navigation', { name: 'Основные разделы' })
      .getByRole('button', { name: 'Прогулки', exact: true })
      .click();
  }
}

async function readStores(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const data: Record<string, Record<string, unknown>[]> = {};
      for (const name of Array.from(db.objectStoreNames)) {
        data[name] = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
          request.onerror = () => reject(request.error);
        });
      }
      return data;
    } finally {
      db.close();
    }
  });
}

function terminalPriorityWalks() {
  const pending = historyWalk('acceptance-older-pending', {
    date: DayDate.create('2026-08-25'),
    impact: 'better',
    reentry: {
      status: 'pending',
      action: {
        kind: 'today',
        destination: 'today',
        entity: null,
        nextStep: null,
      },
      preparedAt: new Date('2026-08-26T08:30:00Z'),
      resolvedAt: null,
    },
  });
  const active = Walk.create({
    id: EntityId.create('acceptance-current-active'),
    date: DayDate.create('2026-08-26'),
    type: WALK_TYPE.mindful,
    intent: 'free',
    now: new Date('2026-08-26T09:00:00Z'),
  }).start({
    mode: WALK_MODE.timer,
    startedAt: new Date('2026-08-26T09:00:00Z'),
    timerTargetMinutes: 30,
    reflectionQuestion: 'Что сейчас важно?',
  });
  return [pending, active].map(WalkRecordMapper.toRecord);
}

async function seedWalks(page: Page, records: ReturnType<typeof terminalPriorityWalks>) {
  await page.evaluate(async (walks) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('walks', 'readwrite');
        for (const walk of walks) transaction.objectStore('walks').put(walk);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }, records);
}

async function reachable(control: Locator) {
  // Like a user scrolling past the fixed header/nav: viewport intersection alone is not enough.
  await control.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  await expect(control).toBeInViewport();
  expect(
    await control.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top !== null && element.contains(top);
    }),
  ).toBe(true);
  expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
}

async function layout(page: Page, selector: string) {
  const panel = page.locator(selector);
  await expect(panel).toBeVisible();
  const bounds = await panel.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      viewport: innerWidth,
      scroll: element.scrollWidth,
      client: element.clientWidth,
    };
  });
  expect(bounds.left, JSON.stringify(bounds)).toBeGreaterThanOrEqual(-1);
  expect(bounds.right, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewport + 1);
  // Center's intentionally clipped ::after decoration extends 160px beyond the panel.
  // Check real rendered content rather than treating that decoration as lost user content.
  const clipped = await panel
    .locator('h1, h2, h3, p, button, summary, textarea, label')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          if (element.getClientRects().length === 0 || element.closest('.visually-hidden'))
            return false;
          const r = element.getBoundingClientRect();
          return (
            r.left < -1 || r.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1
          );
        })
        .map((element) => ({
          tag: element.tagName,
          text: element.textContent?.slice(0, 60),
          scroll: element.scrollWidth,
          client: element.clientWidth,
        })),
    );
  expect(clipped).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function shot(page: Page, info: TestInfo, name: string, target?: Locator) {
  if (target) await target.scrollIntoViewIfNeeded();
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

for (const viewport of VIEWPORTS) {
  const mobile = viewport.width < 600;
  test(`WALK-14 UI journey ${viewport.width}x${viewport.height} ${viewport.intent}`, async ({
    page,
    context,
  }, info) => {
    test.skip(
      (info.project.name === 'mobile-chrome') !== mobile,
      'Viewport belongs to the other project',
    );
    // A complete multi-screen acceptance journey, bounded like the existing WALK-04 smoke.
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-08-26T09:00:00Z'));
    await page.goto('/');
    await navigateWalks(page, mobile);
    await expect(
      page.getByText('Пока недостаточно данных для персональной рекомендации.', { exact: true }),
    ).toBeVisible();
    await layout(page, '.walk-session-center');
    await shot(page, info, '01-center', page.locator('.walk-session-center'));
    await page.locator(`[data-walk-quick-intent="${viewport.intent}"]`).click();
    await expect(page.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeFocused();
    await page.getByRole('checkbox', { name: /Отметить состояние/ }).check();
    await page.getByRole('slider', { name: /Напряжение/ }).fill('8');
    if (viewport.intent === 'reflection')
      await page.getByRole('textbox', { name: /Вопрос для размышления/ }).fill(LONG_QUESTION);
    await layout(page, '.walk-preparation-form');
    const start = page.getByRole('button', { name: 'Начать прогулку', exact: true });
    await reachable(start);
    await shot(
      page,
      info,
      '02-preparation',
      page.getByRole('heading', { name: 'Подготовка к прогулке' }),
    );
    await start.click();
    await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
    await page.clock.setFixedTime(new Date('2026-08-26T09:00:12Z'));
    const timer = page.getByRole('timer');
    await expect(timer).toContainText('00:00:12');
    await layout(page, '.walk-active-panel');
    await shot(page, info, '03-active', page.locator('.walk-active-heading'));
    await page.reload();
    await expect(timer).toContainText('00:00:12');
    const oneActive = await readStores(page);
    expect(oneActive.walks).toHaveLength(1);
    expect(oneActive.walks![0]).toMatchObject({ status: 'running', intent: viewport.intent });

    // Already-loaded local session only. No promise of cold-start offline/PWA caching.
    await context.setOffline(true);
    await page.clock.setFixedTime(new Date('2026-08-26T09:00:15Z'));
    await expect(timer).toContainText('00:00:15');
    await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Мысль', exact: true });
    await expect(field).toBeFocused();
    await field.fill(LONG_CAPTURE);
    await expect(field).toHaveValue(LONG_CAPTURE);
    await expect(field).toHaveAttribute('maxlength', '500');
    if (mobile) await page.setViewportSize({ width: viewport.width, height: 420 });
    await reachable(field);
    const save = page.getByRole('button', { name: 'Сохранить', exact: true });
    await reachable(save);
    await layout(page, '.walk-capture-form');
    await shot(page, info, '04-capture', field);
    await save.click();
    await expect(page.getByRole('button', { name: 'Сохранить мысль', exact: true })).toBeFocused();
    if (mobile) await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
    await page.clock.setFixedTime(new Date('2026-08-26T09:00:45Z'));
    await expect(timer).toContainText('00:00:15');
    const offline = await readStores(page);
    expect(offline.walks![0]).toMatchObject({ status: 'paused' });
    expect(offline.walkCaptures).toHaveLength(1);
    expect(offline.walkCaptures![0]).toMatchObject({ content: LONG_CAPTURE, status: 'pending' });
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
    await expect(timer).toContainText('00:00:15');
    await shot(page, info, '05-paused', page.locator('.walk-active-heading'));
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
    await page.clock.setFixedTime(new Date('2026-08-26T09:00:50Z'));
    await expect(timer).toContainText('00:00:20');
    await page.getByRole('button', { name: 'Завершить', exact: true }).click();
    const confirmation = page.getByRole('group', { name: 'Подтверждение завершения' });
    await expect(confirmation.getByRole('button', { name: 'Остаться' })).toBeFocused();
    await confirmation.getByRole('button', { name: 'Завершить', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Быстрый итог' })).toBeFocused();
    await layout(page, '.walk-completion-panel');
    await page.getByRole('slider', { name: /Напряжение/ }).fill('5');
    await page.getByText('Лучше', { exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Лучше', exact: true })).toBeChecked();
    await page.locator('.walk-completion-reflection textarea').fill(LONG_RESULT);
    await reachable(page.getByRole('button', { name: 'Сохранить итог', exact: true }));
    await shot(page, info, '06-completion', page.getByRole('heading', { name: 'Быстрый итог' }));
    await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Что дальше?' })).toBeFocused();
    const pending = await readStores(page);
    expect(pending.walks).toHaveLength(1);
    expect(pending.walks![0]).toMatchObject({
      status: 'completed',
      result: LONG_RESULT.trim(),
      reentry: { status: 'pending' },
    });
    await page.reload();
    await page
      .getByRole('region', { name: 'Возвращение после прогулки' })
      .getByRole('button', { name: 'Продолжить', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Что дальше?' })).toBeVisible();
    expect(await readStores(page)).toEqual(pending);
    await layout(page, '.walk-reentry-panel');
    await reachable(page.getByRole('button', { name: 'Перейти на «Сегодня»', exact: true }));
    await shot(page, info, '07-reentry', page.getByRole('heading', { name: 'Что дальше?' }));
    await page.getByRole('button', { name: 'Перейти на «Сегодня»', exact: true }).click();
    await expect(page.getByRole('button', { name: 'День', exact: true }).last()).toHaveAttribute(
      'aria-current',
      'page',
    );
    await navigateWalks(page, mobile);
    await page.getByRole('button', { name: 'Входящие с прогулок · 1', exact: true }).click();
    await expect(page.locator('.walk-capture-list-item')).toHaveCount(1);
    await layout(page, '.walk-capture-panel');
    await shot(
      page,
      info,
      '08-inbox',
      page.getByRole('heading', { name: 'Входящие с прогулок', exact: true }),
    );
    await page.getByRole('button', { name: 'К прогулкам', exact: true }).click();
    const beforeReadOnlyNavigation = await readStores(page);
    await page.getByRole('button', { name: 'История прогулок', exact: true }).click();
    await expect(page.locator('[data-walk-history-row]')).toHaveCount(1);
    await layout(page, '.walk-history');
    await shot(
      page,
      info,
      '09-history',
      page.getByRole('heading', { name: 'История прогулок', exact: true }),
    );
    await page.locator('[data-walk-history-row]').click();
    await expect(page.locator('.walk-history-captures li')).toHaveCount(1);
    await expect(page.locator('.walk-history-detail')).toContainText(LONG_RESULT.trim());
    await layout(page, '.walk-history-detail');
    await shot(page, info, '10-detail', page.locator('#walk-history-detail-title'));
    await page.getByRole('button', { name: '← История прогулок', exact: true }).click();
    await page.getByRole('button', { name: '← К прогулкам', exact: true }).click();
    await page.getByRole('button', { name: 'Аналитика прогулок', exact: true }).click();
    await expect(page.locator('[data-walk-analytics-kpi="count"] dd')).toHaveText('1');
    await expect(page.getByRole('region', { name: 'Наблюдения', exact: true })).toContainText(
      'Пока недостаточно сопоставимых данных',
    );
    await layout(page, '.walk-analytics');
    await shot(
      page,
      info,
      '11-analytics',
      page.getByRole('heading', { name: 'Аналитика прогулок', exact: true }),
    );
    await page.getByRole('button', { name: '← К прогулкам', exact: true }).click();
    await expect(
      page.getByText('Пока недостаточно данных для персональной рекомендации.', { exact: true }),
    ).toBeVisible();
    expect(await readStores(page)).toEqual(beforeReadOnlyNavigation);
    await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(0);
  });
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`WALK-14 preparation readable labels and keyboard submit ${viewport.width}`, async ({
    page,
  }, info) => {
    const mobile = viewport.width < 600;
    test.skip(
      (info.project.name === 'mobile-chrome') !== mobile,
      'Viewport belongs to the other project',
    );
    await page.setViewportSize(viewport);
    await page.goto('/');
    await navigateWalks(page, mobile);
    await page.locator('[data-walk-quick-intent="reflection"]').click();
    await page.getByRole('checkbox', { name: /Отметить состояние/ }).check();
    await expect(page.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeVisible();
    const labels = await page
      .locator('.walk-state-range, .walk-reflection-template-option')
      .evaluateAll((items) =>
        items.map((item) => ({
          width: item.clientWidth,
          content: item.scrollWidth,
        })),
      );
    for (const label of labels) expect(label.content).toBeLessThanOrEqual(label.width + 1);
    const back = page.getByRole('button', { name: 'Назад', exact: true });
    await back.focus();
    await back.press('Tab');
    const start = page.getByRole('button', { name: 'Начать прогулку', exact: true });
    await expect(start).toBeFocused();
    expect(
      await start.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return button.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
    ).toBe(true);
    await shot(page, info, 'preparation-keyboard-submit');
  });
}

test('WALK-14 completion reload before optional outcome never reactivates the Walk', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile-chrome';
  await page.goto('/');
  await navigateWalks(page, mobile);
  await page.locator('[data-walk-quick-intent="free"]').click();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение завершения' })
    .getByRole('button', { name: 'Завершить', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Быстрый итог' })).toBeVisible();
  const completed = await readStores(page);
  expect(completed.walks).toHaveLength(1);
  expect(completed.walks![0]).toMatchObject({ status: 'completed', result: null, reentry: null });
  await page.reload();
  await navigateWalks(page, mobile);
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'История прогулок', exact: true }).click();
  await expect(page.locator('[data-walk-history-row]')).toHaveCount(1);
  await page.locator('[data-walk-history-row]').click();
  await expect(page.getByText('Без итога', { exact: true })).toBeVisible();
  expect(await readStores(page)).toEqual(completed);
});

test('WALK-14 abandon restores an older pending Reentry without reload', async ({ page }) => {
  await page.goto('/');
  await seedWalks(page, terminalPriorityWalks());
  await page.reload();
  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Прервать', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение прерывания' })
    .getByRole('button', { name: 'Прервать', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Что дальше?' })).toBeVisible();
  const stored = await readStores(page);
  expect(stored.walks).toHaveLength(2);
  expect(stored.walks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'acceptance-older-pending',
        reentry: expect.objectContaining({ status: 'pending' }),
      }),
      expect.objectContaining({ id: 'acceptance-current-active', status: 'abandoned' }),
    ]),
  );
});

test('WALK-14 completion refreshes an older pending Reentry without reload', async ({ page }) => {
  await page.goto('/');
  await seedWalks(page, terminalPriorityWalks());
  await page.reload();
  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение завершения' })
    .getByRole('button', { name: 'Завершить', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Быстрый итог' })).toBeVisible();
  await page.getByRole('button', { name: 'День', exact: true }).last().click();
  await expect(page.getByRole('region', { name: 'Возвращение после прогулки' })).toBeVisible();
});

function largeDataset() {
  const now = new Date('2026-08-01T00:00:00Z');
  const intents: readonly WalkIntent[] = ['recovery', 'reflection', 'free'];
  const minutes = [10, 30, 20];
  const after = [
    { energy: 7, tension: 5, clarity: 6 },
    { energy: 6, tension: 7, clarity: 8 },
    { energy: 5, tension: 7, clarity: 7 },
  ];
  const walks = Array.from({ length: 60 }, (_, i) => {
    const group = Math.floor(i / 20);
    const day = `2026-08-${17 + (i % 10)}`;
    const startedAt = new Date(`${day}T08:00:00Z`);
    const endedAt = new Date(
      startedAt.getTime() + (minutes[group]! + (group === 0 ? 5 : 0)) * 60000,
    );
    return historyWalk(`acceptance-${i}`, {
      date: DayDate.create(day),
      intent: intents[group]!,
      startedAt,
      endedAt,
      createdAt: now,
      updatedAt: endedAt,
      pauseIntervals:
        group === 0
          ? [
              PauseInterval.create(
                new Date(startedAt.getTime() + 5 * 60000),
                new Date(startedAt.getTime() + 10 * 60000),
              ),
            ]
          : [],
      beforeState: { energy: 5, tension: 8, clarity: 5 },
      afterState: after[group]!,
      impact: 'better',
      reflectionQuestion: LONG_QUESTION,
      result: LONG_RESULT.trim(),
      ...(i === 59
        ? {
            linkedEntity: { type: 'decision' as const, id: EntityId.create('acceptance-decision') },
          }
        : {}),
    });
  });
  return {
    walks: walks.map(WalkRecordMapper.toRecord),
    walkCaptures: Array.from({ length: 21 }, (_, i) =>
      WalkCaptureRecordMapper.toRecord(
        WalkCapture.create({
          id: EntityId.create(`acceptance-capture-${i}`),
          walkId: EntityId.create('acceptance-59'),
          content: `${i}: ${LONG_CAPTURE}`.slice(0, 500),
          capturedAt: new Date('2026-08-26T08:10:00Z'),
          walkElapsedMs: 600000,
        }),
      ),
    ),
    decisions: [
      DecisionRecordMapper.toRecord(
        Decision.createDraft({
          id: EntityId.create('acceptance-decision'),
          title: DecisionTitle.create(LONG_TITLE),
          kind: 'additional',
          occurredAt: now,
          eventId: EntityId.create('acceptance-created'),
        }),
      ),
    ],
  };
}

for (const viewport of VIEWPORTS) {
  const mobile = viewport.width < 600;
  test(`WALK-14 long data and literal analytics ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    test.skip(
      (info.project.name === 'mobile-chrome') !== mobile,
      'Viewport belongs to the other project',
    );
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-08-26T09:00:00Z'));
    await page.goto('/');
    await navigateWalks(page, mobile);
    await expect(page.getByRole('button', { name: 'История прогулок', exact: true })).toBeVisible();
    // Fixture initialization only, in a fresh test context. No storage writes during the journey.
    await page.evaluate(async (data) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('lifeos');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(Object.keys(data), 'readwrite');
          for (const [name, records] of Object.entries(data))
            for (const record of records) tx.objectStore(name).put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    }, largeDataset());
    await page.reload();
    await navigateWalks(page, mobile);
    const before = await readStores(page);
    const recommendation = page.getByRole('region', { name: 'Рекомендация LifeOS', exact: true });
    await expect(recommendation).toContainText('Восстановительная');
    const why = recommendation.locator('summary');
    await why.focus();
    await why.press('Enter');
    await expect(recommendation).toContainText('20 из 20');
    await expect(recommendation).toContainText('Устойчивая закономерность');
    await layout(page, '.walk-recommendation');
    await shot(page, info, '12-recommendation', why);
    await page.getByRole('button', { name: 'Входящие с прогулок · 21', exact: true }).click();
    await expect(page.locator('.walk-capture-list-item')).toHaveCount(21);
    await layout(page, '.walk-capture-panel');
    await reachable(page.locator('.walk-capture-list-item button').last());
    await page.getByRole('button', { name: 'К прогулкам', exact: true }).click();
    await page.getByRole('button', { name: 'История прогулок', exact: true }).click();
    await expect(page.locator('[data-walk-history-row]')).toHaveCount(20);
    await page.getByRole('button', { name: 'Следующие', exact: true }).click();
    await page.getByRole('button', { name: 'Следующие', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('41–60 из 60');
    await reachable(page.locator('[data-walk-history-row]').last());
    await page.getByRole('button', { name: 'Предыдущие', exact: true }).click();
    await page.getByRole('button', { name: 'Предыдущие', exact: true }).click();
    await page.locator('[data-walk-history-row="acceptance-59"]').click();
    await expect(page.locator('.walk-history-captures li')).toHaveCount(21);
    await expect(page.locator('.walk-history-detail')).toContainText(LONG_TITLE);
    await layout(page, '.walk-history-detail');
    await page.locator('.walk-history-captures li').last().scrollIntoViewIfNeeded();
    await shot(page, info, '13-long-captures');
    await page.getByRole('button', { name: '← История прогулок', exact: true }).click();
    await page.getByRole('button', { name: '← К прогулкам', exact: true }).click();
    await page.getByRole('button', { name: 'Аналитика прогулок', exact: true }).click();
    // Independent arithmetic: 20×10 + 20×30 + 20×20 =1200min; 1200/60=20min; ten dates.
    for (const [key, value] of Object.entries({
      count: '60',
      total: '20 ч',
      average: '20 мин',
      days: '10',
    }))
      await expect(page.locator(`[data-walk-analytics-kpi="${key}"] dd`)).toHaveText(value);
    // Energy (2+1+0)/3=1; tension (-3-1-1)/3=-1.666...; clarity (1+3+2)/3=2.
    for (const [metric, delta] of Object.entries({
      energy: '+1',
      tension: '−1,7',
      clarity: '+2',
    })) {
      await expect(page.locator(`[data-walk-analytics-metric="${metric}"] strong`)).toHaveText(
        delta,
      );
      await expect(page.locator(`[data-walk-analytics-metric="${metric}"]`)).toContainText(
        'На основе 60 прогулок',
      );
    }
    for (const mode of ['free', 'recovery', 'reflection'])
      await expect(
        page.locator(`[data-walk-analytics-mode="${mode}"] .walk-analytics-mode-facts dd`).first(),
      ).toHaveText('20');
    await expect(page.getByText('Всего мыслей: 21.', { exact: false })).toBeVisible();
    await layout(page, '.walk-analytics');
    await shot(
      page,
      info,
      '14-analytics-large',
      page.getByRole('heading', { name: 'Аналитика прогулок', exact: true }),
    );
    expect(await readStores(page)).toEqual(before);
  });
}
