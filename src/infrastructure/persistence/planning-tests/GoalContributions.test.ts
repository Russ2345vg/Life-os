import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import {
  DayDate,
  Goal,
  EntityId,
  JOURNAL_ENTRY_TYPE,
  LifeAction,
  LifeActionTitle,
} from '../../../domain';
import { FakeClock, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { LifeOsIndexedDb } from '../indexed-db/LifeOsIndexedDb';
import { IndexedDbPlanningRepository } from '../IndexedDbPlanningRepository';
import { IndexedDbJournalUnitOfWork } from '../IndexedDbJournalUnitOfWork';
import { IndexedDbLifeActionRepository } from '../IndexedDbLifeActionRepository';
import { IndexedDbJournalRepository } from '../IndexedDbJournalRepository';
import { CompleteLifeAction } from '../../../application/commands/CompleteLifeAction';
import { GoalContributions, goalProgress } from '../../../application/planner/GoalContributions';
describe('completion contributions', () => {
  it('completes once, leaves actual pending, corrects and reopens without residual progress', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory()),
      repo = new IndexedDbPlanningRepository(db),
      clock = new FakeClock(new Date('2026-09-14T10:00:00Z')),
      ids = new FakeIdGenerator('progress');
    const service = new GoalContributions(repo, clock, ids);
    try {
      await repo.change((s) => {
        for (const id of ['g1', 'g2'])
          s.goals.push(
            Goal.create({ id: EntityId.create(id), title: id, status: 'active', now: clock.now() }),
          );
        s.actions.push(
          LifeAction.createDraft({
            id: EntityId.create('a'),
            title: LifeActionTitle.create('Шаг'),
            createdAt: clock.now(),
            eventId: ids.generate(),
          }),
        );
      });
      for (const id of ['g1', 'g2'])
        await service.configure(id, {
          mode: 'count',
          target: 66,
          unit: 'раз',
          start: 0,
          direction: 'at_least',
          cycle: null,
        });
      await service.setLink('action', 'a', 'g1', 'fixed', 1);
      await service.setLink('action', 'a', 'g2', 'actual', 0);
      const complete = new CompleteLifeAction(
        new IndexedDbLifeActionRepository(db),
        clock,
        ids,
        new IndexedDbJournalUnitOfWork(db),
      );
      expect((await complete.execute({ lifeActionId: EntityId.create('a') })).ok).toBe(true);
      await complete.execute({ lifeActionId: EntityId.create('a') });
      let state = await repo.read();
      expect(goalProgress(state, 'g1', '2026-09-14')?.current).toBe(1);
      expect(goalProgress(state, 'g2', '2026-09-14')?.pending).toBe(1);
      const pending = state.contributions.find((c) => c.amount === null)!;
      await service.setActual(pending.id, 7.4);
      state = await repo.read();
      expect(goalProgress(state, 'g2', '2026-09-14')?.current).toBe(7.4);
      await service.reopen('a');
      await service.reopen('a');
      state = await repo.read();
      expect(state.actions.find((action) => action.id.toString() === 'a')?.status).toBe('draft');
      expect(goalProgress(state, 'g1', '2026-09-14')?.current).toBe(0);
      expect(goalProgress(state, 'g2', '2026-09-14')?.current).toBe(0);
      const events = await new IndexedDbJournalRepository(db).findByEffectiveDateRange(
        DayDate.create('2026-09-14'),
        DayDate.create('2026-09-14'),
      );
      expect(
        events.filter((event) => event.type === JOURNAL_ENTRY_TYPE.actionCompleted),
      ).toHaveLength(1);
      expect(events.filter((event) => event.labelAtEvent === 'Выполнение отменено')).toHaveLength(
        1,
      );
      await complete.execute({ lifeActionId: EntityId.create('a') });
      state = await repo.read();
      expect(goalProgress(state, 'g1', '2026-09-14')?.current).toBe(1);
    } finally {
      db.close();
    }
  });
});
