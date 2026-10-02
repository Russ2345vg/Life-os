import { expect, test, type Page } from '@playwright/test';

interface HistoryFixture {
  pendingCount(): number;
  query(index: number): { search?: string; cursor?: string } | null;
  resolve(index: number, ids: string[], nextCursor: string | null): void;
}
const pendingCount = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { walkHistoryFixture: HistoryFixture }).walkHistoryFixture.pendingCount(),
  );
const query = (page: Page, index: number) =>
  page.evaluate(
    (index) =>
      (window as unknown as { walkHistoryFixture: HistoryFixture }).walkHistoryFixture.query(index),
    index,
  );
async function resolve(page: Page, index: number, ids: string[], nextCursor: string | null) {
  await page.evaluate(
    ({ index, ids, nextCursor }) =>
      (window as unknown as { walkHistoryFixture: HistoryFixture }).walkHistoryFixture.resolve(
        index,
        ids,
        nextCursor,
      ),
    { index, ids, nextCursor },
  );
}

test('late history page cannot replace results after a filter change', async ({ page }) => {
  await page.goto('/tests/fixtures/walk-history-race.html');
  await expect.poll(() => pendingCount(page)).toBe(1);
  await resolve(page, 0, ['first-result'], 'next-page');
  await expect(page.getByText('first-result', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Показать ещё 30' }).click();
  await expect.poll(() => pendingCount(page)).toBe(2);
  expect((await query(page, 1))?.cursor).toBe('next-page');

  await page.getByRole('searchbox', { name: 'Поиск по вопросу и итогу' }).fill('new');
  await expect.poll(() => pendingCount(page)).toBe(3);
  expect((await query(page, 2))?.search).toBe('new');
  await resolve(page, 2, ['new-result'], null);
  await expect(page.getByText('new-result', { exact: true })).toBeVisible();
  await resolve(page, 1, ['old-page-result'], null);
  await expect(page.getByText('new-result', { exact: true })).toBeVisible();
  await expect(page.getByText('old-page-result', { exact: true })).toHaveCount(0);
});
