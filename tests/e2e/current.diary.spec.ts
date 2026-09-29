import { expect, test, type Page } from '@playwright/test';
import { addDays } from '../../src/domain/planner/PlanningPeriod';

test('daily diary saves, survives navigation and recovers a failed draft', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto('/#/v2/today');
  const today = await localToday(page);
  const navigation = page.getByRole('navigation', { name: 'Рабочий интерфейс' });
  const diaryLink = navigation.getByRole('link', { name: 'Дневник', exact: true });
  await expect(navigation.locator(':scope > a:visible, :scope > button:visible')).toHaveCount(5);
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
  const worldBetter = page.getByLabel('Что я сделал сегодня, чтобы мир стал лучше?');
  await worldBetter.fill('Помог коллеге разобраться в сложной задаче.');
  await page.getByRole('button', { name: 'Завершить день', exact: true }).click();
  await expect(page.getByText('День завершён', { exact: true })).toBeVisible();
  await page.reload();
  await expect(worldBetter).toHaveValue('Помог коллеге разобраться в сложной задаче.');
  await expect(page.getByText('День завершён', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Предыдущий период', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`date=${addDays(today, -1)}`));
  await failDiaryWrites(page);
  const note = page.getByLabel('Свободная заметка');
  await note.fill('Локальный текст после временной ошибки.');
  const saveAlert = page.getByRole('alert');
  await expect(saveAlert).toContainText('Локальный текст сохранён');
  await restoreDiaryWrites(page);
  await saveAlert.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(saveAlert).toHaveCount(0);
  await expect(page.getByText('Все изменения сохранены', { exact: true })).toBeVisible();

  const tomorrow = page.getByLabel('Что хочу повторить или сделать иначе завтра?');
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
  const learned = page.getByLabel('Чему я научился за эту неделю?');
  await learned.fill('Замечать результат раньше, чем усталость.');
  await page.getByRole('button', { name: 'Завершить неделю', exact: true }).click();
  await expect(page.getByText('Итоги завершены', { exact: true })).toBeVisible();
  await page.reload();
  await expect(learned).toHaveValue('Замечать результат раньше, чем усталость.');

  await page.goto('/#/v2/diary?period=month&date=2026-02-01');
  await expect(summary).toContainText('2 из 28 дней');
  await expect(page.getByRole('region', { name: 'Недели месяца' })).toContainText('23–28 февраля');
  await expect(page.getByRole('region', { name: 'Из недельных итогов' })).toHaveCount(0);
  await page.getByLabel('Какое самое важное достижение месяца?').fill('Сохранил ритм практики.');
  await page.getByRole('button', { name: 'Завершить месяц', exact: true }).click();
  await expect(page.getByText('Итоги завершены', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Какое самое важное достижение месяца?')).toHaveValue(
    'Сохранил ритм практики.',
  );

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

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
