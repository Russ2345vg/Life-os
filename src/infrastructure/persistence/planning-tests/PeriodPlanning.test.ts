import { executeIndexedDbRequest } from '../indexed-db/IndexedDbRequest';
import { focusWeek } from '../../../domain/planner/FocusPeriod';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import { Goal, EntityId, LifeAction, LifeActionTitle } from '../../../domain';
import { FakeClock, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { LifeOsIndexedDb } from '../indexed-db/LifeOsIndexedDb';
import { IndexedDbPlanningRepository } from '../IndexedDbPlanningRepository';
import { PeriodPlanning } from '../../../application/planner/PeriodPlanning';
describe('period participation commands', () => {
  it('replays a delayed legacy focus revision without overwriting later V2 edits', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory()),
      repo = new IndexedDbPlanningRepository(db),
      clock = new FakeClock(new Date('2026-09-14T10:00:00Z')),
      service = new PeriodPlanning(repo, clock, new FakeIdGenerator('f'));
    try {
      await repo.change((s) => {
        for (const id of ['a', 'b'])
          s.goals.push(
            Goal.create({ id: EntityId.create(id), title: id, status: 'active', now: clock.now() }),
          );
      });
      const opened = await db.open();
      const save = (version: number, goals: { goalId: string; role: 'primary' | 'supporting' }[]) =>
        executeIndexedDbRequest(opened, 'focusPeriods', 'readwrite', (store) =>
          store.put({
            ...focusWeek('2026-09-14'),
            version,
            schemaVersion: 1,
            updatedAt: clock.now().toISOString(),
            goals,
          }),
        );
      await save(1, [
        { goalId: 'a', role: 'primary' },
        { goalId: 'b', role: 'supporting' },
      ]);
      await service.load();
      await save(2, [{ goalId: 'b', role: 'primary' }]);
      let state = await service.load();
      expect(state.periods[0]?.primaryGoalId).toBe('b');
      expect(state.memberships.find((m) => m.entityId === 'a')?.removed).toBe(true);
      await service.setFocus('week', '2026-09-14', 'a', 'primary');
      await save(3, [{ goalId: 'b', role: 'primary' }]);
      state = await service.load();
      expect(state.periods[0]?.primaryGoalId).toBe('a');
      expect(state.memberships.find((m) => m.entityId === 'a')?.removed).toBe(false);
    } finally {
      db.close();
    }
  });

  it('keeps identities, dates and status independent and never automatically carries over', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory()),
      repo = new IndexedDbPlanningRepository(db),
      clock = new FakeClock(new Date('2026-09-14T10:00:00Z'));
    const service = new PeriodPlanning(repo, clock, new FakeIdGenerator('p'));
    try {
      await repo.change((s) => {
        s.goals.push(
          Goal.create({
            id: EntityId.create('g'),
            title: 'Цель',
            status: 'active',
            now: clock.now(),
          }),
        );
        s.actions.push(
          LifeAction.createDraft({
            id: EntityId.create('a'),
            title: LifeActionTitle.create('Шаг'),
            createdAt: clock.now(),
            eventId: EntityId.create('create'),
          }),
        );
      });
      await service.participate('year', '2026-09-14', 'goal', 'g');
      await service.participate('week', '2026-09-14', 'goal', 'g');
      await service.participate('week', '2026-09-14', 'action', 'a');
      await service.setFocus('week', '2026-09-14', 'g', 'primary');
      let state = await service.load();
      expect(state.goals).toHaveLength(1);
      expect(state.goals[0]?.status).toBe('active');
      expect(state.actions[0]?.plannedDate).toBeNull();
      expect(state.memberships).toHaveLength(3);
      await service.participate('week', '2026-09-14', 'goal', 'g', true);
      state = await service.load();
      expect(state.goals).toHaveLength(1);
      expect(state.periods.find((p) => p.kind === 'week')?.primaryGoalId).toBeNull();
      clock.setTime(new Date('2026-09-21T10:00:00Z'));
      expect((await service.load()).periods.some((p) => p.id === 'week:2026-09-21')).toBe(false);
      const first = await service.startCycle('2026-09-14');
      expect(await service.startCycle('2026-09-15')).toEqual(first);
    } finally {
      db.close();
    }
  });
});
