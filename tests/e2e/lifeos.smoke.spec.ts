import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { WalkRecord } from '../../src/infrastructure/persistence/records/WalkRecord';
import type { RoutineOccurrenceExecutionRecord } from '../../src/infrastructure/persistence/records/RoutineOccurrenceExecutionRecord';

const SIDEBAR_PREFERENCE_STORAGE_KEY = 'lifeos.sidebar-collapsed.v1';

test('WALK-08 starts from Routine and returns to the next occurrence atomically', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const issues = observeRuntimeIssues(page);
  const mobile = testInfo.project.name === 'mobile-chrome';
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 });
  await page.emulateMedia({ reducedMotion: mobile ? 'reduce' : 'no-preference' });
  await page.goto('/');
  const sourceTitle =
    'Прогулка после обеда — спокойно обдумать следующий шаг и вернуться к запланированному распорядку';
  const date = await seedRoutineWalk(page, true, sourceTitle);
  await page.reload();
  await openRoutine(page, mobile);
  const source = page
    .locator('.routine-card')
    .filter({ has: page.getByRole('heading', { name: sourceTitle, exact: true }) });
  await expect(source.getByRole('button', { name: 'Начать прогулку', exact: true })).toBeVisible();
  await expect(source.getByRole('button', { name: /Начать блок|Открыть прогулки/ })).toHaveCount(0);
  await attachWalkScreenshot(page, testInfo, 'walk08-routine-launch');
  await source.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Какой будет эта прогулка?' })).toBeFocused();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(source).toBeFocused();
  expect((await readRoutineWalkState(page)).walks).toHaveLength(0);
  await source.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.locator('.walk-routine-source')).toContainText(sourceTitle);
  await expect(page.locator('.walk-routine-source')).toContainText('Далее: Чтение');
  await expectNoHorizontalOverflow(page);
  await attachWalkScreenshot(page, testInfo, 'walk08-preparation');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).dblclick();
  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
  await expect(page.getByText(`Из распорядка: ${sourceTitle}`, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  if (mobile) await expectTouchSafeActiveControls(page);
  await attachWalkScreenshot(page, testInfo, 'walk08-active');
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Мысль', exact: true })
    .fill('Мысль из прогулки по распорядку');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить мысль', exact: true })).toBeFocused();
  await openRoutine(page, mobile);
  await expect(
    source.getByRole('button', { name: 'Вернуться к прогулке', exact: true }),
  ).toBeVisible();
  await expect(
    source.getByRole('button', { name: /Начать блок|Завершить блок|Прервать|Открыть прогулки/ }),
  ).toHaveCount(0);
  await source.getByRole('button', { name: 'Вернуться к прогулке', exact: true }).click();
  await page.reload();
  await expect(page.getByText(`Из распорядка: ${sourceTitle}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
  const pausedElapsed = await readElapsedSeconds(page);
  await page.reload();
  await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
  expect(await readElapsedSeconds(page)).toBe(pausedElapsed);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await finishRoutineWalk(page, testInfo, mobile);
  await openTodaySection(page);
  await expect(page.getByText('Завершить возвращение', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Вернуться к распорядку', exact: true }).click();
  const next = page
    .locator('.routine-card')
    .filter({ has: page.getByRole('heading', { name: 'Чтение', exact: true }) });
  await expect(next).toBeFocused();
  await expect(next).toHaveClass(/routine-return-target/);
  const factWord = await next
    .getByText('Фактическое выполнение не зафиксировано', { exact: true })
    .evaluate((element) => {
      const text = element.firstChild;
      if (text === null) throw new Error('Missing fact description');
      const word = 'зафиксировано';
      const start = (text.textContent ?? '').indexOf(word);
      if (start < 0) throw new Error('Missing fact word');
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, start + word.length);
      return {
        lines: range.getClientRects().length,
        width: range.getBoundingClientRect().width,
        availableWidth: element.getBoundingClientRect().width,
      };
    });
  expect(factWord.lines, 'return target must not split ordinary words across lines').toBe(1);
  expect(factWord.width).toBeLessThanOrEqual(factWord.availableWidth);
  await expect(page).toHaveURL(new RegExp(`routine/day\\?date=${date}$`));
  await expectNoHorizontalOverflow(page);
  await attachWalkScreenshot(page, testInfo, 'walk08-return-target');
  const stored = await readRoutineWalkState(page);
  expect(stored.walks).toHaveLength(1);
  expect(stored.executions).toHaveLength(1);
  expect(stored.walks[0]).toMatchObject({ status: 'completed', reentry: { status: 'completed' } });
  expect(stored.executions[0]).toMatchObject({ status: 'completed' });
  await next.getByRole('button', { name: 'Начать блок', exact: true }).click();
  await expect(next.getByRole('button', { name: 'Завершить блок', exact: true })).toBeVisible();
  await next.getByRole('button', { name: 'Завершить блок', exact: true }).click();
  await expect(next.getByRole('button', { name: 'Завершить блок', exact: true })).toHaveCount(0);
  const afterNextBlock = await readRoutineWalkState(page);
  expect(afterNextBlock.walks).toHaveLength(1);
  expect(afterNextBlock.executions).toHaveLength(2);
  expect(afterNextBlock.executions.every((execution) => execution.status === 'completed')).toBe(
    true,
  );
  await page.reload();
  await expect(page.locator('.routine-return-target')).toHaveCount(0);
  await openWalks(page, mobile);
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'История прогулок', exact: true }).click();
  await expect(page.locator('[data-walk-history-row]')).toHaveCount(1);
  await page.locator('[data-walk-history-row]').click();
  await expect(page.locator('.walk-history-detail')).toContainText(sourceTitle);
  await expect(page.locator('.walk-history-captures li')).toHaveCount(1);
  await expect(page.locator('.walk-history-captures')).toContainText(
    'Мысль из прогулки по распорядку',
  );
  await page.getByRole('button', { name: '← История прогулок', exact: true }).click();
  await page.getByRole('button', { name: '← К прогулкам', exact: true }).click();
  await page.getByRole('button', { name: 'Аналитика прогулок', exact: true }).click();
  await expect(page.locator('[data-walk-analytics-kpi="count"] dd')).toHaveText('1');
  await expect(page.getByRole('region', { name: 'Наблюдения', exact: true })).toContainText(
    'Пока недостаточно',
  );
  await page.getByRole('button', { name: '← К прогулкам', exact: true }).click();
  await expect(
    page.getByText('Пока недостаточно данных для персональной рекомендации.', { exact: true }),
  ).toBeVisible();
  expect(await readRoutineWalkState(page)).toEqual(afterNextBlock);
  expect(issues).toEqual([]);
});

test('WALK-08 abandons a restored linked walk without outcome or Reentry', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const issues = observeRuntimeIssues(page);
  const mobile = testInfo.project.name === 'mobile-chrome';
  await page.setViewportSize(mobile ? { width: 360, height: 800 } : { width: 1366, height: 768 });
  await page.goto('/');
  await seedRoutineWalk(page);
  await page.reload();
  await startRoutineWalkFromUi(page, mobile);
  await page.reload();
  await expect(
    page.getByText('Из распорядка: Прогулка после обеда', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Прервать', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Остаться', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Прервать', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Прервать', exact: true }).click();
  await expectNoHorizontalOverflow(page);
  await attachWalkScreenshot(page, testInfo, 'walk08-abandon-confirmation');
  await page
    .getByRole('group', { name: 'Подтверждение прерывания' })
    .getByRole('button', { name: 'Прервать', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  const stored = await readRoutineWalkState(page);
  expect(stored.walks).toHaveLength(1);
  expect(stored.executions).toHaveLength(1);
  expect(stored.walks[0]).toMatchObject({ status: 'abandoned', reentry: null, impact: null });
  expect(stored.executions[0]).toMatchObject({ status: 'abandoned' });
  await page.reload();
  await openWalks(page, mobile);
  await expect(page.getByRole('heading', { name: /Быстрый итог|Что дальше\?/ })).toHaveCount(0);
  expect(issues).toEqual([]);
});

for (const fallback of ['no-next', 'deleted-next', 'no-context'] as const) {
  test(`WALK-08 uses the ${fallback} fallback without a navigation loop`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const issues = observeRuntimeIssues(page);
    const mobile = testInfo.project.name === 'mobile-chrome';
    await page.setViewportSize(mobile ? { width: 360, height: 800 } : { width: 1366, height: 768 });
    if (fallback === 'no-context') {
      await completeWalkWithOutcome(page, mobile);
      await attachWalkScreenshot(page, testInfo, 'walk08-no-context-reentry');
      await page.getByRole('button', { name: 'Перейти на «Сегодня»' }).click();
      await expect(page.getByRole('button', { name: 'День', exact: true }).last()).toHaveAttribute(
        'aria-current',
        'page',
      );
    } else {
      await page.goto('/');
      await seedRoutineWalk(page, fallback !== 'no-next');
      await page.reload();
      await startRoutineWalkFromUi(page, mobile);
      await finishRoutineWalk(page, testInfo, mobile, `-${fallback}`);
      if (fallback === 'deleted-next') await deleteRoutineQaBlock(page, 'walk08-next');
      await page.getByRole('button', { name: 'Вернуться к распорядку', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Блоки распорядка', exact: true }),
      ).toBeFocused();
      await expect(page.locator('.routine-return-target')).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page);
    await attachWalkScreenshot(page, testInfo, `walk08-fallback-${fallback}`);
    await openWalks(page, mobile);
    await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
    expect(issues).toEqual([]);
  });
}

test('WALK-08 keeps stale preparation retryable and supports returning without creating a walk', async ({
  page,
}, testInfo) => {
  const issues = observeRuntimeIssues(page);
  const mobile = testInfo.project.name === 'mobile-chrome';
  await page.goto('/');
  await seedRoutineWalk(page);
  await page.reload();
  await openRoutine(page, mobile);
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await deleteRoutineQaBlock(page, 'walk08-source');
  for (let retry = 0; retry < 2; retry += 1) {
    await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('План блока изменился');
    await expect(page.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeVisible();
  }
  expect((await readRoutineWalkState(page)).walks).toHaveLength(0);
  await page.getByRole('button', { name: 'Вернуться к распорядку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Блоки распорядка', exact: true })).toBeFocused();
  expect(issues).toEqual([]);
});

async function seedRoutineWalk(
  page: Page,
  withNext = true,
  title = 'Прогулка после обеда',
): Promise<string> {
  await expect(page.locator('#application-content')).toBeVisible();
  return page.evaluate(
    async ({ includeNext, sourceTitle }) => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['days', 'routineBlocks'], 'readwrite');
          const days = tx.objectStore('days');
          const request = days.getAll();
          request.onsuccess = () => {
            const current = (
              request.result as { id: string; date: string; createdAt: string }[]
            ).find((day) => day.date === date);
            days.put({
              schemaVersion: 1,
              id: current?.id ?? 'walk08-day',
              date,
              status: 'open',
              createdAt: current?.createdAt ?? now.toISOString(),
              plannedAt: null,
              openedAt: now.toISOString(),
              firstActivityAt: null,
              completedAt: null,
              summary: null,
              version: 1,
            });
          };
          const common = {
            schemaVersion: 1,
            anchorDate: date,
            category: 'other',
            recurrence: 'none',
            selectedWeekdays: [],
            required: false,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            version: 1,
          };
          tx.objectStore('routineBlocks').put({
            ...common,
            id: 'walk08-source',
            title: sourceTitle,
            startTime: '14:00',
            endTime: '14:30',
            assignment: 'walk',
          });
          if (includeNext)
            tx.objectStore('routineBlocks').put({
              ...common,
              id: 'walk08-next',
              title: 'Чтение',
              startTime: '15:00',
              endTime: '15:30',
              assignment: 'reminder',
            });
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        return date;
      } finally {
        db.close();
      }
    },
    { includeNext: withNext, sourceTitle: title },
  );
}

async function readRoutineWalkState(
  page: Page,
): Promise<{ walks: WalkRecord[]; executions: RoutineOccurrenceExecutionRecord[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = <T>(store: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = db.transaction(store).objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result as T[]);
          request.onerror = () => reject(request.error);
        });
      return {
        walks: await read<WalkRecord>('walks'),
        executions: await read<RoutineOccurrenceExecutionRecord>('routineOccurrenceExecutions'),
      };
    } finally {
      db.close();
    }
  });
}

async function deleteRoutineQaBlock(page: Page, id: string): Promise<void> {
  await page.evaluate(async (blockId) => {
    if (!['walk08-source', 'walk08-next'].includes(blockId)) throw new Error('Not a QA block');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('routineBlocks', 'readwrite');
        tx.objectStore('routineBlocks').delete(blockId);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, id);
}

async function openRoutine(page: Page, mobile: boolean): Promise<void> {
  if (mobile) {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await page
      .getByRole('dialog', { name: 'Меню LifeOS' })
      .getByRole('button', { name: 'Распорядок', exact: true })
      .click();
  } else
    await page
      .getByRole('navigation', { name: 'Основные разделы' })
      .getByRole('button', { name: 'Распорядок', exact: true })
      .click();
}

async function startRoutineWalkFromUi(page: Page, mobile: boolean): Promise<void> {
  await openRoutine(page, mobile);
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
}

async function finishRoutineWalk(
  page: Page,
  testInfo: TestInfo,
  mobile: boolean,
  suffix = '',
): Promise<void> {
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение завершения' })
    .getByRole('button', { name: 'Завершить', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Быстрый итог', exact: true })).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectStageWithinViewport(page, '.walk-completion-panel', false);
  if (mobile) await expectTouchSafeStateRanges(page);
  await attachWalkScreenshot(page, testInfo, `walk08-completion${suffix}`);
  await page.getByText('Так же', { exact: true }).click();
  if (mobile) {
    const submit = page.getByRole('button', { name: 'Сохранить итог', exact: true });
    await submit.scrollIntoViewIfNeeded();
    const submitBounds = await submit.boundingBox();
    const navigationBounds = await page
      .getByRole('navigation', { name: 'Мобильная навигация' })
      .boundingBox();
    expect(submitBounds).not.toBeNull();
    expect(navigationBounds).not.toBeNull();
    expect(submitBounds!.height).toBeGreaterThanOrEqual(44);
    expect(submitBounds!.y + submitBounds!.height).toBeLessThanOrEqual(navigationBounds!.y);
    await attachWalkScreenshot(page, testInfo, `walk08-completion-actions${suffix}`);
  }
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toBeFocused();
  await expect(page.locator('.walk-reentry-actions .primary-button')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await expectStageWithinViewport(page, '.walk-reentry-panel', false);
  await attachWalkScreenshot(page, testInfo, `walk08-reentry${suffix}`);
  if (mobile) {
    await expectTouchSafeReentryControls(page);
    await attachWalkScreenshot(page, testInfo, `walk08-reentry-actions${suffix}`);
  }
}

function observeRuntimeIssues(page: Page): string[] {
  const issues: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      if (location.url.endsWith('/favicon.ico')) {
        return;
      }
      issues.push(`console: ${message.text()}${location.url === '' ? '' : ` (${location.url})`}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      issues.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  return issues;
}

test('loads LifeOS and navigates between primary sections without runtime errors', async ({
  page,
}, testInfo) => {
  const runtimeIssues = observeRuntimeIssues(page);
  const mobile = testInfo.project.name === 'mobile-chrome';
  const navigationName = mobile ? 'Мобильная навигация' : 'Основные разделы';
  const sectionLabels = mobile
    ? ['День', 'Управление', 'История', 'Ещё']
    : [
        'День',
        'Управление',
        'Распорядок',
        'Прогулки',
        'Сферы',
        'История',
        'Вечерняя аналитика',
        'Ещё',
      ];

  await page.goto('/');

  const brand = mobile
    ? page.locator('.application-mobile-brand')
    : page.locator('.application-brand-name');
  await expect(brand).toHaveText('LifeOS');
  await expect(brand).toBeVisible();
  const navigation = page.getByRole('navigation', { name: navigationName });
  await expect(navigation).toBeVisible();

  for (const label of sectionLabels) {
    const sectionButton = navigation.getByRole('button', { name: label, exact: true });
    await sectionButton.click();
    await expect(sectionButton).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#application-content')).not.toBeEmpty();
  }

  expect(runtimeIssues).toEqual([]);
});

test('preserves the desktop sidebar preference after reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chrome', 'The sidebar control is desktop-only.');
  const runtimeIssues = observeRuntimeIssues(page);

  await page.goto('/');

  await page.getByRole('button', { name: 'Свернуть боковое меню' }).click();
  await expect(page.getByRole('button', { name: 'Развернуть боковое меню' })).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SIDEBAR_PREFERENCE_STORAGE_KEY))
    .toBe('true');

  await page.reload();

  await expect(page.getByRole('button', { name: 'Развернуть боковое меню' })).toBeVisible();
  expect(runtimeIssues).toEqual([]);
});

test('runs and restores the WALK-04 completion and reentry flow without mobile overflow', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const runtimeIssues = observeRuntimeIssues(page);
  const mobile = testInfo.project.name === 'mobile-chrome';
  const requiredViewport = mobile ? { width: 360, height: 800 } : { width: 1366, height: 768 };

  await page.setViewportSize(requiredViewport);
  expect(page.viewportSize()).toEqual(requiredViewport);

  await page.goto('/');
  await openWalks(page, mobile);

  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectStageWithinViewport(page, '.walk-session-center', mobile);
  if (!mobile) {
    const center = await page.locator('.walk-session-center').boundingBox();
    expect(center).not.toBeNull();
    expect(center!.height).toBeLessThanOrEqual(500);
  }
  await expect(page.getByRole('button', { name: 'Запланировать прогулку' })).toBeVisible();
  const emptyPlannedState = page.getByText('На эту дату прогулки пока не запланированы.', {
    exact: true,
  });
  await expect(emptyPlannedState).toBeVisible();
  await expect(page.locator('.walk-statistics')).toBeVisible();
  expect(
    await emptyPlannedState.evaluate((planned) => {
      const statistics = document.querySelector('.walk-statistics');
      if (statistics === null) return false;
      return (planned.compareDocumentPosition(statistics) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }),
  ).toBe(true);
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Какой будет эта прогулка?' })).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectStageWithinViewport(page, '.walk-session-step', mobile);

  for (const intent of ['Свободная прогулка', 'Восстановительная', 'Размышление']) {
    const choice = page.getByRole('radio', { name: new RegExp(`^${intent}`) });
    await page.getByText(intent, { exact: true }).click();
    await expect(choice).toBeChecked();
  }
  await page.getByText('Размышление', { exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectStageWithinViewport(page, '.walk-preparation-form', mobile);
  if (!mobile) {
    const preparation = await page.locator('.walk-preparation-form').boundingBox();
    expect(preparation).not.toBeNull();
    expect(preparation!.height).toBeLessThanOrEqual(680);
  }

  for (const duration of ['20 минут', '30 минут', '40 минут']) {
    const choice = page.getByRole('radio', { name: duration, exact: true });
    await page.getByText(duration, { exact: true }).click();
    await expect(choice).toBeChecked();
  }
  await page.getByText('30 минут', { exact: true }).click();
  await page
    .getByRole('textbox', { name: /Вопрос для размышления/ })
    .fill('Что поможет отпустить напряжение?');
  await page.getByRole('checkbox', { name: /Отметить состояние перед прогулкой/ }).check();
  await page.getByRole('slider', { name: /Энергия/ }).fill('4');
  await page.getByRole('slider', { name: /Напряжение/ }).fill('7');
  await page.getByRole('slider', { name: /Ясность/ }).fill('5');
  if (mobile) await expectTouchSafeStateRanges(page);
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();

  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
  await expect(page.locator('.walk-active-shell').getByRole('status')).toHaveText(
    'Прогулка началась. Хорошей дороги.',
  );
  await expect(page.getByRole('heading', { name: 'Размышление' })).toBeVisible();
  await expect(page.locator('.walk-active-heading h1')).toBeInViewport();
  await expect(page.locator('[role="timer"]')).toBeVisible();
  await expect.poll(() => readElapsedSeconds(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(10);
  await expectStageWithinViewport(page, '.walk-active-panel', mobile);
  await testInfo.attach(`walk-active-${mobile ? 'mobile-360' : 'desktop-1366'}-after-10s`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  if (mobile) {
    const mobileHeader = await page.locator('.application-mobile-header').boundingBox();
    const activeHeading = await page.locator('.walk-active-heading h1').boundingBox();
    expect(mobileHeader).not.toBeNull();
    expect(activeHeading).not.toBeNull();
    expect(activeHeading!.y).toBeGreaterThanOrEqual(mobileHeader!.y + mobileHeader!.height);
    await expectTouchSafeActiveControls(page);
  } else {
    const activePanel = await page.locator('.walk-active-panel').boundingBox();
    const activeHeading = await page.locator('.walk-active-heading h1').boundingBox();
    const elapsedTimer = await page.locator('[role="timer"]').boundingBox();
    expect(activePanel).not.toBeNull();
    expect(activeHeading).not.toBeNull();
    expect(elapsedTimer).not.toBeNull();
    expect(activePanel!.height).toBeLessThanOrEqual(620);
    expect(activeHeading!.y).toBeLessThan(elapsedTimer!.y + elapsedTimer!.height);
    expect(elapsedTimer!.y).toBeLessThan(activeHeading!.y + activeHeading!.height);
  }
  await expect(page.getByText('Что поможет отпустить напряжение?', { exact: true })).toBeVisible();
  const elapsedBeforeRunningReload = await readElapsedSeconds(page);

  await page.reload();

  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
  await expect.poll(() => readElapsedSeconds(page)).toBeGreaterThan(elapsedBeforeRunningReload);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
  const pausedElapsed = await readElapsedSeconds(page);
  await page.waitForTimeout(1_500);
  expect(await readElapsedSeconds(page)).toBe(pausedElapsed);

  await page.reload();

  await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать прогулку', exact: true })).toHaveCount(0);
  expect(await readElapsedSeconds(page)).toBe(pausedElapsed);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
  await expect.poll(() => readElapsedSeconds(page)).toBeGreaterThan(pausedElapsed);
  await expectNoHorizontalOverflow(page);

  if (mobile) {
    await expect(page.locator('.walk-active-heading h1')).toBeInViewport();
    const panel = await page.locator('.walk-active-panel').boundingBox();
    const viewport = page.viewportSize();
    expect(panel).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport!.width);
    await expectTouchSafeActiveControls(page);
  }

  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  const confirmation = page.getByRole('group', { name: 'Подтверждение завершения' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('button', { name: 'Остаться' })).toBeFocused();
  await confirmation.getByRole('button', { name: 'Остаться' }).click();
  await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Быстрый итог', exact: true })).toBeFocused();
  await expect(page.getByText('Прогулка завершена', { exact: true })).toBeVisible();
  await expect(page.getByText('Как прогулка повлияла?', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectStageWithinViewport(page, '.walk-completion-panel', mobile);
  const frozenDuration = await page.locator('.walk-completion-summary dd').first().textContent();
  await page.waitForTimeout(1_200);
  expect(await page.locator('.walk-completion-summary dd').first().textContent()).toBe(
    frozenDuration,
  );
  await testInfo.attach(`walk-completion-${mobile ? 'mobile-360' : 'desktop-1366'}`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('slider', { name: /Энергия/ }).fill('7');
  await page.getByRole('slider', { name: /Напряжение/ }).fill('2');
  await page.getByRole('slider', { name: /Ясность/ }).fill('8');
  if (mobile) await expectTouchSafeStateRanges(page);
  await page.getByText('Лучше', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Лучше', exact: true })).toBeChecked();
  await page
    .getByRole('textbox', { name: /Что стало понятнее/ })
    .fill('Стало понятнее, с чего начать.');
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toBeFocused();
  await expect(page.getByText('Прогулка завершена', { exact: true })).toBeVisible();
  await expect(page.getByText('Вернуться в ритм дня', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перейти на «Сегодня»' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Закрыть без продолжения' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectStageWithinViewport(page, '.walk-reentry-panel', mobile);
  if (mobile) await expectTouchSafeReentryControls(page);
  await testInfo.attach(`walk-reentry-${mobile ? 'mobile-360' : 'desktop-1366'}`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Закрыть без продолжения' }).click();
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  const completedWalks = page.locator('.walk-result-list');
  await expect(completedWalks).toBeVisible();
  expect(
    await completedWalks.evaluate((recent) => {
      const statistics = document.querySelector('.walk-statistics');
      if (statistics === null) return false;
      return (recent.compareDocumentPosition(statistics) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }),
  ).toBe(true);
  expect(runtimeIssues).toEqual([]);
});

test('WALK-07 restores pending reentry and resolves before navigation', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const runtimeIssues = observeRuntimeIssues(page);
  const mobile = testInfo.project.name === 'mobile-chrome';
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 });

  await completeWalkWithOutcome(page, mobile);
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toBeFocused();
  await expect(page.getByText('Вернуться в ритм дня', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перейти на «Сегодня»' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  if (mobile) {
    await expectTouchSafeReentryControls(page);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await attachWalkScreenshot(
    page,
    testInfo,
    `walk07-immediate-${mobile ? 'mobile-390' : 'desktop-1366'}`,
  );

  await openTodaySection(page);
  await expect(page.getByText('Завершить возвращение', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeVisible();
  await attachWalkScreenshot(
    page,
    testInfo,
    `walk07-reminder-${mobile ? 'mobile-390' : 'desktop-1366'}`,
  );

  await page.reload();

  await expect(page.getByRole('button', { name: 'День', exact: true }).last()).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('Завершить возвращение', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Перейти на «Сегодня»' })).toBeVisible();
  await attachWalkScreenshot(
    page,
    testInfo,
    `walk07-restored-${mobile ? 'mobile-390' : 'desktop-1366'}`,
  );

  await page.getByRole('button', { name: 'Перейти на «Сегодня»' }).click();

  await expect(page.getByText('Завершить возвращение', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'День', exact: true }).last()).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('Восстанавливаем состояние дня…', { exact: true })).toHaveCount(0);
  await attachWalkScreenshot(
    page,
    testInfo,
    `walk07-destination-${mobile ? 'mobile-390' : 'desktop-1366'}`,
  );
  await openWalks(page, mobile);
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  expect(runtimeIssues).toEqual([]);
});

test('WALK-07 closes pending reentry without continuation and does not restore it', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const runtimeIssues = observeRuntimeIssues(page);
  const mobile = testInfo.project.name === 'mobile-chrome';
  await page.setViewportSize(mobile ? { width: 360, height: 800 } : { width: 1366, height: 768 });

  await completeWalkWithOutcome(page, mobile);
  await page.getByRole('button', { name: 'Закрыть без продолжения', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toHaveCount(0);
  await expect(page.getByText('Завершить возвращение', { exact: true })).toHaveCount(0);
  await page.reload();
  await openWalks(page, mobile);
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  expect(runtimeIssues).toEqual([]);
});

test('runs and restores the WALK-05 guided reflection flow', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const runtimeIssues = observeRuntimeIssues(page);
  const mobile = testInfo.project.name === 'mobile-chrome';
  const requiredViewport = mobile ? { width: 360, height: 800 } : { width: 1366, height: 768 };

  await page.setViewportSize(requiredViewport);
  await page.goto('/');
  await openWalks(page, mobile);
  await page.locator('[data-walk-quick-intent="reflection"]').click();

  const preparation = page.locator('.walk-preparation-form');
  await expect(preparation.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeFocused();
  await expect(preparation.getByRole('radio', { name: 'Свободная мысль' })).toBeChecked();
  await preparation.getByText('Принятие решения', { exact: true }).click();
  await expect(preparation.getByRole('radio', { name: 'Принятие решения' })).toBeChecked();
  for (const stage of [
    'Факты',
    'Предположения',
    'Варианты',
    'Цена выбора',
    'Минимальный проверочный шаг',
  ]) {
    await expect(preparation.getByText(stage, { exact: true })).toBeVisible();
  }
  await preparation
    .getByRole('textbox', { name: /Вопрос для размышления/ })
    .fill('Стоит ли запускать цель?');
  await expectNoHorizontalOverflow(page);
  await expectStageWithinViewport(page, '.walk-preparation-form', mobile);
  await attachWalkScreenshot(
    page,
    testInfo,
    `walk05-preparation-${mobile ? 'mobile-360' : 'desktop-1366'}`,
  );
  await preparation.getByRole('button', { name: 'Начать прогулку', exact: true }).click();

  const guidance = page.locator('.walk-reflection-guidance');
  await expect(guidance).toBeVisible();
  await expect(guidance.getByText('Принятие решения', { exact: true })).toBeVisible();
  await expect(guidance.getByText('Этап 1 из 5', { exact: true })).toBeVisible();
  await expect(guidance.getByText('Факты', { exact: true })).toBeVisible();
  await expect(guidance.locator('.walk-reflection-guidance-prompt')).toHaveText(
    'Что известно наверняка, без интерпретаций?',
  );
  await expect(guidance.locator('textarea, input')).toHaveCount(0);
  await expect(page.getByText('Стоит ли запускать цель?', { exact: true })).toBeVisible();
  if (mobile) await expectTouchSafeReflectionControls(page);
  await attachWalkScreenshot(
    page,
    testInfo,
    `walk05-guided-${mobile ? 'mobile-360' : 'desktop-1366'}`,
  );

  await guidance.getByRole('button', { name: 'Следующий этап', exact: true }).click();
  await expect(guidance.getByText('Этап 2 из 5', { exact: true })).toBeVisible();
  await expect(guidance.getByText('Предположения', { exact: true })).toBeVisible();
  const elapsedBeforeReload = await readElapsedSeconds(page);

  await page.reload();

  await expect(guidance.getByText('Этап 2 из 5', { exact: true })).toBeVisible();
  await expect(guidance.getByText('Предположения', { exact: true })).toBeVisible();
  await expect.poll(() => readElapsedSeconds(page)).toBeGreaterThanOrEqual(elapsedBeforeReload);
  await attachWalkScreenshot(
    page,
    testInfo,
    `walk05-restored-${mobile ? 'mobile-360' : 'desktop-1366'}`,
  );
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
  await page.reload();
  await expect(guidance.getByText('Предположения', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();

  await guidance.getByRole('button', { name: 'Без сопровождения', exact: true }).click();
  await expect(guidance).toHaveCount(0);
  await expect(page.getByText('Стоит ли запускать цель?', { exact: true })).toBeVisible();
  await expect(page.getByText(/Сопровождение отключено/)).toBeVisible();
  await page.reload();
  await expect(guidance).toHaveCount(0);
  await expect(page.getByText('Стоит ли запускать цель?', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await attachWalkScreenshot(
    page,
    testInfo,
    `walk05-disabled-${mobile ? 'mobile-360' : 'desktop-1366'}`,
  );

  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение завершения' })
    .getByRole('button', { name: 'Завершить', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Быстрый итог', exact: true })).toBeFocused();
  await page.getByText('Так же', { exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toBeFocused();
  await expectNoHorizontalOverflow(page);
  expect(runtimeIssues).toEqual([]);
});

async function completeWalkWithOutcome(page: Page, mobile: boolean): Promise<void> {
  await page.goto('/');
  await openWalks(page, mobile);
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  await page.locator('[data-walk-quick-intent="reflection"]').click();
  const preparation = page.locator('.walk-preparation-form');
  await expect(preparation.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeFocused();
  await preparation
    .getByRole('textbox', { name: /Вопрос для размышления/ })
    .fill('Что поможет вернуться к важному?');
  await preparation.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение завершения' })
    .getByRole('button', { name: 'Завершить', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Быстрый итог', exact: true })).toBeFocused();
  await page.getByText('Лучше', { exact: true }).click();
  await page
    .getByRole('textbox', { name: /Что стало понятнее/ })
    .fill('Стало понятнее, с чего начать.');
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что дальше?', exact: true })).toBeFocused();
}

async function openTodaySection(page: Page): Promise<void> {
  const mobileNavigation = page.getByRole('navigation', { name: 'Мобильная навигация' });
  if (await mobileNavigation.isVisible()) {
    await mobileNavigation.getByRole('button', { name: 'День', exact: true }).click();
    return;
  }
  await page
    .getByRole('navigation', { name: 'Основные разделы' })
    .getByRole('button', { name: 'День', exact: true })
    .click();
}

async function readElapsedSeconds(page: Page): Promise<number> {
  const label = await page.locator('[role="timer"]').getAttribute('aria-label');
  const match = /^Прошло (\d+):(\d{2}):(\d{2})$/.exec(label ?? '');
  if (match === null) {
    throw new Error(`Unexpected walk timer label: ${label ?? 'missing'}`);
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function expectTouchSafeActiveControls(page: Page): Promise<void> {
  const actions = page.locator('.walk-active-actions');
  await actions.evaluate((element) => element.scrollIntoView({ block: 'center' }));

  for (const name of ['Пауза', 'Завершить']) {
    const button = page.getByRole('button', { name, exact: true });
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(48);
  }

  const abandonBounds = await page
    .getByRole('button', { name: 'Прервать', exact: true })
    .boundingBox();
  expect(abandonBounds).not.toBeNull();
  expect(abandonBounds!.height).toBeGreaterThanOrEqual(44);

  const navigation = page.getByRole('navigation', { name: 'Мобильная навигация' });
  const actionBounds = await actions.boundingBox();
  const navigationBounds = await navigation.boundingBox();
  expect(actionBounds).not.toBeNull();
  expect(navigationBounds).not.toBeNull();
  expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(navigationBounds!.y);
}

async function expectTouchSafeStateRanges(page: Page): Promise<void> {
  for (const name of ['Энергия', 'Напряжение', 'Ясность']) {
    const bounds = await page.getByRole('slider', { name: new RegExp(name) }).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
}

async function attachWalkScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectTouchSafeReflectionControls(page: Page): Promise<void> {
  const actions = page.locator('.walk-reflection-guidance-actions');
  await actions.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  for (const button of await actions.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
}

async function expectTouchSafeReentryControls(page: Page): Promise<void> {
  const actions = page.locator('.walk-reentry-actions');
  await actions.evaluate((element) => element.scrollIntoView({ block: 'center' }));

  for (const button of await actions.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }

  const navigation = page.getByRole('navigation', { name: 'Мобильная навигация' });
  const actionBounds = await actions.boundingBox();
  const navigationBounds = await navigation.boundingBox();
  expect(actionBounds).not.toBeNull();
  expect(navigationBounds).not.toBeNull();
  expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(navigationBounds!.y);
}

async function expectStageWithinViewport(
  page: Page,
  selector: string,
  verifyBothMobileWidths: boolean,
): Promise<void> {
  const sizes = verifyBothMobileWidths
    ? [
        { width: 390, height: 844 },
        { width: 360, height: 800 },
      ]
    : [page.viewportSize()];

  for (const size of sizes) {
    expect(size).not.toBeNull();
    await page.setViewportSize(size!);
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size!.width);
  }
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function openWalks(page: Page, mobile: boolean): Promise<void> {
  if (mobile) {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    const menu = page.getByRole('dialog', { name: 'Меню LifeOS' });
    await menu.getByRole('button', { name: 'Прогулки', exact: true }).click();
    return;
  }
  await page
    .getByRole('navigation', { name: 'Основные разделы' })
    .getByRole('button', { name: 'Прогулки', exact: true })
    .click();
}
