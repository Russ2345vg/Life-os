import { SetLifeActionPlan } from '../../../application/commands/SetLifeActionPlan';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import { EntityId, DayDate } from '../../../domain';
import { FakeClock, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { LifeOsIndexedDb } from '../indexed-db/LifeOsIndexedDb';
import { IndexedDbPlanningRepository } from '../IndexedDbPlanningRepository';
import { IndexedDbLifeActionRepository } from '../IndexedDbLifeActionRepository';
import { IndexedDbJournalUnitOfWork } from '../IndexedDbJournalUnitOfWork';
import { CompleteLifeAction } from '../../../application/commands/CompleteLifeAction';
import {
  RecurringActions,
  type RecurrenceInput,
} from '../../../application/planner/RecurringActions';
import { GoalContributions } from '../../../application/planner/GoalContributions';
import { LifeActionRecordMapper } from '../mappers/LifeActionRecordMapper';
import {
  applyRemotePilotRecord,
  normalizePilotRecord,
} from '../../sync/pilot/PilotSyncRegistryAdapters';
const input: RecurrenceInput = {
  title: 'Практика',
  goalId: null,
  priority: null,
  startDate: '2026-09-14',
  endDate: null,
  maxCompletions: null,
  paused: false,
  pauseUntil: null,
  schedule: { kind: 'daily' },
};
describe('bounded recurring actions', () => {
  it('keeps a count occurrence paused until its real resume date and rejects skip without trapping it', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const repo = new IndexedDbPlanningRepository(db);
    const clock = new FakeClock(new Date('2026-09-14T10:00:00Z'));
    const service = new RecurringActions(repo, clock, new FakeIdGenerator('pause-count'));
    try {
      const rule = await service.save({
        ...input,
        schedule: { kind: 'count' },
        maxCompletions: 5,
      });
      await service.materialize('2026-09-14');
      const first = (await repo.read()).actions.find(
        (action) => action.occurrence?.ruleId === rule.id,
      )!;
      await expect(service.skip(first.id.toString())).rejects.toMatchObject({
        code: 'recurrence.count_skip_unsupported',
      });
      await service.pause(rule.id, '2026-09-20');
      await service.materialize('2026-09-19');
      expect(
        (await repo.read()).actions.filter((action) => action.status === 'draft'),
      ).toHaveLength(0);
      clock.setTime(new Date('2026-09-20T10:00:00Z'));
      await service.materialize('2026-09-20');
      const resumed = (await repo.read()).actions.filter(
        (action) => action.occurrence?.ruleId === rule.id,
      );
      expect(resumed).toHaveLength(1);
      expect(resumed[0]?.status).toBe('draft');
      expect(resumed[0]?.id.toString()).toBe(first.id.toString());
    } finally {
      db.close();
    }
  });
  it('keeps one count completion after reload and replaying the same synced occurrence', async () => {
    const factory = new IDBFactory();
    const db = new LifeOsIndexedDb(factory);
    const repo = new IndexedDbPlanningRepository(db);
    const clock = new FakeClock(new Date('2026-09-14T10:00:00Z'));
    const ids = new FakeIdGenerator('count-replay');
    const recurring = new RecurringActions(repo, clock, ids);
    const complete = new CompleteLifeAction(
      new IndexedDbLifeActionRepository(db),
      clock,
      ids,
      new IndexedDbJournalUnitOfWork(db),
    );
    const rule = await recurring.save({
      ...input,
      schedule: { kind: 'count' },
      maxCompletions: 66,
    });
    await recurring.materialize('2026-09-14');
    const first = (await repo.read()).actions.find(
      (action) => action.occurrence?.ruleId === rule.id,
    )!;
    expect((await complete.execute({ lifeActionId: first.id })).ok).toBe(true);
    const completed = (await repo.read()).actions.find((action) => action.id.equals(first.id))!;
    const wire = normalizePilotRecord('life_action', LifeActionRecordMapper.toRecord(completed));
    const connection = await db.open();
    await applyRemotePilotRecord(connection, 'life_action', wire);
    await applyRemotePilotRecord(connection, 'life_action', wire);
    expect(
      (await repo.read()).actions.filter(
        (action) => action.occurrence?.ruleId === rule.id && action.status === 'completed',
      ),
    ).toHaveLength(1);
    db.close();
    const reopened = new LifeOsIndexedDb(factory);
    const restored = new IndexedDbPlanningRepository(reopened);
    const service = new RecurringActions(restored, clock, ids);
    await service.materialize('2026-09-14');
    const occurrences = (await restored.read()).actions.filter(
      (action) => action.occurrence?.ruleId === rule.id,
    );
    expect(occurrences.filter((action) => action.status === 'completed')).toHaveLength(1);
    expect(occurrences.filter((action) => action.status === 'draft')).toHaveLength(1);
    reopened.close();
  });
  it('keeps one undated occurrence, counts completion facts once, and stops after N', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const repo = new IndexedDbPlanningRepository(db);
    const clock = new FakeClock(new Date('2026-09-14T10:00:00Z'));
    const ids = new FakeIdGenerator('count');
    const recurring = new RecurringActions(repo, clock, ids);
    const complete = new CompleteLifeAction(
      new IndexedDbLifeActionRepository(db),
      clock,
      ids,
      new IndexedDbJournalUnitOfWork(db),
    );
    const progress = new GoalContributions(repo, clock, ids);
    try {
      const rule = await recurring.save({
        ...input,
        schedule: { kind: 'count' },
        maxCompletions: 5,
      });
      const finished: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        await recurring.materialize('2026-09-14');
        await recurring.materialize('2026-09-14');
        const open = (await new IndexedDbPlanningRepository(db).read()).actions.filter(
          (action) => action.occurrence?.ruleId === rule.id && action.status === 'draft',
        );
        expect(open).toHaveLength(1);
        expect(open[0]?.plannedDate).toBeNull();
        expect((await complete.execute({ lifeActionId: open[0]!.id })).ok).toBe(true);
        finished.push(open[0]!.id.toString());
        clock.setTime(new Date(clock.now().getTime() + 60_000));
      }
      await recurring.materialize('2026-09-14');
      const stopped = (await repo.read()).actions.filter(
        (action) => action.occurrence?.ruleId === rule.id,
      );
      expect(stopped).toHaveLength(5);
      expect(stopped.filter((action) => action.status === 'completed')).toHaveLength(5);
      await progress.reopen(finished[1]!);
      await recurring.materialize('2026-09-14');
      const corrected = (await repo.read()).actions.filter(
        (action) => action.occurrence?.ruleId === rule.id,
      );
      expect(corrected.filter((action) => action.status === 'completed')).toHaveLength(4);
      expect(corrected.filter((action) => action.status === 'draft')).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('revises the same future interval occurrence again after its original date has passed', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory()),
      repo = new IndexedDbPlanningRepository(db),
      clock = new FakeClock(new Date('2026-09-14T10:00:00Z')),
      ids = new FakeIdGenerator('repeat-revision'),
      service = new RecurringActions(repo, clock, ids),
      complete = new CompleteLifeAction(
        new IndexedDbLifeActionRepository(db),
        clock,
        ids,
        new IndexedDbJournalUnitOfWork(db),
      );
    try {
      const rule = await service.save({ ...input, schedule: { kind: 'interval', days: 2 } });
      await service.materialize('2026-09-14');
      const first = (await repo.read()).actions[0]!;
      expect((await complete.execute({ lifeActionId: first.id })).ok).toBe(true);
      await service.materialize('2026-09-14');
      const next = (await repo.read()).actions.find((a) => a.status === 'draft')!;
      await service.save({ ...input, schedule: { kind: 'interval', days: 3 } }, rule.id);
      expect(
        (await repo.read()).actions
          .find((a) => a.id.toString() === next.id.toString())
          ?.plannedDate?.toString(),
      ).toBe('2026-09-17');
      clock.setTime(new Date('2026-09-17T10:00:00Z'));
      await service.save({ ...input, schedule: { kind: 'interval', days: 4 } }, rule.id);
      await service.materialize('2026-09-17');
      const reloaded = await new IndexedDbPlanningRepository(db).read();
      const instances = reloaded.actions.filter((a) => a.occurrence?.ruleId === rule.id);
      expect(instances).toHaveLength(2);
      expect(
        instances.find((a) => a.id.toString() === next.id.toString())?.plannedDate?.toString(),
      ).toBe('2026-09-18');
      expect(instances.find((a) => a.id.toString() === next.id.toString())?.occurrence?.slot).toBe(
        next.occurrence?.slot,
      );
      expect(
        instances.find((a) => a.id.toString() === first.id.toString())?.plannedDate?.toString(),
      ).toBe('2026-09-14');
    } finally {
      db.close();
    }
  });
  it('updates future interval dates and priority while preserving explicit moves and past open actions', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory()),
      repo = new IndexedDbPlanningRepository(db),
      clock = new FakeClock(new Date('2026-09-14T10:00:00Z')),
      ids = new FakeIdGenerator('revision'),
      service = new RecurringActions(repo, clock, ids),
      actions = new IndexedDbLifeActionRepository(db),
      uow = new IndexedDbJournalUnitOfWork(db),
      complete = new CompleteLifeAction(actions, clock, ids, uow);
    try {
      const rule = await service.save({ ...input, schedule: { kind: 'interval', days: 2 } });
      await service.materialize('2026-09-14');
      const first = (await repo.read()).actions[0]!;
      await complete.execute({ lifeActionId: first.id });
      await service.materialize('2026-09-14');
      const next = (await repo.read()).actions.find((a) => a.status === 'draft')!;
      await service.save(
        {
          ...input,
          title: 'Изменённое правило',
          priority: 'high',
          schedule: { kind: 'interval', days: 3 },
        },
        rule.id,
      );
      let changed = (await actions.findById(next.id))!;
      expect(changed.plannedDate?.toString()).toBe('2026-09-17');
      expect(changed.title.toString()).toBe('Изменённое правило');
      expect(changed.priority).toBe('high');
      await new SetLifeActionPlan(actions, uow, clock, ids).execute({
        lifeActionId: next.id,
        plannedDate: DayDate.create('2026-09-20'),
      });
      await service.save({ ...input, schedule: { kind: 'interval', days: 4 } }, rule.id);
      changed = (await actions.findById(next.id))!;
      expect(changed.plannedDate?.toString()).toBe('2026-09-20');
      const daily = await service.save({ ...input, maxCompletions: 1 });
      await service.materialize('2026-09-14');
      clock.setTime(new Date('2026-09-15T10:00:00Z'));
      await service.pause(daily.id);
      expect(
        (await repo.read()).actions.find((a) => a.occurrence?.ruleId === daily.id)?.status,
      ).toBe('draft');
    } finally {
      db.close();
    }
  });

  it('deduplicates concurrent materialization and respects max, pause and resume', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory()),
      repo = new IndexedDbPlanningRepository(db),
      clock = new FakeClock(new Date('2026-09-14T10:00:00Z')),
      ids = new FakeIdGenerator('r'),
      service = new RecurringActions(repo, clock, ids);
    try {
      const rule = await service.save({ ...input, maxCompletions: 1 });
      await Promise.all([service.materialize('2026-09-14'), service.materialize('2026-09-14')]);
      expect((await repo.read()).actions.filter((a) => a.status === 'draft')).toHaveLength(1);
      await service.pause(rule.id);
      expect((await repo.read()).actions.filter((a) => a.status === 'draft')).toHaveLength(0);
      await service.resume(rule.id);
      await service.materialize('2026-09-14');
      expect((await repo.read()).actions.filter((a) => a.status === 'draft')).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('invalidates interval descendants after reopen and keeps one next instance', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory()),
      repo = new IndexedDbPlanningRepository(db),
      clock = new FakeClock(new Date('2026-09-14T10:00:00Z')),
      ids = new FakeIdGenerator('r'),
      service = new RecurringActions(repo, clock, ids),
      progress = new GoalContributions(repo, clock, ids),
      complete = new CompleteLifeAction(
        new IndexedDbLifeActionRepository(db),
        clock,
        ids,
        new IndexedDbJournalUnitOfWork(db),
      );
    try {
      await service.save({ ...input, schedule: { kind: 'interval', days: 2 } });
      await service.materialize('2026-09-14');
      const first = (await repo.read()).actions[0]!;
      expect((await complete.execute({ lifeActionId: first.id })).ok).toBe(true);
      await service.materialize('2026-09-14');
      await progress.reopen(first.id.toString());
      await service.materialize('2026-09-14');
      await complete.execute({ lifeActionId: EntityId.create(first.id.toString()) });
      await service.materialize('2026-09-14');
      const open = (await repo.read()).actions.filter((a) => a.status === 'draft');
      expect(open).toHaveLength(1);
      expect(open[0]?.occurrence?.slot).toContain(':completion:1');
    } finally {
      db.close();
    }
  });
});
