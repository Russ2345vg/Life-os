import { expect, test, type Page } from '@playwright/test';

test('Evening Center step 3 builds tomorrow in four compact stages and keeps the shell locked', async ({
  page,
}) => {
  const issues = observeRuntimeIssues(page);
  const today = await openEveningRoute(page);
  await seedTomorrowPlanningEvening(page, today);
  await page.reload();

  await expect(page.getByText('Шаг 3 из 5')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сегодня: завершён' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Осмысление: завершён' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Завтра: активен' })).toBeVisible();
  await expect(page.locator('.evening-kpi-card')).toHaveCount(3);
  await expect(page.locator('.evening-kpi-card-icon svg')).toHaveCount(3);

  const continueButton = page.getByRole('button', { name: 'Продолжить →' });
  const sceneBounds = await page.locator('.evening-command-center-scene-content').boundingBox();
  const continueBounds = await continueButton.boundingBox();
  expect(sceneBounds).not.toBeNull();
  expect(continueBounds).not.toBeNull();
  expect(continueBounds!.y + continueBounds!.height).toBeLessThanOrEqual(
    sceneBounds!.y + sceneBounds!.height + 1,
  );
  await expect(continueButton).toBeDisabled();
  await page.getByRole('button', { name: 'Выбрать или создать решение' }).click();
  await page.getByRole('button', { name: 'Новое решение' }).click();

  const primarySection = page.getByRole('region', { name: 'Главное решение' });
  await primarySection.getByLabel('Решение').fill('Подготовить рабочую форму Завтра');
  await primarySection
    .getByLabel('Ожидаемый результат')
    .fill('Форма проверена в реальном Evening Center');

  const boundaryGroup = page.getByRole('radiogroup', { name: 'Граница результата' });
  await expect(boundaryGroup.getByRole('radio')).toHaveCount(3);
  await expect(boundaryGroup.getByRole('radio', { name: 'Норма' })).toBeChecked();
  await page
    .getByRole('textbox', { name: 'Граница результата — Норма' })
    .fill('Основной сценарий готов');
  await boundaryGroup.getByRole('radio', { name: 'Минимум' }).click();
  await page
    .getByRole('textbox', { name: 'Граница результата — Минимум' })
    .fill('Можно пройти основной путь');
  await boundaryGroup.getByRole('radio', { name: 'Максимум' }).click();
  await page
    .getByRole('textbox', { name: 'Граница результата — Максимум' })
    .fill('Проверены соседние состояния');

  await page
    .getByPlaceholder('Конкретное действие для старта завтра')
    .fill('Открыть Evening Center и пройти форму');
  await page
    .getByPlaceholder('Что должно измениться после первого шага?')
    .fill('Появился сохранённый план');

  await page.getByRole('button', { name: 'Добавить решение' }).click();
  await page
    .getByRole('textbox', { name: 'Новое дополнительное решение' })
    .fill('Проверить мобильную композицию');

  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  await expect(page.getByRole('heading', { name: 'Завтра подготовлено' })).toBeVisible();
  await expect(page.getByText('Подготовить рабочую форму Завтра')).toBeVisible();
  await expect(page.getByText('Основной сценарий готов')).toBeVisible();
  await expect(page.getByText('Открыть Evening Center и пройти форму')).toBeVisible();
  await expect(page.getByText('Проверить мобильную композицию')).toBeVisible();
  await expect(page.getByText(/^1$/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Перейти к подготовке →' }).click();
  await expect(page.getByText('Шаг 4 из 5')).toBeVisible();
  expect(issues).toEqual([]);
});

async function openEveningRoute(page: Page): Promise<string> {
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

async function seedTomorrowPlanningEvening(page: Page, dateKey: string): Promise<void> {
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
              id: `tomorrow-working-form-e2e-${today}`,
              dayId: day.id,
              dateKey: today,
              state: 'PLANNING_TOMORROW',
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
          reject(transaction.error ?? new Error('Cannot seed tomorrow planning evening'));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error('Tomorrow planning seed was aborted'));
        };
      };
    });
  }, dateKey);
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
