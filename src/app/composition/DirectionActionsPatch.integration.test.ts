import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { EntityId, LifeActionTitle } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

describe('direction actions patch', () => {
  it('inherits direction context, persists it and keeps reports on one completion only', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({
      database,
      clock: new FakeClock(new Date('2026-09-21T10:00:00Z')),
      idGenerator: new FakeIdGenerator('patch'),
    });
    try {
      const sphere = await app.createSphere.execute({ name: 'Восстановление тест' });
      if (!sphere.ok) throw sphere.error;
      const direction = await app.createDirection.execute({
        name: 'Сон',
        sphereId: sphere.value.id,
      });
      if (!direction.ok) throw direction.error;
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Отдых'),
        directionId: direction.value.id,
        recurrence: {
          title: 'Отдых',
          goalId: null,
          priority: null,
          startDate: '2026-09-21',
          endDate: null,
          maxCompletions: null,
          paused: false,
          pauseUntil: null,
          schedule: { kind: 'daily' },
        },
      });
      if (!created.ok) throw created.error;
      expect(created.value.directionId?.toString()).toBe(direction.value.id.toString());
      expect(created.value.sphereId?.toString()).toBe(sphere.value.id.toString());
      await app.planning.recurrence.materialize('2026-09-21', '2026-09-22');
      expect((await app.completeLifeAction.execute({ lifeActionId: created.value.id })).ok).toBe(
        true,
      );
      const completed = (await app.lifeActionRepository.findById(created.value.id))!;
      await app.planning.progress.saveResult(
        completed.id.toString(),
        completed.completionKey,
        'Сделано: отдых\nРезультат: 8 часов\nЗаметка: легко проснулся',
      );
      const seriesId = created.value.occurrence!.ruleId;
      const choices = await app.getRoutineActionOptions.choices();
      expect(
        choices.filter((o) => o.selection.kind === 'series' && o.selection.ruleId === seriesId),
      ).toHaveLength(1);
      const block = await app.createRoutineBlock.execute({
        anchorDate: created.value.plannedDate!,
        title: 'Повторение',
        startTime: '08:00',
        endTime: '08:30',
        category: 'other',
        recurrence: 'daily',
        required: false,
        assignmentKind: 'existingSeries',
        ruleId: EntityId.create(seriesId),
      });
      if (!block.ok) throw block.error;
      const tomorrow = await app.getRoutineActionDetails.series(
        EntityId.create(seriesId),
        '2026-09-22',
      );
      expect(tomorrow?.lifeAction.id.toString()).not.toBe(created.value.id.toString());
      expect(tomorrow?.lifeAction.plannedDate?.toString()).toBe('2026-09-22');
      await app.planning.periods.participate('week', '2026-09-21', 'rule', seriesId);
      expect(
        (await app.planning.periods.load()).memberships.some(
          (m) => m.entityType === 'rule' && m.entityId === seriesId,
        ),
      ).toBe(true);
      database.close();
      const restored = (await app.lifeActionRepository.findById(created.value.id))!;
      expect(restored.actualResult?.toString()).toContain('8 часов');
      expect(restored.directionId?.toString()).toBe(direction.value.id.toString());
      const next = (await app.lifeActionRepository.findAll!()).find(
        (a) => a.occurrence?.originalDate === '2026-09-22',
      )!;
      expect(next.status).toBe('draft');
      expect(next.actualResult).toBeNull();
      expect(next.directionId?.toString()).toBe(direction.value.id.toString());
      await app.planning.progress.reopen(restored.id.toString());
      await app.completeLifeAction.execute({ lifeActionId: restored.id });
      await expect(
        app.planning.progress.saveResult(
          restored.id.toString(),
          completed.completionKey,
          'Устаревшее',
        ),
      ).rejects.toMatchObject({ code: 'life_action.completion_changed' });
      const noDirectionGoal = await app.createGoal.execute({ title: 'Без направления' });
      if (!noDirectionGoal.ok) throw noDirectionGoal.error;
      expect(
        (
          await app.createLifeActionDraft.execute({
            title: LifeActionTitle.create('Конфликт'),
            directionId: direction.value.id,
            goalId: noDirectionGoal.value.id,
          })
        ).ok,
      ).toBe(false);
      expect(await app.planning.recurrence.resolveForDate('not-synced', '2026-09-21')).toBeNull();
      const count = await app.planning.recurrence.save({
        title: 'Счётчик',
        goalId: null,
        priority: null,
        startDate: '2026-09-21',
        endDate: null,
        maxCompletions: 10,
        paused: false,
        pauseUntil: null,
        schedule: { kind: 'count' },
      });
      const countToday = await app.planning.recurrence.selectForDate(count.id, '2026-09-21');
      expect(countToday?.plannedDate?.toString()).toBe('2026-09-21');
      expect(await app.planning.recurrence.selectForDate(count.id, '2026-09-22')).toBeNull();
      await app.completeLifeAction.execute({ lifeActionId: countToday!.id });
      const countTomorrow = await app.planning.recurrence.selectForDate(count.id, '2026-09-22');
      expect(countTomorrow?.id.toString()).not.toBe(countToday?.id.toString());
      expect(
        (await app.planning.recurrence.resolveForDate(count.id, '2026-09-21'))?.id.toString(),
      ).toBe(countToday?.id.toString());
      const missing = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Нет'),
        directionId: EntityId.create('missing'),
      });
      expect(missing.ok).toBe(false);
    } finally {
      database.close();
    }
  });
});
