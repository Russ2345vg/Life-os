import { expect, test, type Page } from '@playwright/test';
import { addDays } from '../../src/domain/planner/PlanningPeriod';

test.describe('diary memory transfer', () => {
  test.skip(
    process.env.VITE_LIFEOS_MEMORY_ENABLED === 'false',
    'Memory writes were explicitly disabled for this build.',
  );

  test('diary memory transfer does not reopen a clean prepared draft after leaving its period', async ({
    page,
  }) => {
    await page.goto('/#/v2/diary?period=day&date=2026-02-24');
    await page
      .getByRole('textbox', { name: 'Что я сделал сегодня, чтобы мир стал лучше?' })
      .fill('Ответ для переноса');
    await page
      .getByRole('button', {
        name: 'Сохранить в память: Что я сделал сегодня, чтобы мир стал лучше?',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Новое воспоминание', exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      location.hash = '#/v2/diary?period=day&date=2026-02-25';
    });
    await expect(page.getByRole('dialog', { name: 'Новое воспоминание', exact: true })).toHaveCount(
      0,
    );
    await page.evaluate(() => {
      location.hash = '#/v2/diary?period=day&date=2026-02-24';
    });
    await expect(
      page.getByRole('textbox', { name: 'Что я сделал сегодня, чтобы мир стал лучше?' }),
    ).toHaveValue('Ответ для переноса');
    await expect(page.getByRole('dialog', { name: 'Новое воспоминание', exact: true })).toHaveCount(
      0,
    );
    await expect.poll(() => memoryCount(page)).toBe(0);
  });

  test('diary memory transfer rejects a saved source changed outside the visible editor', async ({
    page,
  }) => {
    await page.goto('/#/v2/diary?period=day&date=2026-02-24');
    const answer = page.getByRole('textbox', {
      name: 'Что я сделал сегодня, чтобы мир стал лучше?',
    });
    await answer.fill('Мой видимый ответ');
    await expect(page.getByText('Все изменения сохранены', { exact: true })).toBeVisible();
    await bumpDiaryVersion(page, 'diary:day:2026-02-24', 'Ответ другого окна');
    await expect(answer).toHaveValue('Мой видимый ответ');
    await page
      .getByRole('button', {
        name: 'Сохранить в память: Что я сделал сегодня, чтобы мир стал лучше?',
        exact: true,
      })
      .click();
    await expect(page.getByRole('alert')).toContainText('Ответ дневника изменился');
    await expect(page.getByRole('dialog', { name: 'Новое воспоминание', exact: true })).toHaveCount(
      0,
    );
    await expect(answer).toHaveValue('Мой видимый ответ');
    await expect.poll(() => memoryCount(page)).toBe(0);
  });

  test('diary memory transfer flushes autosave, cancels without creating and keeps an independent snapshot', async ({
    page,
  }) => {
    const errors = collectBrowserErrors(page);
    await page.goto('/#/v2/diary?period=day&date=2026-02-24');
    const answer = page.getByRole('textbox', {
      name: 'Что я сделал сегодня, чтобы мир стал лучше?',
    });
    const transfer = page.getByRole('button', {
      name: 'Сохранить в память: Что я сделал сегодня, чтобы мир стал лучше?',
      exact: true,
    });
    await failDiaryWrites(page);
    await answer.fill('Помог другу освоить новый навык.');
    await transfer.click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Сначала повторите сохранение ответа' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Новое воспоминание', exact: true })).toHaveCount(
      0,
    );
    await expect(answer).toHaveValue('Помог другу освоить новый навык.');
    await restoreDiaryWrites(page);
    await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
    await transfer.click();
    const editor = page.getByRole('dialog', { name: 'Новое воспоминание', exact: true });
    await expect(editor.getByLabel('История', { exact: true })).toHaveValue(
      'Помог другу освоить новый навык.',
    );
    await expect(editor.getByLabel('Дата события')).toHaveValue('2026-02-24');
    await editor.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(() => memoryCount(page)).toBe(0);
    await expect(transfer).toBeFocused();

    await answer.fill('Помог другу и поддержал коллегу.');
    await transfer.click();
    await expect(editor.getByLabel('История', { exact: true })).toHaveValue(
      'Помог другу и поддержал коллегу.',
    );
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page).toHaveURL(/#\/v2\/memory\/[^?]+\?year=2026/);
    const memoryUrl = page.url();
    const detail = page.getByRole('dialog', { name: 'Воспоминание', exact: true });
    await expect(detail).toContainText('Помог другу и поддержал коллегу.');
    await detail.getByRole('button', { name: 'Открыть запись дневника', exact: true }).click();
    await expect(page).toHaveURL(/period=day&date=2026-02-24/);
    await answer.fill('Дополненная запись дневника.');
    await expect(page.getByText('Все изменения сохранены', { exact: true })).toBeVisible();
    await page.goto(memoryUrl);
    await expect(detail).toContainText('Запись дневника изменилась');
    await expect(detail).toContainText('Помог другу и поддержал коллегу.');
    await expect(detail).not.toContainText('Дополненная запись дневника.');
    await expect.poll(() => memoryCount(page)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('diary memory transfer preserves exact week and month sources and dates', async ({
    page,
  }) => {
    for (const item of [
      {
        period: 'week',
        date: '2026-02-23',
        occurredOn: '2026-03-01',
        label: 'Чему я научился за эту неделю?',
        text: 'Освоил новую технику.',
        kind: 'insight',
      },
      {
        period: 'month',
        date: '2026-02-01',
        occurredOn: '2026-02-28',
        label: 'Какое самое важное достижение месяца?',
        text: 'Завершил большой проект.',
        kind: 'achievement',
      },
    ]) {
      await page.goto(`/#/v2/diary?period=${item.period}&date=${item.date}`);
      await page.getByRole('textbox', { name: item.label }).fill(item.text);
      await page
        .getByRole('button', { name: `Сохранить в память: ${item.label}`, exact: true })
        .click();
      const editor = page.getByRole('dialog', { name: 'Новое воспоминание', exact: true });
      await expect(editor.getByLabel('Дата события')).toHaveValue(item.occurredOn);
      await expect(editor.getByRole('combobox', { name: 'Тип', exact: true })).toHaveValue(
        item.kind,
      );
      await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
      const detail = page.getByRole('dialog', { name: 'Воспоминание', exact: true });
      await expect(detail).toContainText(item.text);
      await detail.getByRole('button', { name: 'Открыть запись дневника', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`period=${item.period}&date=${item.date}`));
    }
    await expect.poll(() => memoryCount(page)).toBe(2);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
});

async function memoryCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('memoryEvents').objectStore('memoryEvents').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

test('daily diary saves, survives navigation and recovers a failed draft', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto('/#/v2/today');
  const today = await localToday(page);
  const navigation = page.getByRole('navigation', { name: 'Рабочий интерфейс' });
  const diaryLink = navigation.getByRole('link', { name: 'Дневник', exact: true });
  await expect(navigation.locator(':scope > a:visible, :scope > button:visible')).toHaveCount(6);
  await expect(navigation.getByRole('link', { name: 'Распорядок', exact: true })).toBeVisible();
  await diaryLink.focus();
  await expect(diaryLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Дневник', exact: true })).toBeVisible();

  const productivity = page.getByRole('radiogroup', { name: 'Продуктивность' });
  const firstRating = productivity.getByRole('radio', { name: '1', exact: true });
  await firstRating.focus();
  await page.keyboard.press('ArrowRight');
  await expect(productivity.getByRole('radio', { name: '2', exact: true })).toBeChecked();
  await rateDay(page, [5, 4, 4, 5]);
  const worldBetter = page.getByRole('textbox', {
    name: 'Что я сделал сегодня, чтобы мир стал лучше?',
  });
  await worldBetter.fill('Помог коллеге разобраться в сложной задаче.');
  await page.getByRole('button', { name: 'Завершить день', exact: true }).click();
  await expect(page.getByText('День завершён', { exact: true })).toBeVisible();
  await page.reload();
  await expect(worldBetter).toHaveValue('Помог коллеге разобраться в сложной задаче.');
  await expect(page.getByText('День завершён', { exact: true })).toBeVisible();
  await bumpDiaryVersion(page, `diary:day:${today}`);
  await page.getByRole('button', { name: 'Завершить день', exact: true }).click();
  const conflictAlert = page.getByRole('alert');
  await expect(conflictAlert).toContainText('Запись изменилась в другом окне');
  await conflictAlert
    .getByRole('button', { name: 'Применить мои изменения повторно', exact: true })
    .click();
  await expect(conflictAlert).toHaveCount(0);
  await expect(page.getByText('День завершён', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Предыдущий период', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`date=${addDays(today, -1)}`));
  await failDiaryWrites(page);
  const note = page.getByRole('textbox', { name: 'Свободная заметка' });
  await note.fill('Локальный текст после временной ошибки.');
  const saveAlert = page.getByRole('alert');
  await expect(saveAlert).toContainText('Локальный текст сохранён');
  await restoreDiaryWrites(page);
  await saveAlert.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(saveAlert).toHaveCount(0);
  await expect(page.getByText('Все изменения сохранены', { exact: true })).toBeVisible();

  const tomorrow = page.getByRole('textbox', {
    name: 'Что хочу повторить или сделать иначе завтра?',
  });
  await tomorrow.fill('Сначала сделать главное и только потом открывать входящие.');
  await navigation.getByRole('link', { name: 'Цели', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Цели', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Предыдущий период', exact: true }).click();
  await expect(note).toHaveValue('Локальный текст после временной ошибки.');
  await expect(tomorrow).toHaveValue('Сначала сделать главное и только потом открывать входящие.');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  expect(errors).toEqual([]);
});

test('weekly and monthly diary summaries respect completed coverage and month boundaries', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  await completeDay(page, '2026-02-24', [5, 3, 4, 5]);
  await completeDay(page, '2026-02-25', [4, 3, 4, 4]);

  await page.goto('/#/v2/diary?period=week&date=2026-02-23');
  const summary = page.locator('.planner-diary-summary');
  await expect(summary).toContainText('2 из 7 дней');
  await expect(
    summary
      .locator('.planner-diary-metrics > div')
      .filter({ hasText: 'Продуктивность' })
      .getByText('4,5', { exact: true }),
  ).toBeVisible();
  await expect(summary).toContainText('Завершено действий: 0');
  await expect(summary).toContainText('Целей с записями результата: 0');
  const learned = page.getByRole('textbox', { name: 'Чему я научился за эту неделю?' });
  await learned.fill('Замечать результат раньше, чем усталость.');
  await page.getByRole('button', { name: 'Завершить неделю', exact: true }).click();
  await expect(page.getByText('Итоги завершены', { exact: true })).toBeVisible();
  await page.reload();
  await expect(learned).toHaveValue('Замечать результат раньше, чем усталость.');

  await page.goto('/#/v2/diary?period=month&date=2026-02-01');
  await expect(summary).toContainText('2 из 28 дней');
  await expect(page.getByRole('region', { name: 'Недели месяца' })).toContainText('23–28 февраля');
  await expect(page.getByRole('region', { name: 'Из недельных итогов' })).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Какое самое важное достижение месяца?' })
    .fill('Сохранил ритм практики.');
  await page.getByRole('button', { name: 'Завершить месяц', exact: true }).click();
  await expect(page.getByText('Итоги завершены', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Какое самое важное достижение месяца?' }),
  ).toHaveValue('Сохранил ритм практики.');

  await page.goto('/#/v2/diary?period=month&date=2026-03-01');
  await expect(summary).toContainText('0 из 31 дней');
  await expect(page.getByRole('region', { name: 'Из недельных итогов' })).toContainText(
    'Замечать результат раньше, чем усталость.',
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  expect(errors).toEqual([]);
});

async function completeDay(
  page: Page,
  date: string,
  ratings: readonly [number, number, number, number],
): Promise<void> {
  await page.goto(`/#/v2/diary?period=day&date=${date}`);
  await expect(page.getByRole('heading', { name: 'Как прошёл день?', exact: true })).toBeVisible();
  await rateDay(page, ratings);
  await page
    .getByLabel('Что я сделал сегодня, чтобы мир стал лучше?')
    .fill(`Полезное действие за ${date}.`);
  await page.getByRole('button', { name: 'Завершить день', exact: true }).click();
  await expect(page.getByText('День завершён', { exact: true })).toBeVisible();
}

async function rateDay(
  page: Page,
  values: readonly [number, number, number, number],
): Promise<void> {
  const labels = ['Продуктивность', 'Энергия', 'Настроение', 'Общая оценка дня'] as const;
  for (const [index, label] of labels.entries())
    await page
      .getByRole('radiogroup', { name: label })
      .getByRole('radio', { name: String(values[index]), exact: true })
      .check();
}

async function localToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
}

async function failDiaryWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    const fixture = window as Window & { diaryOriginalTransaction?: typeof original };
    fixture.diaryOriginalTransaction = original;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const stores = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
      if (args[1] === 'readwrite' && stores.includes('diaryEntries'))
        throw new Error('Проверка временной ошибки дневника');
      return original.apply(this, args);
    };
  });
}

async function restoreDiaryWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    const fixture = window as Window & {
      diaryOriginalTransaction?: typeof IDBDatabase.prototype.transaction;
    };
    if (fixture.diaryOriginalTransaction)
      IDBDatabase.prototype.transaction = fixture.diaryOriginalTransaction;
    delete fixture.diaryOriginalTransaction;
  });
}

async function bumpDiaryVersion(page: Page, id: string, worldBetter?: string): Promise<void> {
  await page.evaluate(
    async ({ entryId, worldBetter }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('diaryEntries', 'readwrite');
          const store = transaction.objectStore('diaryEntries');
          const request = store.get(entryId);
          request.onsuccess = () => {
            const record = request.result as
              { version: number; payload: Readonly<Record<string, unknown>> } | undefined;
            if (record === undefined) {
              transaction.abort();
              return;
            }
            store.put({
              ...record,
              version: record.version + 1,
              payload:
                worldBetter === undefined ? record.payload : { ...record.payload, worldBetter },
            });
          };
          transaction.oncomplete = () => resolve();
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('Diary record missing'));
          transaction.onerror = () => reject(transaction.error);
        });
      } finally {
        database.close();
      }
    },
    { entryId: id, worldBetter },
  );
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
