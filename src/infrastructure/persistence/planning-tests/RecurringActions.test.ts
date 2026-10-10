import { SetLifeActionPlan } from '../../../application/commands/SetLifeActionPlan';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import { EntityId, DayDate, Goal } from '../../../domain';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { RecurrenceRuleRecordMapper } from '../PlanningRecordMappers';
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
  it.each(['daily', 'count'] as const)(
    'preserves an individual need when editing the %s series template',
    async (kind) => {
      const db = new LifeOsIndexedDb(new IDBFactory());
      const repo = new IndexedDbPlanningRepository(db);
      const service = new RecurringActions(
        repo,
        new FakeClock(new Date(2026, 8, 14, 10)),
        new FakeIdGenerator('override'),
      );
      try {
        const rule = await service.save({
          ...input,
          need: 'Энергия',
          schedule: { kind },
          maxCompletions: kind === 'count' ? 3 : null,
        });
        await service.materialize('2026-09-14', '2026-09-15');
        await repo.change((state) => {
          const action = state.actions[0]!;
          action.updateDraftDetails(action.title, action.description, 'Энергия');
        });
        await service.save(
          {
            ...input,
            need: 'Свобода',
            schedule: { kind },
            maxCompletions: kind === 'count' ? 4 : null,
          },
          rule.id,
        );
        const state = await repo.read();
        expect(state.actions[0]!.need).toBe('Энергия');
        expect(state.actions.slice(1).every((action) => action.need === 'Свобода')).toBe(true);
      } finally {
        await db.close();
      }
    },
  );

  it.each(['daily', 'count'] as const)(
    'persists own needs in %s occurrences and applies clearing to open future occurrences',
    async (kind) => {
      const db = new LifeOsIndexedDb(new IDBFactory());
      const repo = new IndexedDbPlanningRepository(db);
      const service = new RecurringActions(
        repo,
        new FakeClock(new Date(2026, 8, 14, 10)),
        new FakeIdGenerator('needs'),
      );
      try {
        const rule = await service.save({
          ...input,
          need: 'Энергия',
          schedule: { kind },
          maxCompletions: kind === 'count' ? 3 : null,
        });
        await service.materialize('2026-09-14', '2026-09-15');
        const before = (await repo.read()).actions;
        expect(before.length).toBeGreaterThan(0);
        expect(before.every((a) => a.need === 'Энергия')).toBe(true);
        await service.save(
          { ...input, need: null, schedule: { kind }, maxCompletions: kind === 'count' ? 3 : null },
          rule.id,
        );
        const after = (await repo.read()).actions;
        expect(after.map((a) => a.id.toString())).toEqual(before.map((a) => a.id.toString()));
        expect(after.every((a) => a.need === null)).toBe(true);
        await service.materialize('2026-09-16', '2026-09-16');
        expect((await repo.read()).actions.every((a) => a.need === null)).toBe(true);
      } finally {
        await db.close();
      }
    },
  );

  it.each([
    { schedule: { kind: 'daily' } as const, selectedDate: '2026-09-14' },
    { schedule: { kind: 'count' } as const, selectedDate: '2026-09-14' },
    { schedule: { kind: 'interval', days: 1 } as const, selectedDate: '2026-09-15' },
  ])(
    'selects the restored $schedule.kind generation without changing linked completed history',
    async ({ schedule, selectedDate }) => {
      const db = new LifeOsIndexedDb(new IDBFactory());
      const repo = new IndexedDbPlanningRepository(db);
      const clock = new FakeClock(new Date(2026, 8, 14, 10));
      const ids = new FakeIdGenerator('same-day-restore');
      const service = new RecurringActions(
        repo,
        clock,
        ids,
        new FakeCurrentDateProvider(DayDate.create('2026-09-14')),
      );
      const links = {
        goalId: 'practice-goal',
        directionId: 'practice-direction',
        sphereId: 'practice-sphere',
      };
      try {
        await repo.change((state) =>
          state.goals.push(
            Goal.create({
              id: EntityId.create(links.goalId),
              title: 'Практика',
              status: 'active',
              now: clock.now(),
              directionId: EntityId.create(links.directionId),
              sphereId: EntityId.create(links.sphereId),
            }),
          ),
        );
        const rule = await service.save({ ...input, ...links, schedule, maxCompletions: 2 });
        await service.materialize('2026-09-14', '2026-09-14');
        const first = (await repo.read()).actions[0]!;
        const complete = new CompleteLifeAction(
          new IndexedDbLifeActionRepository(db),
          clock,
          ids,
          new IndexedDbJournalUnitOfWork(db),
        );
        expect((await complete.execute({ lifeActionId: first.id })).ok).toBe(true);
        const history = LifeActionRecordMapper.toRecord((await repo.read()).actions[0]!);
        await service.remove(rule.id);
        await service.restore(rule.id);
        expect(await service.materialize('2026-09-14', '2026-09-15')).toBe(1);
        const current = (await repo.read()).actions.find(
          (a) => a.occurrence?.restorationGeneration === 1,
        )!;
        if (schedule.kind === 'interval') {
          expect(await service.selectForDate(rule.id, '2026-09-14')).toBeNull();
        }
        const selected = await service.selectForDate(rule.id, selectedDate);
        expect(selected?.id.toString()).toBe(current.id.toString());
        expect(selected?.status).toBe('draft');
        expect(selected?.occurrence?.restorationGeneration).toBe(1);
        expect(selected?.plannedDate?.toString()).toBe(selectedDate);
        expect(selected?.goalId?.toString()).toBe(links.goalId);
        expect(selected?.directionId?.toString()).toBe(links.directionId);
        expect(selected?.sphereId?.toString()).toBe(links.sphereId);
        const restored = await repo.read();
        expect(restored.rules[0]).toMatchObject(links);
        expect(
          LifeActionRecordMapper.toRecord(restored.actions.find((a) => a.id.equals(first.id))!),
        ).toEqual(history);
        expect((await complete.execute({ lifeActionId: selected!.id })).ok).toBe(true);
        expect(await service.materialize('2026-09-14', '2026-09-16')).toBe(0);
      } finally {
        db.close();
      }
    },
  );

  it('restores from the authoritative local date with new identities and unchanged history', async () => {
    const factory = new IDBFactory();
    const db = new LifeOsIndexedDb(factory);
    const repo = new IndexedDbPlanningRepository(db);
    const clock = new FakeClock(new Date('2026-09-14T10:00:00Z'));
    const dates = new FakeCurrentDateProvider(DayDate.create('2026-09-16'));
    const ids = new FakeIdGenerator('restore');
    const service = new RecurringActions(repo, clock, ids, dates);
    try {
      const rule = await service.save(input);
      await service.materialize('2026-09-14', '2026-09-18');
      const actions = (await repo.read()).actions;
      const first = actions.find((a) => a.occurrence?.slot === '2026-09-14')!;
      const skipped = actions.find((a) => a.occurrence?.slot === '2026-09-16')!;
      const complete = new CompleteLifeAction(
        new IndexedDbLifeActionRepository(db),
        clock,
        ids,
        new IndexedDbJournalUnitOfWork(db),
      );
      expect((await complete.execute({ lifeActionId: first.id })).ok).toBe(true);
      await service.skip(skipped.id.toString());
      const completedBefore = LifeActionRecordMapper.toRecord(
        (await repo.read()).actions.find((a) => a.id.equals(first.id))!,
      );
      await service.remove(rule.id);
      expect((await repo.read()).rules[0]).toMatchObject({
        lastRemovedAt: '2026-09-14T10:00:00.000Z',
        restoredFromTrashAt: null,
      });
      clock.setTime(new Date('2026-09-15T20:00:00Z'));
      await service.restore(rule.id);
      expect((await repo.read()).rules[0]).toMatchObject({
        id: rule.id,
        removedAt: null,
        lastRemovedAt: '2026-09-14T10:00:00.000Z',
        restoredFromTrashAt: '2026-09-15T20:00:00.000Z',
        restorationGeneration: 1,
        revision: 3,
        version: 3,
        effectiveFrom: '2026-09-16',
        paused: false,
        pauseUntil: null,
      });
      expect(await service.materialize('2026-09-14', '2026-09-18')).toBe(3);
      expect(await service.materialize('2026-09-14', '2026-09-18')).toBe(0);
      const restored = await repo.read();
      const fresh = restored.actions.filter((a) => a.status === 'draft');
      expect(fresh.map((a) => a.plannedDate?.toString())).toEqual([
        '2026-09-16',
        '2026-09-17',
        '2026-09-18',
      ]);
      expect(fresh[0]?.id.toString()).toBe('occurrence:restore-1:generation:1:2026-09-16');
      expect(fresh.every((a) => a.occurrence?.restorationGeneration === 1)).toBe(true);
      expect(
        LifeActionRecordMapper.toRecord(restored.actions.find((a) => a.id.equals(first.id))!),
      ).toEqual(completedBefore);
      expect(restored.actions.find((a) => a.id.equals(skipped.id))?.isArchived()).toBe(true);
      await service.save({ ...input, title: 'Обновлённая практика' }, rule.id);
      expect((await repo.read()).rules[0]).toMatchObject({
        restorationGeneration: 1,
        lastRemovedAt: '2026-09-14T10:00:00.000Z',
        restoredFromTrashAt: '2026-09-15T20:00:00.000Z',
      });
      await service.remove(rule.id);
      await service.restore(rule.id);
      expect(await service.materialize('2026-09-16', '2026-09-16')).toBe(1);
      expect(
        (await repo.read()).actions.find((a) => a.status === 'draft')?.occurrence
          ?.restorationGeneration,
      ).toBe(2);
      db.close();
      const reopened = new LifeOsIndexedDb(factory);
      try {
        const loaded = await new IndexedDbPlanningRepository(reopened).read();
        expect(loaded.rules[0]?.restorationGeneration).toBe(2);
        expect(
          loaded.actions.find((a) => a.status === 'draft')?.occurrence?.restorationGeneration,
        ).toBe(2);
      } finally {
        reopened.close();
      }
    } finally {
      db.close();
    }
  });

  it('rejects active and purged restore without changing the persisted rule', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const repo = new IndexedDbPlanningRepository(db);
    const service = new RecurringActions(
      repo,
      new FakeClock(new Date('2026-09-14T10:00:00Z')),
      new FakeIdGenerator(),
    );
    try {
      const rule = await service.save(input);
      await expect(service.restore(rule.id)).rejects.toMatchObject({
        code: 'recurrence.not_removed',
      });
      expect((await repo.read()).rules[0]).toEqual(rule);
      await repo.change((s) => {
        s.rules[0] = { ...rule, purgedAt: '2026-09-14T10:00:00.000Z' };
      });
      await expect(service.restore(rule.id)).rejects.toMatchObject({ code: 'trash.expired' });
      expect(await service.materialize('2026-09-14')).toBe(0);
      expect(await service.resolveForDate(rule.id, '2026-09-14')).toBeNull();
      await expect(service.save(input, rule.id)).rejects.toMatchObject({ code: 'trash.expired' });
      await expect(service.resume(rule.id)).rejects.toMatchObject({ code: 'trash.expired' });
    } finally {
      db.close();
    }
  });

  it('normalizes legacy rule fields and round trips trash metadata', () => {
    const legacy = {
      ...input,
      id: 'legacy',
      version: 1,
      schemaVersion: 1,
      updatedAt: '2026-09-14T10:00:00.000Z',
      effectiveFrom: '2026-09-14',
      revision: 1,
    };
    expect(RecurrenceRuleRecordMapper.fromRecord(legacy)).toMatchObject({
      removedAt: null,
      lastRemovedAt: null,
      restoredFromTrashAt: null,
      purgedAt: null,
      restorationGeneration: 0,
    });
    const persisted = RecurrenceRuleRecordMapper.fromRecord({
      ...legacy,
      removedAt: '2026-09-14T10:00:00.000Z',
      lastRemovedAt: '2026-09-14T10:00:00.000Z',
      restoredFromTrashAt: '2026-09-13T10:00:00.000Z',
      purgedAt: '2026-09-15T10:00:00.000Z',
      paused: true,
      restorationGeneration: 2,
    });
    expect(
      RecurrenceRuleRecordMapper.fromRecord(RecurrenceRuleRecordMapper.toRecord(persisted)),
    ).toEqual(persisted);
  });

  it.each([
    { command: 'remove', kind: 'daily' },
    { command: 'materialize', kind: 'daily' },
    { command: 'remove', kind: 'count' },
    { command: 'materialize', kind: 'count' },
  ] as const)(
    '$command reconciles $kind occurrences when the removed rule arrives before its actions',
    async ({ command, kind }) => {
      const factory = new IDBFactory();
      const db = new LifeOsIndexedDb(factory);
      const repo = new IndexedDbPlanningRepository(db);
      const clock = new FakeClock(new Date('2026-09-14T10:00:00Z'));
      const ids = new FakeIdGenerator('partial-series-delete');
      const recurring = new RecurringActions(repo, clock, ids);
      try {
        const seriesInput = {
          ...input,
          schedule: { kind },
          maxCompletions: kind === 'count' ? 3 : null,
        };
        const rule = await recurring.save(seriesInput);
        const otherRule = await recurring.save(seriesInput);
        await recurring.materialize('2026-09-14', '2026-09-16');
        const completed = (await repo.read()).actions.find(
          (action) => action.occurrence?.ruleId === rule.id,
        )!;
        const complete = new CompleteLifeAction(
          new IndexedDbLifeActionRepository(db),
          clock,
          ids,
          new IndexedDbJournalUnitOfWork(db),
        );
        expect((await complete.execute({ lifeActionId: completed.id })).ok).toBe(true);
        await recurring.materialize('2026-09-14', '2026-09-16');
        const staleOccurrence = (await repo.read()).actions.find(
          (action) => action.occurrence?.ruleId === rule.id && action.status === 'draft',
        )!;
        const history = LifeActionRecordMapper.toRecord(
          (await repo.read()).actions.find((action) => action.id.equals(completed.id))!,
        );
        const removedRule = normalizePilotRecord('recurrence_rule', {
          ...rule,
          paused: true,
          removedAt: clock.now().toISOString(),
          lastRemovedAt: clock.now().toISOString(),
          version: rule.version + 1,
          revision: rule.revision + 1,
          updatedAt: clock.now().toISOString(),
        });
        await applyRemotePilotRecord(await db.open(), 'recurrence_rule', removedRule);
        const storedRule = (await repo.read()).rules.find((r) => r.id === rule.id)!;
        const reconcile = () =>
          command === 'remove'
            ? recurring.remove(rule.id)
            : recurring.materialize('2026-09-14', '2026-09-16');
        await reconcile();
        const state = await repo.read();
        expect(
          state.actions
            .filter(
              (action) => action.occurrence?.ruleId === rule.id && action.status !== 'completed',
            )
            .every((action) => action.status === 'cancelled' && action.isArchived()),
        ).toBe(true);
        expect(
          LifeActionRecordMapper.toRecord(
            state.actions.find((action) => action.id.equals(completed.id))!,
          ),
        ).toEqual(history);
        expect(
          state.actions.filter(
            (action) => action.occurrence?.ruleId === otherRule.id && !action.isArchived(),
          ),
        ).toHaveLength(kind === 'count' ? 1 : 3);
        expect(
          RecurrenceRuleRecordMapper.toRecord(state.rules.find((r) => r.id === rule.id)!),
        ).toEqual(RecurrenceRuleRecordMapper.toRecord(storedRule));
        await reconcile();
        expect((await repo.read()).actions.map(LifeActionRecordMapper.toRecord)).toEqual(
          state.actions.map(LifeActionRecordMapper.toRecord),
        );
        // A stale action can arrive later than the rule and the first reconciliation.
        await applyRemotePilotRecord(
          await db.open(),
          'life_action',
          normalizePilotRecord('life_action', LifeActionRecordMapper.toRecord(staleOccurrence)),
        );
        await reconcile();
        expect(
          (await repo.read()).actions
            .find((action) => action.id.equals(staleOccurrence.id))
            ?.isArchived(),
        ).toBe(true);
        db.close();
        const reopened = new LifeOsIndexedDb(factory);
        try {
          const reloaded = await new IndexedDbPlanningRepository(reopened).read();
          expect(
            reloaded.actions
              .filter(
                (action) => action.occurrence?.ruleId === rule.id && action.status !== 'completed',
              )
              .every((action) => action.isArchived()),
          ).toBe(true);
        } finally {
          reopened.close();
        }
      } finally {
        db.close();
      }
    },
  );

  it('removes an entire series, preserves completed history and never materializes it again', async () => {
    const factory = new IDBFactory();
    const db = new LifeOsIndexedDb(factory);
    const repo = new IndexedDbPlanningRepository(db);
    const clock = new FakeClock(new Date('2026-09-14T10:00:00Z'));
    const ids = new FakeIdGenerator('remove-series');
    const recurring = new RecurringActions(repo, clock, ids);
    const complete = new CompleteLifeAction(
      new IndexedDbLifeActionRepository(db),
      clock,
      ids,
      new IndexedDbJournalUnitOfWork(db),
    );

    const rule = await recurring.save(input);
    await recurring.materialize('2026-09-14', '2026-09-20');
    const first = (await repo.read()).actions.find(
      (action) => action.occurrence?.ruleId === rule.id,
    )!;
    expect((await complete.execute({ lifeActionId: first.id })).ok).toBe(true);
    const skipped = (await repo.read()).actions.find(
      (action) =>
        action.occurrence?.ruleId === rule.id && action.id.toString() !== first.id.toString(),
    )!;
    await recurring.skip(skipped.id.toString());
    const skippedAfter = (await repo.read()).actions.find(
      (action) => action.id.toString() === skipped.id.toString(),
    )!;
    expect(skippedAfter.status).toBe('cancelled');
    expect(skippedAfter.archivedAt).toEqual(clock.now());

    await recurring.remove(rule.id);
    const removed = await repo.read();
    expect(removed.rules.find((candidate) => candidate.id === rule.id)).toMatchObject({
      removedAt: '2026-09-14T10:00:00.000Z',
      paused: true,
      pauseUntil: null,
    });
    expect(
      removed.actions.filter(
        (action) => action.occurrence?.ruleId === rule.id && action.status === 'completed',
      ),
    ).toHaveLength(1);
    expect(
      removed.actions.filter(
        (action) => action.occurrence?.ruleId === rule.id && action.status === 'draft',
      ),
    ).toHaveLength(0);
    expect(
      removed.actions
        .filter((action) => action.occurrence?.ruleId === rule.id && action.status !== 'completed')
        .every((action) => action.isArchived()),
    ).toBe(true);

    clock.setTime(new Date('2026-09-21T10:00:00Z'));
    expect(await recurring.materialize('2026-09-21', '2026-09-27')).toBe(0);
    await expect(recurring.resume(rule.id)).rejects.toMatchObject({ code: 'recurrence.removed' });
    db.close();

    const reopened = new LifeOsIndexedDb(factory);
    const restored = new IndexedDbPlanningRepository(reopened);
    expect(
      (await restored.read()).rules.find((candidate) => candidate.id === rule.id)?.removedAt,
    ).toBe('2026-09-14T10:00:00.000Z');
    reopened.close();
  });

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
