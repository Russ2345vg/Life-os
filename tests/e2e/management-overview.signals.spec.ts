import { expect, test, type Page } from '@playwright/test';
import { DayDate, Direction, EntityId, Project } from '../../src/domain';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { ProjectGoalCompatibility } from '../../src/infrastructure/persistence/mappers/ProjectGoalCompatibility';
import { DecisionRecordMapper } from '../../src/infrastructure/persistence/mappers/DecisionRecordMapper';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { createPlannedDecision } from '../../src/test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../src/test/helpers/LifeActionTestFactory';

async function seed(page: Page, count: number) {
  const date = DayDate.create((await page.locator('.overview-date').getAttribute('datetime'))!);
  const now = new Date();
  const directions = ['Развитие', 'Здоровье', 'Дом', 'Творчество'].map((name, index) =>
    DirectionRecordMapper.toRecord(
      Direction.create({ id: EntityId.create(`overview-direction-${index}`), name, now }),
    ),
  );
  const goals = Array.from({ length: count }, (_, index) =>
    ProjectGoalCompatibility.toRecord(
      Project.create({
        id: EntityId.create(`overview-goal-${index}`),
        directionId: EntityId.create('overview-direction-0'),
        title:
          index === 0
            ? 'Прочитать 12 книг'
            : index === 1
              ? 'SYNC03_WINDOWS_OFFLINE_PROJECT_V2_ПОЛНОЕ_НАЗВАНИЕ_ЦЕЛИ'
              : `Цель ${index + 1}`,
        now,
      }),
    ),
  );
  const decision = createPlannedDecision('overview-today', date);
  const action = createReadyLifeAction('overview-today', date, { decisionId: decision.id });
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['directions', 'goals', 'decisions', 'lifeActions'], 'readwrite');
        records.directions.forEach((record) => tx.objectStore('directions').put(record));
        records.goals.forEach((record) => tx.objectStore('goals').put(record));
        tx.objectStore('decisions').put(records.decision);
        tx.objectStore('lifeActions').put(records.action);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      directions,
      goals,
      decision: DecisionRecordMapper.toRecord(decision),
      action: LifeActionRecordMapper.toRecord(action),
    },
  );
}

test('overview preserves distinct goal links, real day counts and long signal lists', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Existing index.html has no favicon. Record that unrelated resource warning explicitly.
    if (message.location().url.endsWith('/favicon.ico') && message.text().includes('404')) {
      info.annotations.push({
        type: 'known-resource-warning',
        description: 'Existing /favicon.ico returns 404',
      });
    } else errors.push(message.text());
  });
  await page.goto('/#/goals');
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await seed(page, 2);
  await page.reload();
  await page.getByRole('button', { name: 'Управление', exact: true }).click();
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('.overview-signal-list li')).toHaveCount(3);
  await expect(page.locator('.overview-signal-count')).toHaveText('Все сигналы: 3');
  await expect(
    page
      .getByRole('region', { name: 'Сегодня', exact: true })
      .locator('.overview-row')
      .filter({ hasText: 'Решения' })
      .locator('strong'),
  ).toHaveText('1');
  await expect(
    page
      .getByRole('region', { name: 'Сегодня', exact: true })
      .locator('.overview-row')
      .filter({ hasText: 'Действия' })
      .locator('strong'),
  ).toHaveText('1');
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [768, 1024],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`overview-data-${width}.png`), fullPage: true });
  }
  const names = ['Прочитать 12 книг', 'SYNC03_WINDOWS_OFFLINE_PROJECT_V2_ПОЛНОЕ_НАЗВАНИЕ_ЦЕЛИ'];
  for (const name of names) {
    await page
      .locator('.overview-signal-list li')
      .filter({ hasText: name })
      .getByRole('button', { name: 'Открыть цель', exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  }
  const overviewDate = await page.locator('.overview-date').getAttribute('datetime');
  await page.getByRole('button', { name: 'Открыть день', exact: true }).click();
  await expect(page.locator('.today-page')).toContainText('Решение overview-today');
  await expect(page.getByLabel('Выбрать дату', { exact: true })).toHaveValue(overviewDate!);
  await expect(page.locator('.today-metric').filter({ hasText: 'Решения' })).toContainText('0 / 1');
  await expect(
    page.locator('.today-metric').filter({ has: page.getByText('Действия', { exact: true }) }),
  ).toContainText('0 / 1');
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await seed(page, 14);
  await page.reload();
  await page.getByRole('button', { name: 'Управление', exact: true }).click();
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('.overview-signal-list li')).toHaveCount(15);
  await expect(page.locator('.overview-signal-count')).toHaveText('Все сигналы: 15');
  await page
    .locator('.overview-signal-list li')
    .last()
    .getByRole('button')
    .scrollIntoViewIfNeeded();
  const last = await page
    .locator('.overview-signal-list li')
    .last()
    .getByRole('button')
    .boundingBox();
  const bottom = await page.locator('.application-bottom-navigation').boundingBox();
  if (bottom !== null) expect(last!.y + last!.height).toBeLessThanOrEqual(bottom.y);
  // Simulate a linked record disappearing after the overview snapshot, in this disposable context only.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('goals', 'readwrite');
      tx.objectStore('goals').delete('overview-goal-0');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page
    .locator('.overview-signal-list li')
    .filter({ hasText: names[0] })
    .getByRole('button', { name: 'Открыть цель', exact: true })
    .click();
  await expect(page.getByText('Цель не найдена', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
