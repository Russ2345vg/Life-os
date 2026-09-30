import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const enabled = process.env.VITE_LIFEOS_MEMORY_ENABLED === 'true';
const png = readFileSync('public/lifeos-forest-atmosphere.png');

test('memory reads an empty timeline and year with the compatibility flag', async ({ page }) => {
  await page.goto('/#/v2/memory');
  await expect(page.getByRole('heading', { name: 'Память жизни', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Пока нет воспоминаний', exact: true }),
  ).toBeVisible();
  if (!enabled)
    await expect(
      page.getByRole('button', { name: 'Добавить воспоминание', exact: true }).first(),
    ).toBeDisabled();
  await page.getByRole('button', { name: 'Мой год', exact: true }).click();
  await expect(page.getByText('Пока нет воспоминаний за этот год', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test('memory compatibility reads existing events while every write control is disabled', async ({
  page,
}) => {
  test.skip(enabled, 'This scenario exercises the default-off compatibility build.');
  await page.goto('/#/v2/memory?year=2026');
  await expect(page.getByRole('heading', { name: 'Память жизни', exact: true })).toBeVisible();
  await seedMemories(page, '2026-02-24');
  await page.reload();
  await expect(page.locator('.memory-card')).toHaveCount(30);
  await expect(
    page.getByRole('button', { name: 'Отметить главным', exact: true }).first(),
  ).toBeDisabled();
  await page.goto('/#/v2/memory/memory-31?year=2026');
  const detail = page.getByRole('dialog', { name: 'Воспоминание', exact: true });
  await expect(detail).toContainText('Событие 31');
  await expect(detail.getByRole('button', { name: 'Редактировать', exact: true })).toBeDisabled();
  await expect(
    detail.getByRole('button', { name: 'Удалить воспоминание', exact: true }),
  ).toBeDisabled();
  await detail.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  await page.getByRole('button', { name: 'Мой год', exact: true }).click();
  await expect(page.getByText('Воспоминаний за год: 32', { exact: true })).toBeVisible();
});

test.describe('memory writes after device compatibility rollout', () => {
  test.skip(!enabled, 'Creation is intentionally disabled until devices support memory_event.');
  test('memory permits text edits with an unchanged date from another time zone', async ({
    page,
  }) => {
    await page.goto('/#/v2/memory');
    await expect(page.getByRole('heading', { name: 'Память жизни', exact: true })).toBeVisible();
    const tomorrow = await page.evaluate(() => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    });
    await seedMemories(page, tomorrow);
    await page.goto(`/#/v2/memory/memory-31?year=${tomorrow.slice(0, 4)}`);
    await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Редактировать воспоминание', exact: true });
    await editor.getByLabel('История', { exact: true }).fill('Правка только текста');
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Воспоминание', exact: true })).toContainText(
      'Правка только текста',
    );
    expect((await readMemory(page, 'memory-31')).occurredOn).toBe(tomorrow);
  });
  test('memory photo survives create, reload, edit, highlight, year, delete and restore', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/#/v2/memory');
    const opener = page.getByRole('button', { name: 'Добавить воспоминание', exact: true }).first();
    await opener.click();
    const editor = page.getByRole('dialog', { name: 'Новое воспоминание', exact: true });
    await editor.getByLabel('Название', { exact: true }).fill('Запомнить прогулку');
    await editor.getByLabel('История', { exact: true }).fill('Первый текст');
    await editor
      .getByLabel('Фотография', { exact: true })
      .setInputFiles({ name: 'memory.png', mimeType: 'image/png', buffer: png });
    await expect(editor.getByAltText('Выбранная фотография')).toBeVisible();
    await screenshot(page, testInfo.project.name, 'editor');
    await editor.locator('form').evaluate((element) => {
      const form = element as HTMLFormElement;
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(editor).toHaveCount(0);
    await expect.poll(() => countMemories(page)).toBe(1);
    await expect(
      page.getByRole('status').filter({ hasText: 'Воспоминание сохранено' }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByAltText('Фотография воспоминания')).toBeVisible();
    await screenshot(page, testInfo.project.name, 'timeline');
    await page.getByRole('button', { name: 'Запомнить прогулку', exact: true }).click();
    await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
    const editing = page.getByRole('dialog', { name: 'Редактировать воспоминание', exact: true });
    await editing.getByLabel('Название', { exact: true }).fill('Прогулка и важная мысль');
    await editing.getByLabel('История', { exact: true }).fill('Текст после правки');
    await editing.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Воспоминание', exact: true });
    await expect(detail).toContainText('Текст после правки');
    await detail.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
    await page.getByLabel('Поиск воспоминаний').fill('важная мысль');
    await expect(page.locator('.memory-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Отметить главным', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Убрать из главных', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Мой год', exact: true }).click();
    await expect(page.getByText('Воспоминаний за год: 1', { exact: true })).toBeVisible();
    await screenshot(page, testInfo.project.name, 'year');
    await page.getByRole('button', { name: 'Открыть воспоминание', exact: true }).first().click();
    await detail.getByRole('button', { name: 'Удалить воспоминание', exact: true }).click();
    await expect(detail.getByRole('button', { name: 'Восстановить', exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
    await expect(page.getByText('Воспоминаний за год: 0', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Лента', exact: true }).click();
    await page.getByRole('button', { name: 'Удалённые', exact: true }).click();
    await page.getByRole('button', { name: 'Прогулка и важная мысль', exact: true }).click();
    await detail.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await expect(detail.getByAltText('Фотография воспоминания')).toBeVisible();
    await detail.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
    await page.getByRole('button', { name: 'Удалённые', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Прогулка и важная мысль', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    expect(errors).toEqual([]);
  });

  test('failed photo and browser back keep the draft until an explicit discard', async ({
    page,
  }) => {
    await page.goto('/#/v2/today');
    await page.getByRole('button', { name: 'Ещё', exact: true }).click();
    await page
      .locator('#planner-more-menu')
      .getByRole('link', { name: 'Память жизни', exact: true })
      .click();
    await page.getByRole('button', { name: 'Добавить воспоминание', exact: true }).first().click();
    const editor = page.getByRole('dialog', { name: 'Новое воспоминание', exact: true });
    await editor.getByLabel('Название', { exact: true }).fill('Несохранённый текст');
    await editor
      .getByLabel('Фотография', { exact: true })
      .setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
    await expect(editor.getByRole('alert')).toContainText('Текст остаётся в редакторе');
    await expect(editor.getByLabel('Название', { exact: true })).toHaveValue('Несохранённый текст');
    await page.goBack();
    await expect(page).toHaveURL(/#\/v2\/memory/);
    await expect(
      editor.getByRole('alert').filter({ hasText: 'Есть несохранённые изменения' }),
    ).toBeVisible();
    await editor.getByRole('button', { name: 'Продолжить редактирование', exact: true }).click();
    await editor.press('Escape');
    await editor.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(() => countMemories(page)).toBe(0);
  });

  test('memory pages reset on filters and a direct pending photo can be kept or removed', async ({
    page,
  }) => {
    await page.goto('/#/v2/memory');
    await expect(page.getByRole('heading', { name: 'Память жизни', exact: true })).toBeVisible();
    const today = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    });
    await seedMemories(page, today);
    await page.reload();
    await expect(page.locator('.memory-card')).toHaveCount(30);
    await page.getByRole('button', { name: 'Показать ещё', exact: true }).click();
    await expect(page.locator('.memory-card')).toHaveCount(32);
    await page.getByLabel('Тип события').selectOption('insight');
    await expect(page.locator('.memory-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
    await expect(page.locator('.memory-card')).toHaveCount(30);
    await page.goto(`/#/v2/memory/pending?year=${today.slice(0, 4)}`);
    const detail = page.getByRole('dialog', { name: 'Воспоминание', exact: true });
    await expect(detail).toContainText('Фотография загружается');
    await detail.getByRole('button', { name: 'Редактировать', exact: true }).click();
    const editing = page.getByRole('dialog', { name: 'Редактировать воспоминание', exact: true });
    await expect(editing).toContainText('Фотография ещё загружается');
    await editing.getByLabel('История', { exact: true }).fill('Правка без удаления фото');
    await editing.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(detail).toContainText('Правка без удаления фото');
    expect((await readMemory(page, 'pending')).syncAttachment).toEqual({ fileId: 'pending-photo' });
    await detail.getByRole('button', { name: 'Редактировать', exact: true }).click();
    await editing.getByRole('button', { name: 'Удалить фотографию', exact: true }).click();
    await editing.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect.poll(async () => (await readMemory(page, 'pending')).syncAttachment).toBeNull();
  });

  test('memory save failure and a concurrent edit retain the local draft', async ({ page }) => {
    await page.goto('/#/v2/memory');
    await page.getByRole('button', { name: 'Добавить воспоминание', exact: true }).first().click();
    const editor = page.getByRole('dialog', { name: 'Новое воспоминание', exact: true });
    await editor.getByLabel('Название', { exact: true }).fill('Сохранить несмотря на ошибку');
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction;
      const fixture = window as Window & { memoryOriginalTransaction?: typeof original };
      fixture.memoryOriginalTransaction = original;
      IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
        const stores = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
        if (args[1] === 'readwrite' && stores.includes('memoryEvents'))
          throw new DOMException('Нет места', 'QuotaExceededError');
        return original.apply(this, args);
      };
    });
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('Текст остаётся в редакторе');
    await expect(editor.getByLabel('Название', { exact: true })).toHaveValue(
      'Сохранить несмотря на ошибку',
    );
    await expect.poll(() => countMemories(page)).toBe(0);
    await page.evaluate(() => {
      const fixture = window as Window & {
        memoryOriginalTransaction?: typeof IDBDatabase.prototype.transaction;
      };
      if (fixture.memoryOriginalTransaction)
        IDBDatabase.prototype.transaction = fixture.memoryOriginalTransaction;
      delete fixture.memoryOriginalTransaction;
    });
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(() => countMemories(page)).toBe(1);
    await page.getByRole('button', { name: 'Сохранить несмотря на ошибку', exact: true }).click();
    await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
    const editing = page.getByRole('dialog', { name: 'Редактировать воспоминание', exact: true });
    await editing.getByLabel('Название', { exact: true }).fill('Моя локальная правка');
    const id = decodeURIComponent(new URL(page.url()).hash.split('?')[0]!.split('/').at(-1)!);
    await page.evaluate(async (eventId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('memoryEvents', 'readwrite');
          const store = tx.objectStore('memoryEvents');
          const request = store.get(eventId);
          request.onsuccess = () => {
            const record = request.result as { version: number };
            store.put({ ...record, version: record.version + 1, title: 'Правка другого окна' });
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    }, id);
    await editing.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(editing.getByRole('alert')).toContainText('Текст остаётся в редакторе');
    await expect(editing.getByLabel('Название', { exact: true })).toHaveValue(
      'Моя локальная правка',
    );
    expect((await readMemory(page, id)).title).toBe('Правка другого окна');
    await expect.poll(() => countMemories(page)).toBe(1);
  });
});

async function screenshot(page: Page, project: string, state: string): Promise<void> {
  const directory = '.superpowers/sdd/2026-09-29-life-memory/qa';
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${project}-${state}.png`), fullPage: true });
}

async function countMemories(page: Page): Promise<number> {
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
async function readMemory(page: Page, id: string): Promise<Readonly<Record<string, unknown>>> {
  return page.evaluate(async (memoryId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Readonly<Record<string, unknown>>>((resolve, reject) => {
        const request = db.transaction('memoryEvents').objectStore('memoryEvents').get(memoryId);
        request.onsuccess = () => resolve(request.result as Readonly<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, id);
}
async function seedMemories(page: Page, today: string): Promise<void> {
  await page.evaluate(async (date) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('memoryEvents', 'readwrite');
        for (let i = 0; i < 32; i++)
          tx.objectStore('memoryEvents').put({
            schemaVersion: 1,
            id: i === 0 ? 'pending' : `memory-${String(i).padStart(2, '0')}`,
            occurredOn: date,
            title: i === 0 ? 'Ожидаемое фото' : `Событие ${i}`,
            body: 'Текст воспоминания',
            kind: i === 1 ? 'insight' : 'moment',
            isHighlight: false,
            context: null,
            diarySource: null,
            photo: null,
            syncAttachment: i === 0 ? { fileId: 'pending-photo' } : null,
            createdAt: `${date}T08:00:00.000Z`,
            updatedAt: `${date}T08:00:00.000Z`,
            deletedAt: null,
            version: 1,
          });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, today);
}
