import { expect, test, type Page, type TestInfo } from '@playwright/test';

test('R6 persists ratings, one corrective action and one retry across desktop/mobile refresh', async ({
  page,
}, testInfo) => {
  const issues = observeRuntimeIssues(page);
  const today = await openEveningRoute(page);
  await seedRelaxingEvening(page, today);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Как ты сейчас?' })).toBeVisible();
  await page.locator('input[name="calm-before"][value="2"]').check();
  await page.locator('input[name="readiness-before"][value="3"]').check();
  await page.getByRole('button', { name: 'Сохранить и продолжить' }).click();

  const relaxation = page.locator('.evening-relaxation');
  await expect(relaxation.locator('.evening-relaxation-status > h3')).toHaveText(
    'Переход к спокойствию',
  );
  await relaxation.getByRole('button', { name: 'Отметить напиток' }).click();
  await relaxation.getByRole('button', { name: 'Отметить гигиену' }).click();
  await relaxation.getByRole('button', { name: 'Отметить выполненным' }).click();
  await relaxation.getByRole('button', { name: 'Пропустить сегодня' }).click();
  const continueButton = relaxation.getByRole('button', { name: 'Перейти ко сну' });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  const sleep = page.locator('.evening-sleep-check');
  await expect(sleep.locator('.evening-sleep-check-focus > header > h3')).toHaveText(
    'Проверка перед сном',
  );
  await sleep.locator('input[name="calm-after"][value="4"]').check();
  await sleep.locator('input[name="readiness-after"][value="5"]').check();
  await sleep.getByRole('button', { name: 'Сохранить оценки' }).click();
  await expect(sleep.getByText('1 / 3')).toBeVisible();
  await expect(sleep.locator('.evening-sleep-check-question > h4')).toHaveText('Голова спокойна?');
  await sleep.getByRole('button', { name: 'Да' }).click();

  await page.reload();
  await expect(sleep.getByText('2 / 3')).toBeVisible();
  await expect(sleep.locator('.evening-sleep-check-question > h4')).toHaveText(
    'Есть что-то, что ещё держишь в голове?',
  );
  await sleep.getByRole('button', { name: 'Да' }).click();
  await sleep.getByRole('button', { name: 'Нет' }).click();
  await expect(sleep.locator('.evening-sleep-check-corrective > h4')).toHaveText(
    'Оставить одну мысль на завтра',
  );
  await sleep.getByRole('button', { name: 'Начать' }).click();

  await page.reload();
  const capture = sleep.getByLabel('Что оставить на завтра?');
  await expect(capture).toHaveAttribute('maxlength', '280');
  await capture.fill('Вернуться к смете завтра');
  await sleep.getByRole('button', { name: 'Готово' }).click();
  await expect(sleep.getByText('Проверим ещё раз')).toBeVisible();
  await sleep.getByRole('button', { name: 'Да' }).click();
  await expect(sleep.locator('.evening-sleep-check-summary > h4')).toHaveText(
    'Вечер можно отпустить',
  );

  await expectSleepLayout(page, testInfo);
  const finalButton = sleep.getByRole('button', { name: /Завершить вечер/ });
  await finalButton.focus();
  await expect(finalButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Завершение дня', { exact: true }).first()).toBeVisible();
  expect(issues).toEqual([]);
});

async function openEveningRoute(page: Page): Promise<string> {
  await page.goto('/');
  const today = await page.evaluate(() => {
    const value = new Date();
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  });
  await page.goto(`/#/routine/evening?date=${today}`);
  await expect(page.getByRole('heading', { name: 'Вечерний центр', exact: true })).toBeVisible();
  return today;
}

async function seedRelaxingEvening(page: Page, dateKey: string): Promise<void> {
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
            version: Number(day.version ?? 0) + 1,
          });
          cyclesRequest.onsuccess = () => {
            for (const cycle of cyclesRequest.result as Array<Record<string, unknown>>) {
              if (cycle.dateKey === today && typeof cycle.id === 'string')
                cycleStore.delete(cycle.id);
            }
            cycleStore.put({
              schemaVersion: 1,
              id: `r6-e2e-${today}`,
              dayId: day.id,
              dateKey: today,
              state: 'RELAXING',
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
          reject(transaction.error);
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error);
        };
      };
    });
  }, dateKey);
}

async function expectSleepLayout(page: Page, testInfo: TestInfo): Promise<void> {
  const viewports =
    testInfo.project.name === 'mobile-chrome'
      ? [
          { width: 390, height: 844 },
          { width: 360, height: 800 },
        ]
      : [
          { width: 1600, height: 900 },
          { width: 1280, height: 720 },
        ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const facts = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      journeyOverflow: (() => {
        const journey = document.querySelector<HTMLElement>('.evening-command-center-journey');
        return journey === null ? 0 : journey.scrollWidth - journey.clientWidth;
      })(),
      heights: [...document.querySelectorAll<HTMLButtonElement>('.evening-sleep-check button')].map(
        (button) => button.getBoundingClientRect().height,
      ),
    }));
    expect(facts.overflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
    expect(
      facts.journeyOverflow,
      `journey ${viewport.width}x${viewport.height}`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.round(Math.min(...facts.heights)),
      `${viewport.width}x${viewport.height}`,
    ).toBeGreaterThanOrEqual(44);
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
