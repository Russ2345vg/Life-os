import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import { Goal, EntityId, LifeAction, LifeActionTitle } from '../../../domain';
import { FakeClock, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { LifeOsIndexedDb } from '../indexed-db/LifeOsIndexedDb';
import { IndexedDbPlanningRepository } from '../IndexedDbPlanningRepository';
import { IndexedDbJournalUnitOfWork } from '../IndexedDbJournalUnitOfWork';
import { IndexedDbLifeActionRepository } from '../IndexedDbLifeActionRepository';
import { CompleteLifeAction } from '../../../application/commands/CompleteLifeAction';
import { GoalContributions, goalProgress } from '../../../application/planner/GoalContributions';
import { PeriodPlanning } from '../../../application/planner/PeriodPlanning';
import { automaticPeriod, cycleAt, thirtyDayPeriod } from '../../../domain/planner/PlanningPeriod';
function setup() {
  const db = new LifeOsIndexedDb(new IDBFactory()),
    repo = new IndexedDbPlanningRepository(db),
    clock = new FakeClock(new Date('2026-09-14T10:00:00Z')),
    ids = new FakeIdGenerator('h');
  return { db, repo, clock, ids, service: new GoalContributions(repo, clock, ids) };
}
describe('progress and period history', () => {
  it('distinguishes partial sync delivery from a confirmed zero', async () => {
    const { db, repo, clock, ids, service } = setup();
    try {
      await repo.change((s) => {
        s.goals.push(
          Goal.create({
            id: EntityId.create('g'),
            title: '90 → 75',
            status: 'active',
            now: clock.now(),
          }),
        );
        s.actions.push(
          LifeAction.createDraft({
            id: EntityId.create('a'),
            title: LifeActionTitle.create('Измерение'),
            createdAt: clock.now(),
            eventId: ids.generate(),
          }),
        );
      });
      await service.configure('g', {
        mode: 'numeric',
        start: 90,
        target: 75,
        unit: 'кг',
        direction: 'at_most',
        cycle: null,
      });
      let state = await repo.read();
      const initial = state.contributions;
      state.contributions = [];
      expect(goalProgress(state, 'g', '2026-09-14')).toMatchObject({
        complete: false,
        reached: false,
        percent: null,
      });
      state.contributions = initial;
      expect(goalProgress(state, 'g', '2026-09-14')).toMatchObject({
        complete: true,
        current: 90,
        reached: false,
      });
      await service.setLink('action', 'a', 'g', 'fixed', -1);
      const complete = new CompleteLifeAction(
        new IndexedDbLifeActionRepository(db),
        clock,
        ids,
        new IndexedDbJournalUnitOfWork(db),
      );
      await complete.execute({ lifeActionId: EntityId.create('a') });
      state = await repo.read();
      expect(state.actions[0]?.expectedContributions).toHaveLength(1);
      state.contributions = state.contributions.filter((c) => c.source === 'initial');
      expect(goalProgress(state, 'g', '2026-09-14')?.complete).toBe(false);
    } finally {
      db.close();
    }
  });

  it('requires a fresh backfill preview, applies once and preserves correction origin', async () => {
    const { db, repo, clock, ids, service } = setup();
    try {
      await repo.change((s) => {
        s.goals.push(
          Goal.create({
            id: EntityId.create('g'),
            title: '66 выполнений',
            status: 'active',
            now: clock.now(),
          }),
        );
        s.actions.push(
          LifeAction.createDraft({
            id: EntityId.create('a'),
            title: LifeActionTitle.create('Практика'),
            createdAt: clock.now(),
            eventId: ids.generate(),
          }),
        );
      });
      await service.configure('g', {
        mode: 'count',
        target: 66,
        start: 0,
        unit: 'раз',
        direction: 'at_least',
        cycle: null,
      });
      const complete = new CompleteLifeAction(
        new IndexedDbLifeActionRepository(db),
        clock,
        ids,
        new IndexedDbJournalUnitOfWork(db),
      );
      await complete.execute({ lifeActionId: EntityId.create('a') });
      const link = await service.setLink('action', 'a', 'g', 'fixed', 44);
      expect(goalProgress(await repo.read(), 'g', '2026-09-14')?.current).toBe(0);
      const stale = await service.previewBackfill(link.id);
      expect(stale.added).toBe(44);
      await service.setLink('action', 'a', 'g', 'fixed', 2);
      await expect(
        service.applyBackfill(
          link.id,
          stale.candidates.map((v) => v.id),
          stale.fingerprint,
        ),
      ).rejects.toMatchObject({ code: 'progress.preview_changed' });
      const preview = await service.previewBackfill(link.id);
      await service.applyBackfill(
        link.id,
        preview.candidates.map((v) => v.id),
        preview.fingerprint,
      );
      await service.applyBackfill(
        link.id,
        preview.candidates.map((v) => v.id),
        preview.fingerprint,
      );
      await service.adjust('g', 42, 'Исправление журнала', 'same-command');
      await service.adjust('g', 42, 'Исправление журнала', 'same-command');
      let state = await repo.read();
      expect(goalProgress(state, 'g', '2026-09-14')).toMatchObject({ current: 44, target: 66 });
      expect(state.contributions.find((v) => v.source === 'manual')?.reason).toBe(
        'Исправление журнала',
      );
      await service.adjust('g', 22, 'Цель достигнута', 'another-command');
      state = await repo.read();
      expect(goalProgress(state, 'g', '2026-09-14')?.reached).toBe(true);
      expect(state.goals[0]?.status).toBe('active');
    } finally {
      db.close();
    }
  });
  it('resets recurring cycles without debt and freezes an explicit period decision', async () => {
    const { db, repo, clock, ids, service } = setup();
    try {
      await repo.change((s) =>
        s.goals.push(
          Goal.create({
            id: EntityId.create('g'),
            title: 'Недельная практика',
            status: 'active',
            now: clock.now(),
          }),
        ),
      );
      await service.configure('g', {
        mode: 'recurring',
        target: 3,
        start: null,
        unit: 'раз',
        direction: 'at_least',
        cycle: 'week',
      });
      await service.adjust('g', 2, 'Две практики', 'a');
      const periods = new PeriodPlanning(repo, clock, ids);
      await periods.participate('week', '2026-09-14', 'goal', 'g');
      clock.setTime(new Date('2026-09-21T10:00:00Z'));
      await periods.carryover(
        'week:2026-09-14',
        'goal',
        'g',
        'continue',
        automaticPeriod('week', '2026-09-21'),
      );
      let state = await repo.read();
      expect(goalProgress(state, 'g', '2026-09-21')?.current).toBe(0);
      expect(goalProgress(state, 'g', '2026-09-20')?.current).toBe(2);
      expect(state.decisions[0]?.resultAtDecision?.current).toBe(2);
      await service.adjust('g', 3, 'Новая неделя', 'b');
      state = await repo.read();
      expect(goalProgress(state, 'g', '2026-09-21')?.reached).toBe(true);
      expect(state.goals[0]?.status).toBe('active');
      expect(state.decisions[0]?.resultAtDecision?.current).toBe(2);
    } finally {
      db.close();
    }
  });
  it('chooses the same overlapping offline cycle regardless of merge order', () => {
    const a = thirtyDayPeriod('2026-09-14'),
      b = thirtyDayPeriod('2026-09-15');
    expect(cycleAt([a, b], '2026-09-16')?.id).toBe(a.id);
    expect(cycleAt([b, a], '2026-09-16')?.id).toBe(a.id);
  });
});
