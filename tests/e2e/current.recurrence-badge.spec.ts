import { expect, test } from '@playwright/test';
import { EntityId, LifeAction, LifeActionTitle } from '../../src/domain';
import { validateRule, type RecurrenceSchedule } from '../../src/domain/planner/RecurrenceRule';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';
import { RecurrenceRuleRecordMapper } from '../../src/infrastructure/persistence/PlanningRecordMappers';

test('recurrence labels remain readable with long schedules on desktop and mobile', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/#/v2/actions');
  await expect(page.getByRole('heading', { name: 'Действия', exact: true })).toBeVisible();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const schedules: RecurrenceSchedule[] = [{ kind: 'daily' }, { kind: 'interval', days: 30 }];
  const rules = schedules.map((schedule, index) =>
    validateRule({
      id: `badge-rule-${index}`,
      title: ['Читать каждый день', 'Обновлять личный план развития'][index]!,
      goalId: null,
      priority: null,
      startDate: today,
      endDate: null,
      maxCompletions: null,
      paused: false,
      pauseUntil: null,
      schedule,
      revision: 1,
      effectiveFrom: today,
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    }),
  );
  const actions = rules.map((rule, index) => {
    const action = LifeAction.createDraft({
      id: EntityId.create(`badge-action-${index}`),
      title: LifeActionTitle.create(rule.title),
      createdAt: now,
      eventId: EntityId.create(`badge-created-${index}`),
    });
    action.setPlanningMetadata({
      occurrence: {
        ruleId: rule.id,
        slot: today,
        originalDate: today,
        ruleRevision: 1,
      },
    });
    return action;
  });
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['lifeActions', 'recurrenceRules'], 'readwrite');
        records.actions.forEach((record) => tx.objectStore('lifeActions').put(record));
        records.rules.forEach((record) => tx.objectStore('recurrenceRules').put(record));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      actions: actions.map(LifeActionRecordMapper.toRecord),
      rules: rules.map(RecurrenceRuleRecordMapper.toRecord),
    },
  );
  await page.reload();
  const badges = page.locator('.planner-recurrence-badge');
  await expect(badges).toHaveCount(2);
  for (const label of ['Каждый день', 'Через 30 дн. после выполнения']) {
    await expect(badges.filter({ hasText: label })).toBeVisible();
  }
  for (const badge of await badges.all()) {
    expect(await badge.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await testInfo.attach('badge-styles', {
    body: JSON.stringify(
      await badges.first().evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          color: styles.color,
          background: styles.backgroundColor,
          border: styles.border,
          fontSize: styles.fontSize,
        };
      }),
    ),
    contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath('recurrence-badges.png'), fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(badges.first()).toBeVisible();
  expect(errors).toEqual([]);
});
