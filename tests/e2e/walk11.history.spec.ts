import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  DayDate,
  Decision,
  DecisionTitle,
  EntityId,
  PauseInterval,
  RoutineBlock,
  RoutineBlockRecurrence,
  RoutineOccurrenceExecution,
  WalkCapture,
} from '../../src/domain';
import { DecisionRecordMapper } from '../../src/infrastructure/persistence/mappers/DecisionRecordMapper';
import { RoutineBlockRecordMapper } from '../../src/infrastructure/persistence/mappers/RoutineBlockRecordMapper';
import { RoutineOccurrenceExecutionRecordMapper } from '../../src/infrastructure/persistence/mappers/RoutineOccurrenceExecutionRecordMapper';
import { WalkCaptureRecordMapper } from '../../src/infrastructure/persistence/mappers/WalkCaptureRecordMapper';
import { WalkRecordMapper } from '../../src/infrastructure/persistence/mappers/WalkRecordMapper';
import { historyWalk } from '../../src/test/helpers/WalkHistoryFixtures';

test.use({ timezoneId: 'Asia/Chita' });
const DATE = DayDate.create('2026-08-26');
const TITLE = 'Выбрать следующий приоритет';
const RESULT = 'Определён следующий приоритет — сначала небольшой эксперимент.';

async function openWalks(page: Page, mobile: boolean) {
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
}

test('WALK-11 empty history starts the existing intent flow', async ({ page }, info) => {
  await openWalks(page, info.project.name === 'mobile-chrome');
  await page.getByRole('button', { name: 'История прогулок', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'История прогулок', exact: true })).toBeVisible();
  await expect(
    page.getByText('Здесь появятся завершённые прогулки.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.locator('input[name="walk-intent"]')).toHaveCount(3);
});

function fixtures(count = 6) {
  const now = new Date('2026-08-26T07:00:00Z');
  const decision = Decision.createDraft({
    id: EntityId.create('history-source-decision'),
    title: DecisionTitle.create(TITLE),
    kind: 'additional',
    occurredAt: now,
    eventId: EntityId.create('history-created'),
  });
  decision.plan({
    plannedDate: DATE,
    kind: 'additional',
    occurredAt: now,
    eventId: EntityId.create('history-planned'),
  });
  const routine = RoutineBlock.create({
    id: EntityId.create('history-source-routine'),
    anchorDate: DATE,
    title: 'Прогулка после обеда',
    startTime: '17:00',
    endTime: '17:30',
    category: 'physical',
    recurrence: RoutineBlockRecurrence.create('none'),
    required: false,
    assignment: { kind: 'walk' },
    now,
  });
  const source = { routineBlockId: routine.id, occurrenceDate: DATE, effectiveDate: DATE };
  const reflection = historyWalk('history-reflection', {
    intent: 'reflection',
    type: 'reflection',
    startedAt: new Date('2026-08-26T08:10:00Z'),
    endedAt: new Date('2026-08-26T08:40:00Z'),
    updatedAt: new Date('2026-08-26T08:40:00Z'),
    beforeState: { energy: 4, tension: 7, clarity: 5 },
    afterState: { energy: 6, tension: 4, clarity: 7 },
    impact: 'better',
    result: RESULT,
    reflectionQuestion: 'Какой следующий шаг даст больше ясности?',
    linkedEntity: { type: 'decision', id: decision.id },
    pauseIntervals: [
      PauseInterval.create(new Date('2026-08-26T08:20:00Z'), new Date('2026-08-26T08:30:00Z')),
    ],
  });
  const walks = [
    reflection,
    historyWalk('history-recovery', {
      intent: 'recovery',
      type: 'restorative',
      startedAt: new Date('2026-08-26T07:35:00Z'),
      endedAt: new Date('2026-08-26T08:00:00Z'),
      beforeState: { energy: 3, tension: 7, clarity: 4 },
      afterState: { energy: 5, tension: 4, clarity: 6 },
      impact: 'better',
    }),
    historyWalk('history-free', {
      startedAt: new Date('2026-08-26T07:18:00Z'),
      endedAt: new Date('2026-08-26T07:50:00Z'),
    }),
    historyWalk('history-routine', {
      startedAt: new Date('2026-08-26T07:10:00Z'),
      endedAt: new Date('2026-08-26T07:40:00Z'),
      linkedEntity: { type: 'routine', id: routine.id },
      returnContext: {
        origin: 'routine',
        entity: { type: 'routine', id: routine.id },
        nextStep: null,
        routineContext: { source, sourceTitle: routine.title, next: null },
      },
    }),
    historyWalk('history-missing', {
      intent: 'reflection',
      startedAt: new Date('2026-08-26T07:10:00Z'),
      endedAt: new Date('2026-08-26T07:30:00Z'),
      linkedEntity: { type: 'decision', id: EntityId.create('missing-decision') },
    }),
    historyWalk('history-legacy', {
      intent: null,
      type: 'phoneFree',
      startedAt: new Date('2026-08-26T07:00:00Z'),
      endedAt: new Date('2026-08-26T07:20:00Z'),
    }),
    ...Array.from({ length: Math.max(0, count - 6) }, (_, index) =>
      historyWalk(`history-old-${String(index).padStart(3, '0')}`, {
        date: DayDate.create('2026-08-25'),
        createdAt: new Date('2026-08-25T07:00:00Z'),
        startedAt: new Date('2026-08-25T08:00:00Z'),
        endedAt: new Date('2026-08-25T08:30:00Z'),
        updatedAt: new Date('2026-08-25T08:30:00Z'),
        result: index === 0 ? 'Длинная мысль без пробелов: ' + 'смысл'.repeat(80) : null,
      }),
    ),
  ];
  const active = historyWalk('history-active', {
    status: 'paused',
    endedAt: null,
    pausedAt: new Date('2026-08-26T08:10:00Z'),
  });
  const pending = WalkCapture.create({
    id: EntityId.create('history-capture-pending'),
    walkId: reflection.id,
    content: 'Проверить допущение на небольшом примере.',
    capturedAt: new Date('2026-08-26T08:35:00Z'),
    walkElapsedMs: 900000,
  });
  const processed = WalkCapture.create({
    id: EntityId.create('history-capture-processed'),
    walkId: reflection.id,
    content: 'Обсудить идею после прогулки.',
    capturedAt: new Date('2026-08-26T08:15:00Z'),
    walkElapsedMs: 300000,
  }).process(new Date('2026-08-26T08:45:00Z'));
  const execution = RoutineOccurrenceExecution.start({
    id: EntityId.create('history-routine-execution'),
    routineBlockId: routine.id,
    occurrenceDate: DATE,
    occurredAt: new Date('2026-08-26T07:10:00Z'),
  }).complete(new Date('2026-08-26T07:40:00Z'));
  return {
    walks: [...walks, active].map(WalkRecordMapper.toRecord),
    decisions: [DecisionRecordMapper.toRecord(decision)],
    routineBlocks: [RoutineBlockRecordMapper.toRecord(routine)],
    routineOccurrenceExecutions: [RoutineOccurrenceExecutionRecordMapper.toRecord(execution)],
    walkCaptures: [pending, processed].map(WalkCaptureRecordMapper.toRecord),
  };
}

async function seed(page: Page, mobile: boolean, count = 6) {
  await openWalks(page, mobile);
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  // Synthetic data only, inside Playwright's new isolated context. Never the user's browser database.
  await page.evaluate(async (data) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(Object.keys(data), 'readwrite');
        for (const [name, records] of Object.entries(data))
          for (const record of records) transaction.objectStore(name).put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, fixtures(count));
  await page.reload();
  await navigateWalks(page, mobile);
  await page.getByRole('button', { name: 'История прогулок', exact: true }).click();
  await expect(page.locator('[data-walk-history-row]')).toHaveCount(Math.min(count, 20));
}

async function records(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const data: Record<string, unknown[]> = {};
      for (const name of [
        'walks',
        'decisions',
        'routineBlocks',
        'routineOccurrenceExecutions',
        'walkCaptures',
        'lifeActions',
        'actionSessions',
      ]) {
        data[name] = await new Promise<unknown[]>((resolve, reject) => {
          const request = database.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
          request.onerror = () => reject(request.error);
        });
      }
      return data;
    } finally {
      database.close();
    }
  });
}

async function shot(page: Page, info: TestInfo, name: string, fullPage = false) {
  const path = info.outputPath(`${name}.png`);
  if (fullPage) {
    // Capture from the page origin so fixed shell controls are not painted midway
    // through the full-page image after the separate bottom-clearance assertion.
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  }
  await page.mouse.move(0, 0);
  await page.screenshot({ path, fullPage, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

test('WALK-11 journal filters, facts, thoughts and Decision navigation never mutate persisted state', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await seed(page, info.project.name === 'mobile-chrome');
  const before = await records(page);
  const rows = page.locator('[data-walk-history-row]');
  await expect(rows.first()).toHaveAttribute('data-walk-history-row', 'history-reflection');
  await expect(page.locator('[data-walk-history-row="history-active"]')).toHaveCount(0);
  await expect(page.locator('[data-walk-history-row="history-legacy"]')).toContainText(
    'Без телефона',
  );
  await expect(page.locator('[data-walk-history-row="history-free"]')).toContainText('32 мин');
  await shot(page, info, '01-history');
  const filters = page.getByRole('group', { name: 'Режим прогулки' });
  await filters.getByRole('button', { name: 'Восстановительные', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Напряжение 7 → 4');
  await shot(page, info, '02-filtered-history');
  await filters.getByRole('button', { name: 'Размышление', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await page.locator('[data-walk-history-row="history-reflection"]').click();
  const heading = page.getByRole('heading', { name: 'Размышление', exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toHaveCSS('outline-color', 'rgb(237, 188, 140)');
  await expect(heading).toHaveCSS('outline-width', '2px');
  await expect(page.getByText('Фактически:', { exact: false })).toContainText('20 мин');
  await expect(
    page.getByText('Какой следующий шаг даст больше ясности?', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.walk-history-states > div').filter({ hasText: 'Напряжение' }),
  ).toContainText('7');
  await expect(
    page.locator('.walk-history-states > div').filter({ hasText: 'Напряжение' }),
  ).toContainText('4');
  await expect(page.getByText('Самочувствие: Лучше', { exact: true })).toBeVisible();
  await expect(page.getByText(RESULT, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Сохранённые мысли · 2', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.walk-history-captures li')).toHaveCount(2);
  await expect(page.getByText('Не обработано', { exact: true })).toBeVisible();
  await expect(page.getByText('Обработано', { exact: true })).toBeVisible();
  await expect(
    page.locator(
      '.walk-history-detail input, .walk-history-detail textarea, .walk-history-detail select',
    ),
  ).toHaveCount(0);
  await shot(page, info, '03-walk-detail', info.project.name === 'desktop-chrome');
  await page.keyboard.press('Control+End');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.abs(document.documentElement.scrollHeight - window.innerHeight - window.scrollY),
      ),
    )
    .toBeLessThanOrEqual(1);
  await shot(page, info, '04-outcome-captures');
  await page.getByRole('button', { name: '← История прогулок', exact: true }).click();
  await expect(filters.getByRole('button', { name: 'Размышление', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-walk-history-row="history-reflection"]')).toBeFocused();
  await page.locator('[data-walk-history-row="history-missing"]').click();
  await expect(page.getByText('Связанное решение недоступно', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Открыть решение', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '← История прогулок', exact: true }).click();
  await page.locator('[data-walk-history-row="history-reflection"]').click();
  await page.getByRole('button', { name: 'Открыть решение', exact: true }).click();
  await expect(page.getByRole('dialog', { name: TITLE, exact: true })).toBeVisible();
  expect(await records(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('WALK-11 pages 100 records, preserves the page on back and opens the original Routine safely', async ({
  page,
}, info) => {
  await seed(page, info.project.name === 'mobile-chrome', 100);
  const before = await records(page);
  const rows = page.locator('[data-walk-history-row]');
  for (let pageIndex = 1; pageIndex < 5; pageIndex++) {
    await page.getByRole('button', { name: 'Следующие', exact: true }).click();
    await expect(rows).toHaveCount(20);
  }
  await expect(page.getByRole('button', { name: 'Следующие', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText('81–100 из 100');
  const lastId = await rows.last().getAttribute('data-walk-history-row');
  await rows.last().click();
  await expect(page.getByText('Без итога', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← История прогулок', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('81–100 из 100');
  await expect(page.locator(`[data-walk-history-row="${lastId}"]`)).toBeFocused();
  await page
    .getByRole('group', { name: 'Режим прогулки' })
    .getByRole('button', { name: 'Восстановительные', exact: true })
    .click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('1–1 из 1');
  await page
    .getByRole('group', { name: 'Режим прогулки' })
    .getByRole('button', { name: 'Все', exact: true })
    .click();
  await page.locator('[data-walk-history-row="history-routine"]').click();
  await expect(page.getByText('Прогулка после обеда', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть распорядок', exact: true }).click();
  await expect(page).toHaveURL(/routine/);
  await expect(page.getByText('Прогулка после обеда', { exact: true })).toBeVisible();
  expect(await records(page)).toEqual(before);
});

for (const width of [360, 390, 430]) {
  test(`WALK-11 mobile ${width} wraps long facts, scrolls and keeps touch targets above bottom navigation`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile-chrome', 'Mobile layout matrix');
    await page.setViewportSize({ width, height: 844 });
    await seed(page, true, 21);
    const rows = page.locator('[data-walk-history-row]');
    await expect(rows).toHaveCount(20);
    const topBar = await page.getByRole('banner').boundingBox();
    await expect
      .poll(
        async () =>
          (await page.getByRole('heading', { name: 'История прогулок', exact: true }).boundingBox())
            ?.y ?? -1,
      )
      .toBeGreaterThanOrEqual(topBar!.y + topBar!.height);
    await expect
      .poll(() =>
        page.locator('.walk-history button').evaluateAll((buttons) =>
          buttons
            .filter((button) => button.getBoundingClientRect().height < 44)
            .map((button) => ({
              text: button.textContent,
              height: button.getBoundingClientRect().height,
              minHeight: getComputedStyle(button).minHeight,
              transform: getComputedStyle(button).transform,
            })),
        ),
      )
      .toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page
        .locator('.walk-history')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Следующие', exact: true }).scrollIntoViewIfNeeded();
    const pagination = await page
      .getByRole('button', { name: 'Следующие', exact: true })
      .boundingBox();
    const bottom = await page
      .getByRole('navigation', { name: 'Мобильная навигация' })
      .boundingBox();
    expect(pagination!.y + pagination!.height).toBeLessThanOrEqual(bottom!.y);
    await page.locator('[data-walk-history-row="history-reflection"]').click();
    await expect(page.getByRole('heading', { name: 'Размышление', exact: true })).toBeFocused();
    await expect
      .poll(
        async () =>
          (await page.getByRole('heading', { name: 'Размышление', exact: true }).boundingBox())
            ?.y ?? -1,
      )
      .toBeGreaterThanOrEqual(topBar!.y + topBar!.height);
    expect(
      await page
        .locator('.walk-history')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    // Scroll to the actual end: scrollIntoViewIfNeeded only knows the viewport,
    // and can leave already-intersecting content behind the fixed bottom bar.
    await page.keyboard.press('Control+End');
    await expect
      .poll(async () => {
        const capture = await page.getByText('Обработано', { exact: true }).boundingBox();
        return capture === null || capture.y < 0 ? Infinity : capture.y + capture.height;
      })
      .toBeLessThanOrEqual(bottom!.y);
    await shot(page, info, `mobile-${width}-detail`);
    await page.getByRole('button', { name: '← История прогулок', exact: true }).click();
    await expect(page.locator('[data-walk-history-row="history-reflection"]')).toBeFocused();
  });
}

test('WALK-11 read failures are visible and retry restores the list without writes', async ({
  page,
}, info) => {
  await seed(page, info.project.name === 'mobile-chrome');
  const before = await records(page);
  // Keep the read fault active until explicit recovery, including StrictMode's repeated effect.
  const restoreGetAll = await page.evaluateHandle(() => {
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
      if (this.name === 'walks') {
        throw new DOMException('Synthetic read failure', 'UnknownError');
      }
      return original.apply(this, args);
    };
    return () => {
      IDBObjectStore.prototype.getAll = original;
    };
  });
  await page
    .getByRole('group', { name: 'Режим прогулки' })
    .getByRole('button', { name: 'Свободные', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить историю');
  await expect(page.locator('[data-walk-history-row]')).toHaveCount(0);
  await restoreGetAll.evaluate((restore) => restore());
  await restoreGetAll.dispose();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.locator('[data-walk-history-row]')).toHaveCount(2);
  expect(await records(page)).toEqual(before);
});

test('WALK-14 unavailable selected Walk id offers a safe back action without writes', async ({
  page,
}, info) => {
  await seed(page, info.project.name === 'mobile-chrome');
  const before = await records(page);
  // Simulate a stale selected id at the repository boundary, without deleting the stored Walk.
  const restoreGet = await page.evaluateHandle(() => {
    const original = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key: IDBValidKey | IDBKeyRange) {
      return original.call(this, this.name === 'walks' ? 'walk14-nonexistent-id' : key);
    };
    return () => {
      IDBObjectStore.prototype.get = original;
    };
  });
  try {
    await page.locator('[data-walk-history-row="history-reflection"]').click();
    await expect(page.getByRole('status')).toHaveText('Прогулка недоступна или ещё не завершена.');
    await page.getByRole('button', { name: '← История прогулок', exact: true }).click();
    await expect(page.locator('[data-walk-history-row="history-reflection"]')).toBeFocused();
  } finally {
    await restoreGet.evaluate((restore) => restore());
    await restoreGet.dispose();
  }
  expect(await records(page)).toEqual(before);
});
