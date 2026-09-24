import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_SPHERES } from '../../src/application/commands/EnsureDefaultSpheres';
import { Direction, EntityId, Sphere } from '../../src/domain';
import { SphereRecordMapper } from '../../src/infrastructure/persistence/mappers/SphereRecordMapper';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import type { SphereRecord } from '../../src/infrastructure/persistence/records/SphereRecord';

const now = new Date('2026-09-24T12:00:00Z');
function sphere(id: string, name: string, selected = false) {
  return Sphere.create({
    id: EntityId.create(id),
    name,
    includeInBalanceWheel: selected,
    desiredLevel: 8,
    description: 'Сохранить описание',
    now,
  });
}
async function seed(page: Page, spheres: Sphere[], directions: Direction[] = []) {
  await page.goto('/#/v2/spheres');
  await expect(page.getByRole('heading', { name: 'Сферы жизни', exact: true })).toBeVisible();
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['spheres', 'directions'], 'readwrite');
        tx.objectStore('spheres').clear();
        tx.objectStore('directions').clear();
        records.spheres.forEach((r) => tx.objectStore('spheres').put(r));
        records.directions.forEach((r) => tx.objectStore('directions').put(r));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      spheres: [
        ...spheres,
        ...DEFAULT_SPHERES.filter((d) => !spheres.some((s) => s.name === d.name)).map((d) =>
          sphere(d.id, d.name).archive(now),
        ),
      ].map(SphereRecordMapper.toRecord),
      directions: directions.map(DirectionRecordMapper.toRecord),
    },
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Сферы жизни', exact: true })).toBeVisible();
}
async function readSphere(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lifeos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const record = await new Promise<SphereRecord>((resolve, reject) => {
      const req = db.transaction('spheres').objectStore('spheres').get(id);
      req.onsuccess = () => resolve(req.result as SphereRecord);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record;
  }, id);
}

test('sphere start selects existing spheres, cancels safely and saves a real zero', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, [sphere('start-health', 'Здоровье'), sphere('start-work', 'Работа')]);
  await page.getByRole('button', { name: 'Выбрать сферы', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Сферы в колесе', exact: true });
  await expect(settings).toBeFocused();
  await settings.getByLabel('Здоровье', { exact: true }).click();
  await expect(settings.getByLabel('Здоровье', { exact: true })).toBeChecked();
  await expect(settings.getByLabel('Здоровье', { exact: true })).toBeEnabled();
  await settings.getByLabel('Работа', { exact: true }).click();
  await expect(settings.getByLabel('Работа', { exact: true })).toBeChecked();
  await expect(settings.getByLabel('Работа', { exact: true })).toBeEnabled();
  await settings.getByRole('button', { name: 'Готово', exact: true }).click();
  const first = page.getByRole('button', { name: 'Оценить первую сферу', exact: true });
  await expect(first).toBeVisible();
  await expect(page.getByRole('img', { name: /Колесо состояния/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('sphere-start.png'), fullPage: true });
  await first.click();
  const dialog = page.getByRole('dialog');
  const score = dialog.getByLabel('Ручная оценка · 0–10', { exact: true });
  await expect(score).toBeFocused();
  await score.fill('5');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(first).toBeFocused();
  expect((await readSphere(page, 'start-health')).manualScore).toBeNull();
  expect((await readSphere(page, 'start-work')).manualScore).toBeNull();
  await first.click();
  await expect(score).toBeFocused();
  await score.fill('0');
  await page.screenshot({ path: info.outputPath('sphere-score-form.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Оценено 1 из 2 сфер', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Колесо жизни', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByText('Оценено 1 из 2 сфер', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Оценить следующую сферу', exact: true }),
  ).toBeVisible();
  const records = await Promise.all(
    ['start-health', 'start-work'].map((id) => readSphere(page, id)),
  );
  expect(records.filter((r) => r.manualScore === 0)).toHaveLength(1);
  expect(
    records.every(
      (r) =>
        r.description === 'Сохранить описание' && r.desiredLevel === 8 && r.includeInBalanceWheel,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('sphere score preserves automatic calculation and retains input on version conflict', async ({
  page,
}) => {
  const health = sphere('auto-health', 'Здоровье', true);
  const direction = Direction.create({
    id: EntityId.create('auto-direction'),
    sphereId: health.id,
    name: 'Сон',
    manualScore: 7,
    now,
  });
  await seed(page, [health], [direction]);
  const edit = page.getByRole('button', { name: 'Изменить оценку', exact: false });
  await edit.click();
  const dialog = page.getByRole('dialog');
  const score = dialog.getByLabel('Ручная оценка · 0–10', { exact: true });
  await expect(score).toBeFocused();
  await expect(score).toHaveValue('');
  await expect(dialog.getByText('Автоматически: 7.0', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await readSphere(page, 'auto-health')).manualScore).toBeNull();
  await edit.click();
  await score.fill('3');
  const latest = await readSphere(page, 'auto-health');
  await page.evaluate(async (record) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('spheres', 'readwrite');
      tx.objectStore('spheres').put({ ...record, version: record.version + 1 });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, latest);
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Сфера изменилась');
  await expect(score).toHaveValue('3');
  expect((await readSphere(page, 'auto-health')).manualScore).toBeNull();
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(edit).toBeFocused();
});

test('sphere start creates the first sphere through the existing form', async ({ page }) => {
  await seed(page, []);
  await page.getByRole('button', { name: 'Создать первую сферу', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Название', { exact: true })).toBeFocused();
  await dialog.getByLabel('Название', { exact: true }).fill('Моя первая сфера');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Выбрать сферы', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Моя первая сфера', exact: true })).toBeVisible();
});
