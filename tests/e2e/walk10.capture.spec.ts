import { expect, test, type Page, type TestInfo } from '@playwright/test';

const FIRST = 'Проверить одно допущение перед следующим шагом.';
const SECOND = 'Обсудить идею после прогулки.';

async function openWalks(page: Page, mobile: boolean) {
  await page.goto('/');
  if (mobile) {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await page
      .getByRole('dialog', { name: 'Меню LifeOS' })
      .getByRole('button', { name: 'Прогулки', exact: true })
      .click();
  } else
    await page
      .getByRole('navigation', { name: 'Основные разделы' })
      .getByRole('button', { name: 'Прогулки', exact: true })
      .click();
}

async function startReflection(page: Page, mobile: boolean) {
  await openWalks(page, mobile);
  await page.locator('[data-walk-quick-intent="reflection"]').click();
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Размышление', exact: true })).toBeVisible();
}

async function capture(page: Page, content: string) {
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Мысль', exact: true });
  await expect(field).toBeFocused();
  await field.fill(content);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Мысль сохранена' })).toBeVisible();
}

async function shot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}

async function readRecords(page: Page, storeName: string): Promise<Record<string, unknown>[]> {
  // Only reads synthetic data in the test's isolated browser context.
  return page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = database.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, storeName);
}

test('WALK-10 capture keeps timer running, survives reload and supports Inbox edit/process/history', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await startReflection(page, info.project.name === 'mobile-chrome');
  await expect(page.getByRole('button', { name: 'Сохранить мысль', exact: true })).toBeVisible();
  const before = await readRecords(page, 'walks');
  await expect
    .poll(
      async () => {
        const text = await page.getByRole('timer').innerText();
        return (text.match(/\d+:\d+:\d+/)?.[0] ?? '0')
          .split(':')
          .reduce((total, part) => total * 60 + Number(part), 0);
      },
      { timeout: 8000 },
    )
    .toBeGreaterThanOrEqual(5);
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Мысль', exact: true });
  await expect(field).toBeFocused();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
  await field.fill(FIRST);
  await field.scrollIntoViewIfNeeded();
  await shot(page, info, '01-active-composer');
  const timerBefore = await page.getByRole('timer').innerText();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Мысль сохранена' })).toBeVisible();
  await expect(page.getByRole('timer')).not.toHaveText(timerBefore);
  expect(await readRecords(page, 'walks')).toEqual(before);
  await shot(page, info, '02-saved-confirmation');
  await capture(page, SECOND);
  await page.reload();
  await expect(page.getByText('Сохранённые мысли · 2', { exact: true })).toBeVisible();
  expect((await readRecords(page, 'walkCaptures')).map((item) => item.content).sort()).toEqual(
    [FIRST, SECOND].sort(),
  );
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение завершения' })
    .getByRole('button', { name: 'Завершить', exact: true })
    .click();
  await page.getByText('Так же', { exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть без продолжения', exact: true }).click();
  // The click dispatches an async command; the Center appears only after Reentry is persisted.
  await expect(page.getByRole('heading', { name: 'Прогулки', exact: true })).toBeVisible();
  const completed = await readRecords(page, 'walks');
  expect(completed).toMatchObject([
    { status: 'completed', reentry: { status: 'closedWithoutContinuation' } },
  ]);
  await page.getByRole('button', { name: 'Входящие с прогулок · 2', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Входящие с прогулок', exact: true }),
  ).toBeFocused();
  const items = page.locator('.walk-capture-list-item');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText(SECOND);
  await shot(page, info, '03-inbox');
  await page.getByRole('button', { name: `Открыть мысль: ${FIRST}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Сохранённая мысль', exact: true })).toBeFocused();
  await shot(page, info, '04-capture-details');
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  const edit = page.getByRole('textbox', { name: 'Текст мысли', exact: true });
  await expect(edit).toBeFocused();
  await edit.fill('Уточнённая мысль — сначала маленький эксперимент.');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(
    page.getByText('Уточнённая мысль — сначала маленький эксперимент.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Обработано', exact: true }).click();
  await expect(items).toHaveCount(1);
  expect(await readRecords(page, 'walks')).toEqual(completed);
  await page.getByRole('button', { name: 'К прогулкам', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранённые мысли · 2', exact: true }).click();
  await expect(page.locator('.walk-capture-list-item')).toHaveCount(2);
  await expect(page.getByText('Обработано', { exact: true })).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Открыть мысль: Уточнённая мысль — сначала маленький эксперимент.',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Текст мысли', exact: true })
    .fill('Уточнение после обработки');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.getByText('Уточнение после обработки', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обработано', exact: true })).toHaveCount(0);
  const editedProcessed = (await readRecords(page, 'walkCaptures')).find(
    (item) => item.status === 'processed',
  );
  expect(editedProcessed?.content).toBe('Уточнение после обработки');
  await page.getByRole('button', { name: 'К списку мыслей', exact: true }).click();
  await page.getByRole('button', { name: 'К прогулкам', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Входящие с прогулок · 1', exact: true }),
  ).toBeVisible();
  await page.reload();
  expect(
    (await readRecords(page, 'walkCaptures')).filter((item) => item.status === 'processed'),
  ).toHaveLength(1);
  expect(await readRecords(page, 'lifeActions')).toEqual([]);
  expect(await readRecords(page, 'routineOccurrenceExecutions')).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [360, 390, 430]) {
  test(`WALK-10 mobile ${width} composer stays reachable in a reduced viewport`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile-chrome', 'Mobile layout matrix');
    await page.setViewportSize({ width, height: 844 });
    await startReflection(page, true);
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Мысль', exact: true });
    await expect(field).toBeFocused();
    await field.fill('Текст не теряется при изменении видимой области.');
    // A smaller viewport checks reachability, not an actual OS keyboard.
    await page.setViewportSize({ width, height: 420 });
    await field.scrollIntoViewIfNeeded();
    await expect(field).toBeInViewport();
    const save = page.getByRole('button', { name: 'Сохранить', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await save.evaluate((button) => {
        const r = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await shot(page, info, `05-mobile-${width}-reduced-viewport`);
    await save.click();
    await expect(page.getByRole('status').filter({ hasText: 'Мысль сохранена' })).toBeVisible();
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByText('Прогулка на паузе', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
    await field.fill('Отменить');
    await field.press('Escape');
    await expect(field).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Сохранить мысль', exact: true })).toBeFocused();
    expect(await readRecords(page, 'walkCaptures')).toHaveLength(1);
  });
}

test('WALK-10 keeps drafts on storage failures, blocks duplicate submit and retries Inbox loading', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startReflection(page, info.project.name === 'mobile-chrome');
  const walkBefore = await readRecords(page, 'walks');
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Мысль', exact: true });
  await field.fill(FIRST);
  // One synthetic storage failure in this test context; no production hooks or user data.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'walkCaptures') {
        IDBObjectStore.prototype.add = original;
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.walk-capture-composer [role="alert"]')).toBeVisible();
  await expect(field).toHaveValue(FIRST);
  expect(await readRecords(page, 'walkCaptures')).toEqual([]);
  // Two synchronous UI clicks exercise the submission guard before React rerenders.
  await page.getByRole('button', { name: 'Сохранить', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByRole('status').filter({ hasText: 'Мысль сохранена' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить мысль', exact: true })).toBeFocused();
  expect(await readRecords(page, 'walkCaptures')).toHaveLength(1);
  expect(await readRecords(page, 'walks')).toEqual(walkBefore);
  await page.getByRole('button', { name: 'Прервать', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение прерывания' })
    .getByRole('button', { name: 'Прервать', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Входящие с прогулок · 1', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const original = IDBIndex.prototype.getAll;
    Reflect.set(globalThis, '__walk10OriginalGetAll', original);
    IDBIndex.prototype.getAll = function (...args: Parameters<IDBIndex['getAll']>) {
      if (this.objectStore.name === 'walkCaptures')
        throw new DOMException('Synthetic read failure', 'UnknownError');
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Входящие с прогулок · 1', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить мысли');
  await expect(page.getByText(/Входящие пусты/)).toHaveCount(0);
  await page.evaluate(() => {
    IDBIndex.prototype.getAll = Reflect.get(
      globalThis,
      '__walk10OriginalGetAll',
    ) as IDBIndex['getAll'];
    Reflect.deleteProperty(globalThis, '__walk10OriginalGetAll');
  });
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await page.getByRole('button', { name: `Открыть мысль: ${FIRST}`, exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  const edit = page.getByRole('textbox', { name: 'Текст мысли', exact: true });
  await edit.fill('Правка после прогулки');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'walkCaptures') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Synthetic write failure', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(edit).toHaveValue('Правка после прогулки');
  expect((await readRecords(page, 'walkCaptures'))[0]?.content).toBe(FIRST);
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.getByText('Правка после прогулки', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Обработано', exact: true }).click();
  await expect(page.getByText(/Входящие пусты/)).toBeVisible();
  expect((await readRecords(page, 'walkCaptures'))[0]).toMatchObject({
    content: 'Правка после прогулки',
    status: 'processed',
    version: 3,
  });
  expect(errors).toEqual([]);
});

test('WALK-10 stale editor retains its draft and offers explicit discard/reload', async ({
  page,
}, info) => {
  await startReflection(page, info.project.name === 'mobile-chrome');
  await capture(page, FIRST);
  await page.getByRole('button', { name: 'Прервать', exact: true }).click();
  await page
    .getByRole('group', { name: 'Подтверждение прерывания' })
    .getByRole('button', { name: 'Прервать', exact: true })
    .click();
  await page.getByRole('button', { name: 'Входящие с прогулок · 1', exact: true }).click();
  await page.getByRole('button', { name: `Открыть мысль: ${FIRST}`, exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Текст мысли', exact: true });
  await editor.fill('Мой ещё не сохранённый текст');
  // Simulates another tab's committed edit to this test's sole synthetic Capture.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('walkCaptures', 'readwrite');
        const store = transaction.objectStore('walkCaptures');
        const request = store.getAll();
        request.onsuccess = () => {
          const record = request.result[0] as Record<string, unknown>;
          store.put({
            ...record,
            content: 'Сохранено в другой вкладке',
            version: Number(record.version) + 1,
            updatedAt: new Date().toISOString(),
          });
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('другой вкладке');
  await expect(editor).toHaveValue('Мой ещё не сохранённый текст');
  expect((await readRecords(page, 'walkCaptures'))[0]?.content).toBe('Сохранено в другой вкладке');
  await expect(
    page.getByRole('button', { name: 'Отменить правку и обновить', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Отменить правку и обновить', exact: true }).click();
  await expect(page.getByText('Сохранено в другой вкладке', { exact: true })).toBeVisible();
  await expect(editor).toHaveCount(0);
});
