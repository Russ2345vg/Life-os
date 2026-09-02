import { expect, test, type Page, type TestInfo } from '@playwright/test';

test('R5 keeps relaxation optional, persistent, order-independent, and mobile-safe', async ({
  page,
}, testInfo) => {
  const issues = observeRuntimeIssues(page);
  const today = await openRelaxationRoute(page);
  await seedRelaxingEvening(page, today);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Как ты сейчас?' })).toBeVisible();
  await page.locator('input[name="calm-before"][value="3"]').check();
  await page.locator('input[name="readiness-before"][value="3"]').check();
  await page.getByRole('button', { name: 'Сохранить и продолжить' }).click();

  const relaxation = page.locator('.evening-relaxation');
  await expect(
    relaxation
      .locator('.evening-relaxation-status')
      .getByRole('heading', { name: 'Переход к спокойствию' }),
  ).toBeVisible();

  const continueButton = relaxation.getByRole('button', { name: 'Перейти ко сну' });
  await expect(continueButton).toBeDisabled();

  await relaxation.getByLabel('Практика расслабления').selectOption('MEDITATION');
  await relaxation.getByRole('button', { name: 'Только сегодня' }).click();
  await expect(relaxation.getByRole('heading', { name: 'Медитация' })).toBeVisible();
  await expect(relaxation.getByText('Базовая практика: Чтение')).toBeVisible();
  await relaxation.getByRole('button', { name: '20 мин' }).click();
  await relaxation.getByRole('button', { name: 'Начать таймер' }).click();

  await relaxation.getByRole('button', { name: 'Начать без экранов' }).click();
  await relaxation.getByRole('button', { name: 'Сократить до 10 минут' }).click();
  await expect(
    relaxation.getByRole('heading', { name: '10 минут тишины от экранов' }),
  ).toBeVisible();

  await page.reload();
  await expect(relaxation.getByRole('heading', { name: 'Медитация' })).toBeVisible();
  await expect(
    relaxation.getByRole('heading', { name: '10 минут тишины от экранов' }),
  ).toBeVisible();
  await expect(relaxation.getByText('Таймер не запущен')).toHaveCount(0);

  await relaxation.getByRole('button', { name: 'Отметить гигиену' }).click();
  await relaxation.getByRole('button', { name: 'Отметить напиток' }).click();
  await relaxation.getByRole('button', { name: 'Отметить выполненным' }).click();
  await expect(continueButton).toBeDisabled();
  await relaxation.getByRole('button', { name: 'Пропустить сегодня' }).click();
  await expect(relaxation.getByText('Пропущено сегодня')).toBeVisible();
  await expect(continueButton).toBeEnabled();

  await page.reload();
  await expect(relaxation.getByText('Пропущено сегодня')).toBeVisible();
  await expect(relaxation.getByText('Выполнено', { exact: true })).toHaveCount(3);
  await expect(continueButton).toBeEnabled();
  await expectRelaxationLayout(page, testInfo);

  await continueButton.focus();
  await expect(continueButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.evening-sleep-check-focus > header > h3')).toHaveText(
    'Проверка перед сном',
  );
  await expect(page.getByText('Насколько спокойна голова?')).toBeVisible();
  expect(issues).toEqual([]);
});

async function openRelaxationRoute(page: Page): Promise<string> {
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
              if (cycle.dateKey === today && typeof cycle.id === 'string') {
                cycleStore.delete(cycle.id);
              }
            }
            cycleStore.put({
              schemaVersion: 1,
              id: `r5-e2e-${today}`,
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
          reject(transaction.error ?? new Error('Cannot seed R5 evening'));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error('R5 evening seeding was aborted'));
        };
      };
    });
  }, dateKey);
}

async function expectRelaxationLayout(page: Page, testInfo: TestInfo): Promise<void> {
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
    await expect(page.locator('.evening-relaxation')).toBeVisible();
    const facts = await page.evaluate(() => {
      const regions = [...document.querySelectorAll<HTMLElement>('[data-relaxation-region]')];
      const buttons = [
        ...document.querySelectorAll<HTMLButtonElement>('.evening-relaxation button'),
      ];
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        order: regions.map((region) => ({
          name: region.dataset.relaxationRegion,
          top: region.getBoundingClientRect().top,
        })),
        buttonHeights: buttons.map((button) => button.getBoundingClientRect().height),
      };
    });
    expect(facts.overflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
    expect(facts.order.map((item) => item.name)).toEqual([
      'status',
      'essentials',
      'screen-free',
      'practice',
      'continuation',
    ]);
    for (let index = 1; index < facts.order.length; index += 1) {
      expect(
        facts.order[index]!.top,
        `${viewport.width}x${viewport.height}`,
      ).toBeGreaterThanOrEqual(facts.order[index - 1]!.top);
    }
    expect(
      Math.round(Math.min(...facts.buttonHeights)),
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
