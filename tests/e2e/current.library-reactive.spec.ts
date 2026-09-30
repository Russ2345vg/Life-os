import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

async function signal(page: Page, message: string) {
  await page.evaluate((value) => window.postMessage(value, location.origin), message);
}
async function metrics(page: Page) {
  return JSON.parse((await page.getByLabel('Read metrics').textContent())!) as {
    counts: Record<string, number>;
    pendingReads: number;
    activeSubscriptions: number;
    elapsed: number;
    heldFocus: boolean;
  };
}
async function settled(page: Page) {
  await expect.poll(async () => (await metrics(page)).pendingReads).toBe(0);
}

test('library application flow captures and converts an inbox item into an action', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/inbox');
  await page.getByLabel('Новая мысль', { exact: true }).fill('Проверить реактивное обновление');
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  const idea = page.getByRole('button', { name: 'Проверить реактивное обновление', exact: true });
  await expect(idea).toBeVisible();
  await page.screenshot({ path: info.outputPath('application-inbox.png') });
  await info.attach('effective-style', {
    body: JSON.stringify(
      await page.locator('.planner-content').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          font: style.fontFamily,
          color: style.color,
          background: style.backgroundColor,
          padding: style.padding,
          sheets: Array.from(document.styleSheets).map(
            (sheet) => sheet.href ?? sheet.ownerNode?.textContent?.slice(0, 80),
          ),
        };
      }),
    ),
    contentType: 'application/json',
  });
  await idea.click();
  await page.getByRole('button', { name: 'Превратить в действие', exact: true }).click();
  await page.goto('/#/v2/actions');
  const search = page.getByPlaceholder('Найти действие');
  await search.fill('Проверить реактивное обновление');
  const complete = page.getByRole('checkbox', {
    name: 'Выполнить: Проверить реактивное обновление',
    exact: true,
  });
  await expect(complete).toBeVisible();
  await page.screenshot({ path: info.outputPath('application-actions.png') });
  await complete.click();
  await expect(complete).toHaveCount(0);
  await expect(search).toHaveValue('Проверить реактивное обновление');
  expect(errors).toEqual([]);
});

for (const size of [100, 1000]) {
  test(`library benchmark ${size}: preserves list state and records reader counts`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/tests/fixtures/library-reactive.html?size=${size}`);
    const complete = page.getByRole('checkbox', { name: 'Выполнить: Действие 0001', exact: true });
    await expect(complete).toBeVisible({ timeout: 90_000 });
    await settled(page);
    const search = page.getByPlaceholder('Найти действие');
    await search.fill('Действие 0001');
    await page.screenshot({ path: info.outputPath('actions.png'), fullPage: true });
    await signal(page, 'library-reset');
    await expect.poll(async () => (await metrics(page)).counts.actions).toBe(0);
    const started = performance.now();
    await complete.click();
    await expect(complete).toHaveCount(0);
    await settled(page);
    await expect(search).toHaveValue('Действие 0001');
    const action = { ...(await metrics(page)), observedMs: performance.now() - started };
    await page.getByRole('button', { name: 'Календарь fixture' }).click();
    await expect(
      page.getByRole('heading', { name: 'Расписание недели', exact: true }),
    ).toBeVisible();
    await settled(page);
    await page.getByRole('button', { name: 'Настроить доступное время', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Доступное время', exact: true });
    await form.getByRole('spinbutton').fill('2');
    await signal(page, 'library-reset');
    await expect.poll(async () => (await metrics(page)).counts.capacity).toBe(0);
    const capacityStarted = performance.now();
    await form.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(form).toHaveCount(0);
    await settled(page);
    const capacity = { ...(await metrics(page)), observedMs: performance.now() - capacityStarted };
    const measurement = JSON.stringify({ size, action, capacity }, null, 2);
    await writeFile(info.outputPath('reader-counts.json'), measurement);
    await info.attach('reader-counts', {
      body: measurement,
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('calendar.png') });
    expect(errors).toEqual([]);
  });
}

test('library reactive background commit preserves draft, expanded note and focus without sync', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library-reactive.html');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Входящие fixture' }).click();
  await page.getByLabel('Новая мысль', { exact: true }).fill('Несохранённая мысль');
  await page.getByText('Добавить заметку', { exact: true }).click();
  const note = page.getByLabel('Заметка', { exact: true });
  await note.fill('Не потерять этот текст');
  await signal(page, 'library-capture');
  await expect(page.getByRole('button', { name: 'Фоновая мысль', exact: true })).toBeVisible();
  await expect(note).toHaveValue('Не потерять этот текст');
  await expect(note).toBeFocused();
  await expect(page.getByLabel('Новая мысль', { exact: true })).toHaveValue('Несохранённая мысль');
  await expect.poll(async () => (await metrics(page)).activeSubscriptions).toBe(1);
  await signal(page, 'library-unmount');
  await expect.poll(async () => (await metrics(page)).activeSubscriptions).toBe(0);
  await signal(page, 'library-mount');
  await expect(page.getByRole('button', { name: 'Фоновая мысль', exact: true })).toBeVisible();
  await expect.poll(async () => (await metrics(page)).activeSubscriptions).toBe(1);
});

test('library reactive failed refresh keeps data and retry recovers', async ({ page }) => {
  await page.goto('/tests/fixtures/library-reactive.html');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Входящие fixture' }).click();
  await expect(page.getByRole('button', { name: 'Сохранённая мысль', exact: true })).toBeVisible();
  await signal(page, 'library-fail');
  await signal(page, 'library-capture');
  await expect(page.getByRole('alert')).toContainText('Проверка ошибки чтения');
  await expect(page.getByRole('button', { name: 'Сохранённая мысль', exact: true })).toBeVisible();
  await signal(page, 'library-recover');
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Фоновая мысль', exact: true })).toBeVisible();
});

test('library reactive date change ignores an older pending focus result', async ({ page }) => {
  await page.goto('/tests/fixtures/library-reactive.html');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Фокус fixture' }).click();
  await expect(page.getByRole('heading', { name: 'Тестовая цель', exact: true })).toBeVisible();
  await signal(page, 'library-hold-focus');
  await expect.poll(async () => (await metrics(page)).heldFocus).toBe(true);
  await page.getByRole('button', { name: 'Сменить дату fixture' }).click();
  await expect(
    page.getByText('Фокус недели · 2026-10-05 — 2026-10-11', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Тестовая цель', exact: true })).toHaveCount(0);
  await signal(page, 'library-release-focus');
  await settled(page);
  await expect(
    page.getByText('Фокус недели · 2026-10-05 — 2026-10-11', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Тестовая цель', exact: true })).toHaveCount(0);
});

test('library reactive first-load error can be retried', async ({ page }) => {
  await page.goto('/tests/fixtures/library-reactive.html?fail=1');
  await expect(page.getByRole('alert')).toContainText('Проверка ошибки чтения');
  await signal(page, 'library-recover');
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('library completion updates linked goal counts and preserves a scrolled list', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library-reactive.html?size=100');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  await signal(page, 'library-goals');
  await expect(page.getByRole('link', { name: 'Действия · 1', exact: true })).toBeVisible();
  await signal(page, 'library-actions');
  const first = page.getByRole('checkbox', { name: 'Выполнить: Действие 0001', exact: true });
  await first.click();
  await expect(first).toHaveCount(0);
  await signal(page, 'library-goals');
  await expect(
    page.getByRole('link', { name: 'Действия · 0 · выполнено 1', exact: true }),
  ).toBeVisible();
  await signal(page, 'library-actions');
  const search = page.getByPlaceholder('Найти действие');
  await search.fill('Действие');
  const later = page.getByRole('checkbox', { name: 'Выполнить: Действие 0060', exact: true });
  await later.scrollIntoViewIfNeeded();
  const scrollPosition = () =>
    page.evaluate(() =>
      Math.max(
        document.scrollingElement?.scrollTop ?? 0,
        document.querySelector('main')?.scrollTop ?? 0,
      ),
    );
  const before = await scrollPosition();
  expect(before).toBeGreaterThan(200);
  await later.click();
  await expect(later).toHaveCount(0);
  await settled(page);
  expect(await scrollPosition()).toBeGreaterThan(before - 200);
  await expect(search).toHaveValue('Действие');
});
