import { expect, test, type Page, type TestInfo } from '@playwright/test';

const TITLE = 'WALK-09 — какой следующий шаг проверить?';
const QUESTION = 'Как проверить самое важное допущение?';
const RESULT = 'Сначала обсудить один небольшой эксперимент.';

async function openDecision(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить главное решение', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название решения *', exact: true }).fill(TITLE);
  await page
    .getByRole('textbox', {
      name: 'Ожидаемый результат * Сформулируйте конкретный и проверяемый результат.',
      exact: true,
    })
    .fill('Уточнить направление без автоматического принятия решения');
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Создать решение', exact: true })
    .click();
  await page.getByRole('button', { name: `Открыть решение «${TITLE}»`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible();
}

async function screenshot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}

async function checkLayout(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

async function expectWalkFocus(page: Page, title: string): Promise<void> {
  const heading = page.getByRole('heading', { name: title, exact: true });
  await expect(heading).toBeFocused();
  // The stage heading keeps keyboard focus and uses the shared LifeOS focus treatment.
  await expect(heading).toHaveCSS('outline-color', 'rgb(199, 168, 98)');
  await expect(heading).toHaveCSS('outline-style', 'solid');
  await expect(heading).toHaveCSS('outline-width', '2px');
  await expect(heading).toHaveCSS('outline-offset', '2px');
}

for (const width of [null, 360, 430] as const) {
  test(`WALK-09 complete Decision return ${width ?? 'default'}`, async ({ page }, info) => {
    test.skip(
      width !== null && info.project.name !== 'mobile-chrome',
      'Extra widths are mobile QA only',
    );
    if (width !== null) await page.setViewportSize({ width, height: 844 });
    const issues: string[] = [];
    page.on('pageerror', (error) => issues.push(error.message));
    page.on('console', (message) => {
      // Match the existing smoke policy for the known, unrelated missing favicon.
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
        issues.push(`${message.text()} ${message.location().url}`);
      }
    });
    await openDecision(page);
    const before = await decisionRecord(page);
    const dialog = page.getByRole('dialog', { name: TITLE });
    await expect(dialog.getByText('Запланировано', { exact: true })).toBeVisible();
    const launch = dialog.getByRole('button', { name: 'Обдумать на прогулке', exact: true });
    await expect(launch).toBeVisible();
    await launch.scrollIntoViewIfNeeded();
    expect((await launch.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await screenshot(page, info, '01-decision-action');
    await launch.focus();
    await expect(launch).toBeFocused();
    await launch.press('Enter');
    await expect(page.getByRole('heading', { name: 'Подготовка к прогулке' })).toBeVisible();
    await expectWalkFocus(page, 'Подготовка к прогулке');
    await expect(page.getByLabel('Связано с решением')).toContainText(TITLE);
    await page
      .getByRole('textbox', { name: 'Вопрос для размышления необязательно' })
      .fill(QUESTION);
    await screenshot(page, info, '02-preparation');
    await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Размышление', exact: true })).toBeVisible();
    await expect(page.getByLabel('Связано с решением')).toContainText(TITLE);
    await page.reload();
    await expect(page.getByLabel('Связано с решением')).toContainText(TITLE);
    await expect(page.getByText(QUESTION, { exact: true })).toBeVisible();
    await expectWalkFocus(page, 'Размышление');
    await screenshot(page, info, '03-active-reflection');
    await checkLayout(page);
    await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Мысль', exact: true })
      .fill('Сначала проверить допущение решения');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Сохранить мысль', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await expect(page.getByText('Прогулка идёт', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Завершить', exact: true }).click();
    await page
      .getByRole('group', { name: 'Подтверждение завершения' })
      .getByRole('button', { name: 'Завершить', exact: true })
      .press('Enter');
    await expect(page.getByRole('heading', { name: 'Быстрый итог' })).toBeVisible();
    await expectWalkFocus(page, 'Быстрый итог');
    await page.getByText('Лучше', { exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Лучше', exact: true })).toBeChecked();
    await page.getByRole('textbox', { name: 'Что стало понятнее? необязательно' }).fill(RESULT);
    await screenshot(page, info, '04-completion');
    await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Вернуться к решению', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole('region', { name: 'Возвращение после прогулки' })
      .getByRole('button', { name: 'Продолжить', exact: true })
      .press('Enter');
    const returnButton = page.getByRole('button', { name: 'Вернуться к решению', exact: true });
    await expect(returnButton).toBeVisible();
    await expectWalkFocus(page, 'Что дальше?');
    await returnButton.scrollIntoViewIfNeeded();
    await screenshot(page, info, '05-reentry');
    await returnButton.click();
    await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: TITLE }).getByText('Запланировано', { exact: true }),
    ).toBeVisible();
    const outcome = page.getByRole('region', { name: 'Результат прогулки', exact: true });
    await expect(outcome).toContainText(RESULT);
    await outcome.scrollIntoViewIfNeeded();
    await screenshot(page, info, '06-decision-result');
    await checkLayout(page);
    expect(await decisionRecord(page)).toEqual(before);
    await page.getByRole('button', { name: 'Закрыть карточку решения' }).click();
    await page.getByRole('button', { name: 'Открыть предыдущий день', exact: true }).click();
    await expect(page.getByRole('dialog', { name: TITLE })).toHaveCount(0);
    if (info.project.name === 'mobile-chrome') {
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
    await page.getByRole('button', { name: 'История прогулок', exact: true }).click();
    await expect(page.locator('[data-walk-history-row]')).toHaveCount(1);
    await page.locator('[data-walk-history-row]').click();
    await expect(page.locator('.walk-history-detail')).toContainText(TITLE);
    await expect(page.locator('.walk-history-captures li')).toHaveCount(1);
    await expect(page.locator('.walk-history-captures')).toContainText(
      'Сначала проверить допущение решения',
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
    expect(await decisionRecord(page)).toEqual(before);
    expect(issues).toEqual([]);
  });
}

// Only operates on this test's isolated browser context and its own synthetic Decision.
async function decisionRecord(page: Page, markDeleted = false): Promise<Record<string, unknown>> {
  return page.evaluate(
    async ({ title, deleted }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<Record<string, unknown>>((resolve, reject) => {
          const transaction = database.transaction('decisions', deleted ? 'readwrite' : 'readonly');
          const store = transaction.objectStore('decisions');
          const request = store.getAll();
          let found: Record<string, unknown> | undefined;
          request.onsuccess = () => {
            found = (request.result as Record<string, unknown>[]).find(
              (record) => record.title === title,
            );
            if (found === undefined) {
              transaction.abort();
              return;
            }
            if (deleted) {
              const now = new Date().toISOString();
              found = {
                ...found,
                deletedAt: now,
                lastDeletedAt: now,
                version: Number(found.version) + 1,
              };
              store.put(found);
            }
          };
          transaction.oncomplete = () =>
            found === undefined ? reject(new Error('QA Decision missing')) : resolve(found);
          transaction.onabort = () => reject(new Error('QA Decision transaction aborted'));
          transaction.onerror = () => reject(transaction.error);
        });
      } finally {
        database.close();
      }
    },
    { title: TITLE, deleted: markDeleted },
  );
}

test('WALK-09 missing Decision keeps outcome and offers safe list fallback', async ({
  page,
}, info) => {
  await openDecision(page);
  await page.getByRole('button', { name: 'Обдумать на прогулке', exact: true }).click();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Размышление', exact: true })).toBeVisible();
  await decisionRecord(page, true);
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение завершения' })
    .getByRole('button', { name: 'Завершить', exact: true })
    .click();
  await page.getByText('Хуже', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Хуже', exact: true })).toBeChecked();
  await page.getByRole('textbox', { name: 'Что стало понятнее? необязательно' }).fill(RESULT);
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Связанное решение больше недоступно' }),
  ).toBeVisible();
  await expect(page.getByText(RESULT, { exact: true })).toBeVisible();
  await screenshot(page, info, '07-missing-decision');
  await page.getByRole('button', { name: 'Перейти в Решения', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Решения', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await decisionRecord(page)).deletedAt).not.toBeNull();
});

test('WALK-09 launch from a Decision returns to an existing paused Walk', async ({ page }) => {
  await openDecision(page);
  await page.getByRole('button', { name: 'Обдумать на прогулке', exact: true }).click();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: 'День', exact: true }).click();
  await page.getByRole('button', { name: `Открыть решение «${TITLE}»`, exact: true }).click();
  await page.getByRole('button', { name: 'Обдумать на прогулке', exact: true }).click();
  await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Подготовка к прогулке' })).toHaveCount(0);
});

test('WALK-09 returns to the current Decision date and can launch from Decisions', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop-chrome',
    'Date routing regression; mobile flow is covered above',
  );
  await openDecision(page);
  const original = await decisionRecord(page);
  await page.getByRole('button', { name: 'Обдумать на прогулке', exact: true }).click();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'День', exact: true }).click();
  await page.getByRole('button', { name: `Открыть решение «${TITLE}»`, exact: true }).click();
  await page.getByRole('button', { name: 'Перенести', exact: true }).click();
  const form = page.locator('.decision-reschedule-form');
  await form.getByRole('button', { name: 'Следующий день', exact: true }).click();
  await form.getByLabel(/Причина переноса/).fill('Явный перенос пользователем во время прогулки');
  await form.getByRole('button', { name: 'Перенести', exact: true }).click();
  await expect(form).toHaveCount(0);
  const afterExplicitReschedule = await decisionRecord(page);
  expect(afterExplicitReschedule.plannedDate).not.toEqual(original.plannedDate);
  const close = page.getByRole('button', { name: 'Закрыть карточку решения' });
  if (await close.isVisible()) await close.click();
  await page.getByRole('button', { name: 'Прогулки', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение завершения' })
    .getByRole('button', { name: 'Завершить', exact: true })
    .click();
  await page.getByText('Хуже', { exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await page.getByRole('button', { name: 'Вернуться к решению', exact: true }).click();
  await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Дата', exact: true })).toHaveValue(
    String(afterExplicitReschedule.plannedDate),
  );
  await expect(page.getByRole('region', { name: 'Результат прогулки' })).toContainText(
    'Текстовый вывод не добавлен.',
  );
  expect(await decisionRecord(page)).toEqual(afterExplicitReschedule);
  await page.getByRole('button', { name: 'Обдумать на прогулке', exact: true }).click();
  await expect(page.getByLabel('Связано с решением')).toContainText(TITLE);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible();
});
