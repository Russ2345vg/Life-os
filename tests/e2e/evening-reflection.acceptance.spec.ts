import { expect, test, type Page, type TestInfo } from '@playwright/test';

test('Evening Center step 2 keeps the locked shell and persists a conditional conclusion', async ({
  page,
}, testInfo) => {
  const issues = observeRuntimeIssues(page);
  const today = await openReflectionRoute(page);
  await seedReflectingEvening(page, today);
  await page.reload();

  await expect(page.getByText('Шаг 2 из 5')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сегодня: завершён' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Осмысление: активен' })).toBeVisible();
  await expect(page.getByText('Есть ли один полезный вывод из сегодняшнего дня?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Да', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Нет', exact: true })).toBeVisible();

  const continueButton = page.getByRole('button', { name: 'Продолжить' });
  await expect(continueButton).toBeDisabled();
  await expect(page.getByPlaceholder('Коротко сформулируйте вывод дня')).toHaveCount(0);

  const yesButton = page.getByRole('button', { name: 'Да', exact: true });
  await yesButton.focus();
  await expect(yesButton).toBeFocused();
  await page.keyboard.press('Enter');

  const conclusion = page.getByPlaceholder('Коротко сформулируйте вывод дня');
  await expect(conclusion).toBeVisible();
  await expect(continueButton).toBeDisabled();
  await conclusion.fill('Защищать первый час от уведомлений');
  await expect(continueButton).toBeEnabled();

  await expectReflectionLayout(page, testInfo);

  await continueButton.click();
  await expect(page.getByText('Шаг 3 из 5')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Осмысление: завершён' })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Шаг 3 из 5')).toBeVisible();
  await page.getByRole('button', { name: 'Осмысление: завершён' }).click();
  await expect(page.getByText('1 из 2')).toBeVisible();
  await page.getByRole('button', { name: 'Следующий вопрос' }).click();
  await expect(page.getByText('Защищать первый час от уведомлений')).toBeVisible();
  expect(issues).toEqual([]);
});

async function openReflectionRoute(page: Page): Promise<string> {
  await page.goto('/');
  const today = await page.evaluate(() => {
    const value = new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  await page.goto(`/#/routine/evening?date=${today}`);
  await expect(page.getByRole('heading', { name: 'Вечерний центр', exact: true })).toBeVisible();
  return today;
}

async function seedReflectingEvening(page: Page, dateKey: string): Promise<void> {
  await page.evaluate(async (today) => {
    const timestamp = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onerror = () => reject(request.error ?? new Error('Cannot open LifeOS database'));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(['days', 'eveningCycles'], 'readwrite');
        const dayStore = transaction.objectStore('days');
        const cycleStore = transaction.objectStore('eveningCycles');
        const daysRequest = dayStore.getAll();
        const cyclesRequest = cycleStore.getAll();

        daysRequest.onsuccess = () => {
          const day = (daysRequest.result as Array<Record<string, unknown>>).find(
            (record) => record.date === today,
          );
          if (day === undefined || typeof day.id !== 'string') {
            transaction.abort();
            return;
          }
          dayStore.put({
            ...day,
            status: 'open',
            openedAt: day.openedAt ?? timestamp,
            completedAt: null,
            decisionIds: [],
            lifeActionIds: [],
            version: Number(day.version ?? 0) + 1,
          });

          cyclesRequest.onsuccess = () => {
            for (const cycle of cyclesRequest.result as Array<Record<string, unknown>>) {
              if (cycle.dateKey === today && typeof cycle.id === 'string') {
                cycleStore.delete(cycle.id);
              }
            }
            cycleStore.put({
              schemaVersion: 1,
              id: `reflection-v2-e2e-${today}`,
              dayId: day.id,
              dateKey: today,
              state: 'REFLECTING',
              mode: 'NORMAL',
              modeReason: null,
              completion: 'COMPLETED',
              skippedStages: [],
              startedAt: timestamp,
              updatedAt: timestamp,
              completedAt: null,
              decisionIds: [],
              lifeActionIds: [],
              openLoopReferences: [],
              openLoopResolutions: [],
              reflectionQuestions: [],
              reflectionResults: [],
              reflectionSignals: [],
              reflectionCorrections: [],
              version: 1,
            });
          };
        };

        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error('Cannot seed reflection evening'));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error('Reflection evening seeding was aborted'));
        };
      };
    });
  }, dateKey);
}

async function expectReflectionLayout(page: Page, testInfo: TestInfo): Promise<void> {
  const viewports =
    testInfo.project.name === 'mobile-chrome'
      ? [
          { width: 390, height: 844 },
          { width: 360, height: 800 },
        ]
      : [
          { width: 1440, height: 900 },
          { width: 1280, height: 720 },
        ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.evening-reflection-scene')).toBeVisible();
    const facts = await page.evaluate(() => {
      const kpis = [...document.querySelectorAll<HTMLElement>('.evening-kpi-card')];
      const scene = document.querySelector<HTMLElement>('.evening-reflection-scene');
      const continueAction = document.querySelector<HTMLElement>(
        '.evening-reflection-actions .primary-button',
      );
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        kpiCount: kpis.length,
        kpiIconCounts: kpis.map(
          (item) => item.querySelectorAll('.evening-kpi-card-icon svg').length,
        ),
        kpiHeights: kpis.map((item) => Math.round(item.getBoundingClientRect().height)),
        sceneBottom: scene?.getBoundingClientRect().bottom ?? 0,
        viewportHeight: window.innerHeight,
        continueBottom: continueAction?.getBoundingClientRect().bottom ?? 0,
      };
    });

    expect(facts.overflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
    expect(facts.kpiCount).toBe(3);
    expect(facts.kpiIconCounts).toEqual([1, 1, 1]);
    if (testInfo.project.name === 'desktop-chrome') {
      expect(new Set(facts.kpiHeights).size, `${viewport.width}x${viewport.height}`).toBe(1);
      expect(facts.sceneBottom, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
        facts.viewportHeight + 1,
      );
      expect(facts.continueBottom, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
        facts.sceneBottom,
      );
      await page.screenshot({
        path: testInfo.outputPath(`evening-reflection-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
    }
  }
}

function observeRuntimeIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
      issues.push(`console: ${message.text()}`);
    }
  });
  return issues;
}
