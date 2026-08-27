import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  DayDate,
  Decision,
  DecisionTitle,
  EntityId,
  Goal,
  RoutineBlock,
  RoutineBlockRecurrence,
} from '../../src/domain';
import { WalkRecordMapper } from '../../src/infrastructure/persistence/mappers/WalkRecordMapper';
import { DecisionRecordMapper } from '../../src/infrastructure/persistence/mappers/DecisionRecordMapper';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import { RoutineBlockRecordMapper } from '../../src/infrastructure/persistence/mappers/RoutineBlockRecordMapper';
import { historyWalk } from '../../src/test/helpers/WalkHistoryFixtures';

test.use({ timezoneId: 'Asia/Chita' });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) messages.push(m.text());
  });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function navigate(page: Page, mobile: boolean) {
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
}
async function seed(page: Page, mobile: boolean, count = 8, olderCount = 0) {
  await page.clock.setFixedTime(new Date('2026-08-26T09:00:00Z'));
  await page.goto('/');
  await navigate(page, mobile);
  await expect(page.getByRole('button', { name: 'Аналитика прогулок', exact: true })).toBeVisible();
  const now = new Date('2026-08-01T00:00:00Z');
  const date = DayDate.create('2026-08-26');
  const walks = Array.from({ length: count }, (_, i) =>
    historyWalk(`walk13-${i}`, {
      intent: 'recovery',
      date: DayDate.create(i < olderCount ? '2026-08-10' : '2026-08-25'),
      beforeState: { energy: 3, tension: 8, clarity: 3 },
      afterState: { energy: 5, tension: 6, clarity: 5 },
      createdAt: now,
      startedAt: new Date(i < olderCount ? '2026-08-10T00:00:00Z' : '2026-08-25T00:00:00Z'),
      endedAt: new Date(i < olderCount ? '2026-08-10T00:30:00Z' : '2026-08-25T00:30:00Z'),
      updatedAt: new Date(i < olderCount ? '2026-08-10T00:30:00Z' : '2026-08-25T00:30:00Z'),
    }),
  );
  const data = {
    walks: walks.map(WalkRecordMapper.toRecord),
    decisions: [
      DecisionRecordMapper.toRecord(
        Decision.createDraft({
          id: EntityId.create('walk13-decision'),
          title: DecisionTitle.create('Обдумать следующий шаг'),
          kind: 'additional',
          occurredAt: now,
          eventId: EntityId.create('walk13-decision-created'),
        }),
      ),
    ],
    goals: [
      GoalRecordMapper.toRecord(
        Goal.create({ id: EntityId.create('walk13-goal'), title: 'Сохранить цель', now }),
      ),
    ],
    routineBlocks: [
      RoutineBlockRecordMapper.toRecord(
        RoutineBlock.create({
          id: EntityId.create('walk13-routine'),
          anchorDate: date,
          title: 'Вечерняя прогулка',
          startTime: '18:00',
          endTime: '18:30',
          category: 'physical',
          recurrence: RoutineBlockRecurrence.create('none'),
          required: false,
          assignment: { kind: 'walk' },
          now,
        }),
      ),
    ],
  };
  // Synthetic records only in Playwright's isolated context. Never touch the user's profile.
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
  }, data);
  await page.reload();
  await navigate(page, mobile);
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('lifeos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      const data: Record<string, unknown[]> = {};
      for (const name of Array.from(db.objectStoreNames))
        data[name] = await new Promise<unknown[]>((resolve, reject) => {
          const r = db.transaction(name).objectStore(name).getAll();
          r.onsuccess = () => resolve(r.result as unknown[]);
          r.onerror = () => reject(r.error);
        });
      return data;
    } finally {
      db.close();
    }
  });
}
async function shot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.mouse.move(0, 0);
  if (name === 'explanation') {
    await page
      .getByRole('region', { name: 'Рекомендация LifeOS', exact: true })
      .screenshot({ path, animations: 'disabled' });
  } else {
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.screenshot({
      path,
      fullPage: name === 'analytics-insights',
      animations: 'disabled',
    });
  }
  await info.attach(name, { path, contentType: 'image/png' });
}

test('WALK-13 recommendation and Why stay read-only; explicit start preserves current state', async ({
  page,
}, info) => {
  await seed(page, info.project.name === 'mobile-chrome');
  const card = page.getByRole('region', { name: 'Рекомендация LifeOS', exact: true });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Восстановительная');
  await expect(page.locator('.walk-session-center .primary-button')).toHaveCount(1);
  const before = await records(page);
  await shot(page, info, 'center-recommendation');
  await page.getByText('Указать текущее состояние', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Отметить состояние перед прогулкой' }).check();
  const tension = page.getByRole('slider', { name: /Напряжение/ });
  await tension.focus();
  await tension.press('ArrowRight');
  await tension.press('ArrowRight');
  await expect(card).toContainText('В похожих восстановительных прогулках');
  await card.getByText('Почему LifeOS это предлагает?', { exact: true }).click();
  await expect(card).toContainText('Напряжение 7/10');
  await expect(card).toContainText('8 из 8');
  await expect(card).toContainText('−2');
  await expect(card).toContainText('Устойчивая закономерность');
  await shot(page, info, 'explanation');
  expect(await records(page)).toEqual(before);
  await card.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeVisible();
  await expect(page.getByRole('slider', { name: /Напряжение/ })).toHaveValue('7');
  expect(await records(page)).toEqual(before);
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
  const after = await records(page);
  expect(after.walks).toHaveLength(before.walks!.length + 1);
  expect(after.walks).toContainEqual(
    expect.objectContaining({
      intent: 'recovery',
      beforeState: { energy: 5, tension: 7, clarity: 5 },
      status: 'running',
    }),
  );
  for (const name of ['decisions', 'goals', 'routineBlocks', 'routineOccurrenceExecutions'])
    expect(after[name]).toEqual(before[name]);
});

test('WALK-13 ordinary and alternate mode selection remain available', async ({ page }, info) => {
  await seed(page, info.project.name === 'mobile-chrome');
  const before = await records(page);
  await page.getByRole('button', { name: 'Обычный выбор', exact: true }).click();
  await expect(page.locator('input[name="walk-intent"]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.locator('[data-walk-quick-intent="reflection"]').click();
  await expect(page.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeVisible();
  expect(await records(page)).toEqual(before);
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
  expect((await records(page)).walks).toContainEqual(
    expect.objectContaining({ intent: 'reflection', status: 'running', beforeState: null }),
  );
});

test('WALK-13 Analytics observations are factual and bounded', async ({ page }, info) => {
  await seed(page, info.project.name === 'mobile-chrome');
  const before = await records(page);
  await page.getByRole('button', { name: 'Аналитика прогулок', exact: true }).click();
  const insights = page.getByRole('region', { name: 'Наблюдения', exact: true });
  await expect(insights).toBeVisible();
  await expect(insights).toContainText('8 из 8');
  expect(await insights.locator('[data-walk-insight]').count()).toBeLessThanOrEqual(4);
  await expect(insights.getByRole('button')).toHaveCount(0);
  await shot(page, info, 'analytics-insights');
  await page.getByRole('button', { name: '7 дней', exact: true }).click();
  await expect(insights).toContainText('8 из 8');
  expect(await records(page)).toEqual(before);
});

test('WALK-13 low-data state never claims personalization', async ({ page }, info) => {
  await seed(page, info.project.name === 'mobile-chrome', 2);
  await expect(
    page.getByText('Пока недостаточно данных для персональной рекомендации.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Почему LifeOS это предлагает?', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-walk-quick-intent]')).toHaveCount(3);
  await shot(page, info, 'low-data');
  await page.locator('[data-walk-quick-intent="free"]').click();
  await expect(page.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeVisible();
});

test('WALK-13 context read failure hides old suggestion and retry recovers without writes', async ({
  page,
}, info) => {
  await seed(page, info.project.name === 'mobile-chrome');
  const card = page.getByRole('region', { name: 'Рекомендация LifeOS', exact: true });
  await expect(card).toBeVisible();
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
  await page.getByText('Указать текущее состояние', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Отметить состояние перед прогулкой' }).check();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить рекомендацию');
  await expect(card).toHaveCount(0);
  await expect(
    page.getByText('Пока недостаточно данных для персональной рекомендации.', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('[data-walk-quick-intent="free"]')).toBeEnabled();
  await restore.evaluate((recover) => recover());
  await restore.dispose();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(card).toBeVisible();
  expect(await records(page)).toEqual(before);
});

test('WALK-13 switching to seven days removes insights when only two pairs remain', async ({
  page,
}, info) => {
  await seed(page, info.project.name === 'mobile-chrome', 8, 6);
  const before = await records(page);
  await page.getByRole('button', { name: 'Аналитика прогулок', exact: true }).click();
  const insights = page.getByRole('region', { name: 'Наблюдения', exact: true });
  await expect(insights).toContainText('8 из 8');
  await page.getByRole('button', { name: '7 дней', exact: true }).click();
  await expect(insights).toContainText('Пока недостаточно сопоставимых данных');
  await expect(insights.locator('[data-walk-insight]')).toHaveCount(0);
  await page.getByRole('button', { name: '30 дней', exact: true }).click();
  await expect(insights).toContainText('8 из 8');
  expect(await records(page)).toEqual(before);
});

for (const width of [360, 390, 430])
  test(`WALK-13 mobile ${width} keeps recommendation compact and controls reachable`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile-chrome', 'mobile viewport matrix');
    await page.setViewportSize({ width, height: 844 });
    await seed(page, true);
    const card = page.getByRole('region', { name: 'Рекомендация LifeOS', exact: true });
    await expect(card).toBeVisible();
    const bounds = await card.boundingBox();
    expect(bounds!.height).toBeLessThan(430);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const start = card.getByRole('button', { name: 'Начать прогулку', exact: true });
    expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await shot(page, info, `mobile-${width}`);
  });
