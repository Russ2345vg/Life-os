import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.goto('/#/v2/directions');
  await expect(page.getByRole('heading', { name: 'Направления', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const [{ Direction, Sphere, EntityId }, { DirectionRecordMapper }, { SphereRecordMapper }] =
      await Promise.all([
        import('/src/domain/index.ts'),
        import('/src/infrastructure/persistence/mappers/DirectionRecordMapper.ts'),
        import('/src/infrastructure/persistence/mappers/SphereRecordMapper.ts'),
      ]);
    const now = new Date();
    const s = Sphere.create({
      id: EntityId.create('patch-sphere'),
      name: 'Восстановление QA',
      now,
    });
    const d = Direction.create({
      id: EntityId.create('patch-direction'),
      name: 'Сон QA',
      sphereId: s.id,
      now,
    });
    const other = Direction.create({ id: EntityId.create('patch-other'), name: 'Другое QA', now });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('lifeos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['spheres', 'directions'], 'readwrite');
      tx.objectStore('spheres').put(SphereRecordMapper.toRecord(s));
      [d, other].forEach((x) =>
        tx.objectStore('directions').put(DirectionRecordMapper.toRecord(x)),
      );
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
}

test('direction context, sphere filtering and optional completion result survive reload', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await page.getByRole('combobox', { name: 'Сфера', exact: true }).selectOption('patch-sphere');
  await expect(page.getByRole('link', { name: 'Сон QA', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Другое QA', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Сон QA', exact: true }).click();
  await page.getByRole('link', { name: 'Создать цель', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Направление необязательно' })).toHaveValue(
    'patch-direction',
  );
  await page.getByLabel('Название', { exact: true }).fill('Наладить сон QA');
  await page.getByRole('button', { name: 'Создать цель', exact: true }).click();
  await expect(page).toHaveURL(/directions\/patch-direction$/);
  await expect(page.getByRole('link', { name: 'Наладить сон QA', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Создать действие', exact: true }).click();
  await page
    .getByLabel('Название', { exact: true })
    .fill('Подготовить спальню с очень длинным названием для проверки переноса');
  await page.getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(page).toHaveURL(/directions\/patch-direction$/);
  await page
    .getByRole('link', {
      name: 'Подготовить спальню с очень длинным названием для проверки переноса',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('paragraph').filter({ hasText: 'Восстановление QA / Сон QA' }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: /Выполнить: Подготовить спальню/ }).click();
  await page
    .getByRole('dialog', { name: 'Итог задачи', exact: true })
    .getByRole('button', { name: 'Пропустить', exact: true })
    .click();
  const summary = page.locator('.planner-completion-result');
  await summary.locator('summary').click();
  const result = summary.getByLabel('Итог задачи', { exact: true });
  await result.fill('Сделано: проветрил комнату. Результат: прохладно. Заметка: лёг раньше.');
  await summary.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(summary.getByRole('status').filter({ hasText: 'Итог сохранён' })).toBeVisible();
  await page.reload();
  await summary.locator('summary').click();
  await expect(result).toHaveValue(/проветрил/);
  await result.focus();
  await expect(result).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('completion-result.png'), fullPage: true });
  expect(errors).toEqual([]);
});
