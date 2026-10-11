import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId } from '../../../domain';
import { FakeClock, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { createLifeActionDraft } from '../../../test/helpers/LifeActionTestFactory';
import { RecurringActions } from '../../../application/planner/RecurringActions';
import { LifeOsIndexedDb } from '../indexed-db/LifeOsIndexedDb';
import { IndexedDbPlanningRepository } from '../IndexedDbPlanningRepository';

describe('explicit walk action linking', () => {
  it('marks only an explicitly selected action without changing its note or date', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const repo = new IndexedDbPlanningRepository(db);
    const service = new RecurringActions(
      repo,
      new FakeClock(new Date('2026-10-11T00:00:00Z')),
      new FakeIdGenerator('walk-link'),
    );
    await repo.change((state) => {
      const action = createLifeActionDraft('imported');
      action.setPlan(DayDate.create('2026-10-12'), false);
      action.updateDraftDetails(action.title, 'Моя заметка');
      state.actions.push(action);
    });
    await service.linkWalkAction({
      actionId: EntityId.create('imported'),
      targetMinutes: 45,
      scope: 'action',
    });
    const saved = (await repo.read()).actions[0]!;
    expect(saved.walkPlan).toEqual({ kind: 'walk', targetMinutes: 45 });
    expect(saved.description).toBe('Моя заметка');
    expect(saved.plannedDate?.toString()).toBe('2026-10-12');
    await expect(
      service.linkWalkAction({ actionId: saved.id, targetMinutes: 45, scope: 'series' }),
    ).rejects.toThrow();
    db.close();
  });
  it('marks future occurrences and the series template without changing recurrence dates', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const repo = new IndexedDbPlanningRepository(db);
    const service = new RecurringActions(
      repo,
      new FakeClock(new Date(2026, 9, 11, 10)),
      new FakeIdGenerator('walk-series'),
    );
    const rule = await service.save({
      title: 'Моя прогулка',
      goalId: null,
      priority: null,
      startDate: '2026-10-11',
      endDate: null,
      maxCompletions: null,
      paused: false,
      pauseUntil: null,
      schedule: { kind: 'daily' },
    });
    await service.materialize('2026-10-11', '2026-10-12');
    const first = (await repo.read()).actions[0]!;
    await service.linkWalkAction({ actionId: first.id, targetMinutes: 20, scope: 'series' });
    const state = await repo.read();
    expect(state.rules.find((r) => r.id === rule.id)?.walkPlan?.targetMinutes).toBe(20);
    expect(state.actions.every((a) => a.walkPlan?.targetMinutes === 20)).toBe(true);
    expect(state.actions.map((a) => a.plannedDate?.toString()).sort()).toEqual([
      '2026-10-11',
      '2026-10-12',
    ]);
    db.close();
  });
});
