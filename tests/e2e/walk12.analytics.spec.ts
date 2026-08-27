import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  DayDate,
  Decision,
  DecisionTitle,
  EntityId,
  RoutineBlock,
  RoutineBlockRecurrence,
  WalkCapture,
  type WalkIntent,
} from '../../src/domain';
import { WalkRecordMapper } from '../../src/infrastructure/persistence/mappers/WalkRecordMapper';
import { WalkCaptureRecordMapper } from '../../src/infrastructure/persistence/mappers/WalkCaptureRecordMapper';
import { DecisionRecordMapper } from '../../src/infrastructure/persistence/mappers/DecisionRecordMapper';
import { RoutineBlockRecordMapper } from '../../src/infrastructure/persistence/mappers/RoutineBlockRecordMapper';
import { historyWalk } from '../../src/test/helpers/WalkHistoryFixtures';

test.use({ timezoneId: 'Asia/Chita' });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    // Same policy as WALK-09/10/11 and the main smoke: the baseline has no favicon.
    if (message.location().url.endsWith('/favicon.ico')) return;
    if (message.type() === 'error') messages.push(`${message.text()} ${message.location().url}`);
  });
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function openWalks(page: Page, mobile: boolean) {
  await page.clock.setFixedTime(new Date('2026-08-26T09:00:00Z'));
  await page.goto('/');
  await navigateWalks(page, mobile);
}
async function navigateWalks(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await page
      .getByRole('dialog', { name: 'Меню LifeOS' })
      .getByRole('button', { name: 'Прогулки', exact: true })
      .click();
  } else
    await page
      .getByRole('navigation', { name: 'Основные разделы' })
      .getByRole('button', { name: 'Прогулки', exact: true })
      .click();
  await expect(page.locator('#application-content')).toBeVisible();
}
async function openAnalytics(page: Page) {
  await expect(page.getByRole('button', { name: 'Аналитика прогулок', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Аналитика прогулок', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Аналитика прогулок', exact: true }),
  ).toBeVisible();
}
async function shot(page: Page, info: TestInfo, name: string, fullPage = false) {
  if (fullPage) {
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  }
  await page.mouse.move(0, 0);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

test('WALK-12 empty analytics starts the existing Walk flow', async ({ page }, info) => {
  await openWalks(page, info.project.name === 'mobile-chrome');
  await openAnalytics(page);
  await expect(page.getByText('Недостаточно данных для аналитики.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '30 дней', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await shot(page, info, 'analytics-empty');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.locator('input[name="walk-intent"]')).toHaveCount(3);
});

type Scenario = 'full' | 'low' | 'unpaired' | 'activeOnly';
function fixtures(scenario: Scenario) {
  const now = new Date('2026-08-26T07:00:00Z');
  const dates = [
    '2026-08-10',
    '2026-08-11',
    '2026-08-12',
    '2026-08-20',
    '2026-08-21',
    '2026-08-22',
    '2026-08-24',
    '2026-08-25',
    '2026-08-26',
  ];
  const intents: readonly WalkIntent[] = ['free', 'recovery', 'reflection'];
  const count = scenario === 'activeOnly' ? 0 : scenario === 'low' ? 2 : 9;
  const walks = Array.from({ length: count }, (_, i) => {
    const group = Math.floor(i / 3);
    const date = scenario === 'low' ? '2026-08-26' : dates[i]!;
    return historyWalk(`analytics-${i}`, {
      date: DayDate.create(date),
      intent: intents[group]!,
      startedAt: new Date(`${date}T08:00:00Z`),
      endedAt: new Date(`${date}T08:${20 + group * 10}:00Z`),
      createdAt: new Date(`${date}T07:00:00Z`),
      updatedAt: new Date(`${date}T09:00:00Z`),
      beforeState: { energy: 3, tension: 8, clarity: 4 },
      afterState: scenario === 'unpaired' && i > 0 ? null : { energy: 5, tension: 5, clarity: 6 },
      impact: i % 3 === 0 ? 'better' : i % 3 === 1 ? 'same' : 'worse',
      result: i % 2 === 0 ? 'Сохранён вывод после прогулки.' : null,
      ...(scenario === 'full' && i === 8
        ? {
            linkedEntity: { type: 'decision' as const, id: EntityId.create('analytics-decision') },
            reentry: {
              status: 'pending' as const,
              preparedAt: new Date('2026-08-26T09:00:00Z'),
              resolvedAt: null,
              action: {
                kind: 'today' as const,
                destination: 'today' as const,
                entity: null,
                nextStep: null,
              },
            },
          }
        : {}),
    });
  });
  if (scenario === 'full')
    walks.push(
      historyWalk('analytics-legacy', {
        intent: null,
        endedAt: new Date('2026-08-26T08:00:00Z'),
      }),
    );
  if (scenario === 'full' || scenario === 'activeOnly')
    walks.push(
      historyWalk('analytics-active', {
        status: 'paused',
        endedAt: null,
        pausedAt: new Date('2026-08-26T08:10:00Z'),
      }),
    );
  const captures =
    scenario === 'full'
      ? [
          WalkCapture.create({
            id: EntityId.create('analytics-capture-1'),
            walkId: EntityId.create('analytics-8'),
            content: 'Первая мысль',
            capturedAt: new Date('2026-08-26T08:10:00Z'),
            walkElapsedMs: 600000,
          }),
          WalkCapture.create({
            id: EntityId.create('analytics-capture-2'),
            walkId: EntityId.create('analytics-8'),
            content: 'Уже обработанная мысль',
            capturedAt: new Date('2026-08-26T08:20:00Z'),
            walkElapsedMs: 1200000,
          }).process(new Date('2026-08-26T09:00:00Z')),
          WalkCapture.create({
            id: EntityId.create('analytics-capture-old'),
            walkId: EntityId.create('analytics-0'),
            content: 'Мысль из старой прогулки',
            capturedAt: new Date('2026-08-10T08:10:00Z'),
            walkElapsedMs: 600000,
          }),
        ]
      : [];
  const decision = Decision.createDraft({
    id: EntityId.create('analytics-decision'),
    title: DecisionTitle.create('Не менять решение при просмотре аналитики'),
    kind: 'additional',
    occurredAt: now,
    eventId: EntityId.create('analytics-decision-created'),
  });
  const routine = RoutineBlock.create({
    id: EntityId.create('analytics-routine'),
    anchorDate: DayDate.create('2026-08-26'),
    title: 'Прогулка после работы',
    startTime: '17:00',
    endTime: '17:30',
    category: 'physical',
    recurrence: RoutineBlockRecurrence.create('none'),
    required: false,
    assignment: { kind: 'walk' },
    now,
  });
  return {
    walks: walks.map(WalkRecordMapper.toRecord),
    walkCaptures: captures.map(WalkCaptureRecordMapper.toRecord),
    decisions: [DecisionRecordMapper.toRecord(decision)],
    routineBlocks: [RoutineBlockRecordMapper.toRecord(routine)],
  };
}
async function seed(page: Page, mobile: boolean, scenario: Scenario = 'full') {
  await openWalks(page, mobile);
  await expect(page.getByRole('button', { name: 'Аналитика прогулок', exact: true })).toBeVisible();
  // Only Playwright's fresh isolated context receives synthetic records, never the user's browser.
  await page.evaluate(async (data) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(Object.keys(data), 'readwrite');
        for (const [name, records] of Object.entries(data))
          for (const record of records) transaction.objectStore(name).put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }, fixtures(scenario));
  await page.reload();
  await navigateWalks(page, mobile);
  await openAnalytics(page);
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const result: Record<string, unknown[]> = {};
      for (const name of [
        'walks',
        'walkCaptures',
        'decisions',
        'routineBlocks',
        'routineOccurrenceExecutions',
        'lifeActions',
        'actionSessions',
      ]) {
        result[name] = await new Promise<unknown[]>((resolve, reject) => {
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
          request.onerror = () => reject(request.error);
        });
      }
      return result;
    } finally {
      db.close();
    }
  });
}
async function expectKpi(page: Page, key: string, value: string) {
  await expect(page.locator(`[data-walk-analytics-kpi="${key}"] dd`)).toHaveText(value);
}

test('WALK-12 30-to-7 facts and History navigation never mutate persisted records', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile-chrome';
  await seed(page, mobile);
  const before = await records(page);
  await expectKpi(page, 'count', '10');
  await expectKpi(page, 'total', '4 ч 30 мин');
  await expectKpi(page, 'average', '27 мин');
  await expectKpi(page, 'days', '9');
  const energy = page.locator('[data-walk-analytics-metric="energy"]');
  await expect(energy).toContainText('На основе 9 прогулок');
  await expect(energy).toContainText('Наблюдается устойчивая закономерность');
  await expect(energy.locator('strong')).toHaveText('+2');
  await expect(page.locator('[data-walk-analytics-metric="tension"] strong')).toHaveText('−3');
  await expect(page.locator('[data-walk-analytics-day]')).toHaveCount(30);
  await expect(
    page.locator('[data-walk-analytics-mode="free"] .walk-analytics-mode-facts dd').first(),
  ).toHaveText('3');
  await expect(page.getByText('Всего мыслей: 3.', { exact: false })).toHaveCount(1);
  await shot(page, info, mobile ? 'analytics-mobile' : 'analytics-desktop', !mobile);

  await page.getByRole('button', { name: '7 дней', exact: true }).click();
  await expectKpi(page, 'count', '7');
  await expectKpi(page, 'total', '3 ч 30 мин');
  await expectKpi(page, 'average', '30 мин');
  await expectKpi(page, 'days', '6');
  await expect(energy).toContainText('На основе 6 прогулок');
  await expect(energy).toContainText('Предварительное наблюдение');
  await expect(page.locator('[data-walk-analytics-day]')).toHaveCount(7);
  await expect(
    page.locator('[data-walk-analytics-mode="free"] .walk-analytics-mode-facts dd').first(),
  ).toHaveText('0');
  await shot(page, info, 'analytics-7-day', !mobile);

  await page.getByRole('button', { name: 'Посмотреть прогулки: Свободная', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'История прогулок', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Свободные', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-walk-history-row]')).toHaveCount(3);
  await page.locator('[data-walk-history-row]').first().click();
  await expect(page.getByRole('heading', { name: 'Свободная', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← История прогулок', exact: true }).click();
  await page.getByRole('button', { name: '← К аналитике', exact: true }).click();
  await expect(page.getByRole('button', { name: '7 дней', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectKpi(page, 'count', '7');
  await expect(
    page.getByRole('heading', { name: 'Аналитика прогулок', exact: true }),
  ).toBeFocused();
  expect(await records(page)).toEqual(before);
  await page.getByRole('button', { name: '← К прогулкам', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Аналитика прогулок', exact: true })).toBeFocused();
  expect(await records(page)).toEqual(before);
});

test('WALK-12 restores entry focus after Analytics and History return to an idle Walk center', async ({
  page,
}, info) => {
  await seed(page, info.project.name === 'mobile-chrome', 'low');
  const before = await records(page);
  await page.getByRole('button', { name: '← К прогулкам', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Аналитика прогулок', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'История прогулок', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'История прогулок', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← К прогулкам', exact: true }).click();
  await expect(page.getByRole('button', { name: 'История прогулок', exact: true })).toBeFocused();
  expect(await records(page)).toEqual(before);
});

test('WALK-12 low data and unpaired observations never acquire a pattern from total walk count', async ({
  page,
}, info) => {
  await seed(page, info.project.name === 'mobile-chrome', 'low');
  await expectKpi(page, 'count', '2');
  await expect(page.locator('[data-walk-analytics-metric="energy"]')).toContainText(
    'На основе 2 прогулок',
  );
  await expect(
    page.getByText(/Предварительное наблюдение|Наблюдается устойчивая закономерность/),
  ).toHaveCount(0);
  await shot(page, info, 'analytics-low-data', info.project.name === 'desktop-chrome');
});

test('WALK-12 missing pairs cannot borrow the overall sample size', async ({ page }, info) => {
  await seed(page, info.project.name === 'mobile-chrome', 'unpaired');
  await expectKpi(page, 'count', '9');
  await expect(page.locator('[data-walk-analytics-metric="energy"]')).toContainText(
    'На основе 1 прогулки',
  );
  await expect(
    page.getByText(/Предварительное наблюдение|Наблюдается устойчивая закономерность/),
  ).toHaveCount(0);
});

test('WALK-12 empty-period start respects an existing paused Walk', async ({ page }, info) => {
  await seed(page, info.project.name === 'mobile-chrome', 'activeOnly');
  const before = await records(page);
  await expect(page.getByText('Недостаточно данных для аналитики.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.locator('input[name="walk-intent"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeVisible();
  expect(await records(page)).toEqual(before);
});

test('WALK-12 failed period read hides old facts and retry recovers without writes', async ({
  page,
}, info) => {
  await seed(page, info.project.name === 'mobile-chrome');
  await expectKpi(page, 'count', '10');
  const before = await records(page);
  const restore = await page.evaluateHandle(() => {
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
      if (this.name === 'walks') throw new DOMException('Synthetic read failure', 'UnknownError');
      return original.apply(this, args);
    };
    return () => {
      IDBObjectStore.prototype.getAll = original;
    };
  });
  await page.getByRole('button', { name: '7 дней', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить аналитику');
  await expect(page.locator('[data-walk-analytics-kpi]')).toHaveCount(0);
  await restore.evaluate((recover) => recover());
  await restore.dispose();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expectKpi(page, 'count', '7');
  expect(await records(page)).toEqual(before);
});

for (const width of [360, 390, 430]) {
  test(`WALK-12 mobile ${width} keeps charts, touch targets and facts inside the viewport`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile-chrome', 'Mobile-only responsive matrix');
    await page.setViewportSize({ width, height: 844 });
    await seed(page, true);
    await expectKpi(page, 'count', '10');
    await expect
      .poll(() =>
        page.locator('.walk-analytics').evaluate((root) =>
          [...root.querySelectorAll('*')]
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1);
            })
            .map((element) => element.tagName),
        ),
      )
      .toEqual([]);
    const buttons = await page
      .locator('.walk-analytics button')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(buttons.every((height) => height >= 44)).toBe(true);
    await shot(page, info, `analytics-mobile-${width}`);
    await page
      .getByRole('heading', { name: 'Прогулки по дням', exact: true })
      .scrollIntoViewIfNeeded();
    const chart = await page.locator('.walk-analytics-day-bars').boundingBox();
    expect(chart!.x).toBeGreaterThanOrEqual(0);
    expect(chart!.x + chart!.width).toBeLessThanOrEqual(width);
    await shot(page, info, `analytics-mobile-${width}-chart`);
    await page.locator('.walk-analytics-footer button').focus();
    await expect(page.locator('.walk-analytics-footer button')).toBeFocused();
    await expect
      .poll(async () => {
        const button = await page.locator('.walk-analytics-footer button').boundingBox();
        const navigation = await page
          .getByRole('navigation', { name: 'Мобильная навигация', exact: true })
          .boundingBox();
        return button !== null && navigation !== null && button.y + button.height <= navigation.y;
      })
      .toBe(true);
    await shot(page, info, `analytics-mobile-${width}-footer`);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-walk-history-row]')).toHaveCount(10);
  });
}

test('WALK-12 narrow desktop keeps outcome facts and mode cards readable', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chrome', 'Desktop-only width check');
  await page.setViewportSize({ width: 1024, height: 900 });
  await seed(page, false);
  await expectKpi(page, 'count', '10');
  const bounds = await page.locator('.walk-analytics').evaluate((root) =>
    [...root.querySelectorAll('*')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1);
      })
      .map((element) => element.tagName),
  );
  expect(bounds).toEqual([]);
  const countLabels = await page
    .locator('.walk-analytics-mode-facts > div:first-child dt')
    .evaluateAll((labels) =>
      labels.map((label) => ({
        height: label.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(label).lineHeight),
      })),
    );
  expect(countLabels.every(({ height, lineHeight }) => height <= lineHeight + 1)).toBe(true);
  await expect(page.locator('.walk-analytics-outcomes > div')).toHaveCount(5);
  await shot(page, info, 'analytics-desktop-1024', true);
});
