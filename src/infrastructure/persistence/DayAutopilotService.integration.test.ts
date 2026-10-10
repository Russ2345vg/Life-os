import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { DayAutopilotService } from '../../application/planner/DayAutopilotService';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { FakeClock } from '../../test/helpers/Fakes';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { preferenceAutopilotFixture } from '../../test/helpers/PreferenceAutopilotFixture';
import { Direction, EntityId } from '../../domain';

it('rebuild retains passed owned rest and deletes only future owned windows', async () => {
  const f = await preferenceAutopilotFixture();
  try {
    for (const id of ['a', 'b', 'c']) {
      const action = createLifeActionDraft(id);
      action.setPlan(f.date, false);
      await f.actions.save(action);
    }
    await f.service.apply(await f.service.preview({ date: f.date, mode: 'fill' }));
    const old = (await f.profile.blocks.findAll()).find((block) => block.startTime === '09:25')!;
    f.clock.setTime(new Date('2026-10-10T00:50:00Z'));
    const draft = await f.settings.getDraft(f.date.toString());
    await f.settings.saveDraft({ ...draft.value, excludedActionIds: ['c'] }, draft.version);
    await f.service.apply(await f.service.preview({ date: f.date, mode: 'rebuild' }));
    const blocks = await f.profile.blocks.findAll();
    expect(blocks.find((block) => block.id.equals(old.id))).toEqual(old);
    expect(blocks.map((block) => block.id.toString())).toEqual([old.id.toString()]);
    expect((await f.actions.findById(EntityId.create('c')))?.scheduledStartMinute).toBeNull();
  } finally {
    f.db.close();
  }
});

it('applies backlog date and rest together preserves unknown estimates and reopens the same calendar projection', async () => {
  const f = await preferenceAutopilotFixture();
  try {
    const direction = Direction.create({
      id: EntityId.create('d'),
      name: 'Инвестиции',
      now: f.clock.now(),
    });
    await f.profile.directions.create(direction);
    const prefs = await f.settings.getPreferences();
    await f.settings.savePreferences(
      { ...prefs.value, focus: { kind: 'direction', id: 'd' } },
      prefs.version,
    );
    for (const id of ['a', 'b']) {
      const action = createLifeActionDraft(id);
      action.setContext(null, direction.id, null);
      await f.actions.save(action);
    }
    const sessionsBefore = await f.sessions.all();
    const preview = await f.service.preview({ date: f.date, mode: 'fill' });
    await f.service.apply(preview);
    expect((await f.actions.findById(EntityId.create('a')))?.estimateMinutes).toBeNull();
    expect((await f.actions.findById(EntityId.create('a')))?.plannedDate?.toString()).toBe(
      '2026-10-10',
    );
    expect(await f.sessions.all()).toEqual(sessionsBefore);
    expect(await f.profile.blocks.findAll()).toHaveLength(1);
    const schedule = await new DayAutopilotService(f.dependencies).readSchedule(f.date, f.date);
    expect(
      schedule[0]?.blocks
        .filter((block) => ['action', 'rest'].includes(block.kind))
        .map((block) => [block.kind, block.startMinute, block.endMinute]),
    ).toEqual([
      ['action', 540, 565],
      ['rest', 565, 570],
      ['action', 570, 595],
    ]);
    await expect(f.service.apply(preview)).rejects.toThrow();
    expect(await f.profile.blocks.findAll()).toHaveLength(1);
    const draft = await f.settings.getDraft(f.date.toString());
    await f.settings.saveDraft(
      { ...draft.value, durationOverrides: [{ actionId: 'a', minutes: 40 }] },
      draft.version,
    );
    const rebuilt = await f.service.preview({ date: f.date, mode: 'rebuild' });
    await f.service.apply(rebuilt);
    expect((await f.actions.findById(EntityId.create('a')))?.estimateMinutes).toBe(40);
  } finally {
    f.db.close();
  }
});

describe('DayAutopilotService persistence', () => {
  const date = DayDate.create('2026-10-04');
  let db: LifeOsIndexedDb;
  let actions: IndexedDbLifeActionRepository;

  beforeEach(() => {
    db = new LifeOsIndexedDb(new IDBFactory());
    actions = new IndexedDbLifeActionRepository(db);
  });

  afterEach(() => db.close());

  it('atomically schedules proposals and removes deferred rebuild windows', async () => {
    const main = createLifeActionDraft('autopilot-rebuild-main');
    main.setPlan(date, true);
    main.setTimePlanning({
      estimateMinutes: 50,
      scheduledStartMinute: null,
      scheduledDurationMinutes: null,
    });
    const existing = createLifeActionDraft('autopilot-rebuild-existing');
    existing.setPlan(date, false);
    existing.setTimePlanning({
      estimateMinutes: 120,
      scheduledStartMinute: 550,
      scheduledDurationMinutes: 120,
    });
    await actions.save(main);
    await actions.save(existing);
    const service = new DayAutopilotService({
      actions,
      sessions: new IndexedDbActionSessionRepository(db),
      unitOfWork: new IndexedDbJournalUnitOfWork(db),
      capacity: { get: async () => [null, null, null, null, null, null, 100] },
      sleep: { history: async () => [] },
      clock: new FakeClock(new Date(2026, 9, 4, 8, 0)),
      currentDate: { getCurrentDate: () => date },
    });

    const preview = await service.preview({ date, startMinute: 540, mode: 'rebuild' });
    expect(preview.proposals.map((item) => item.actionId)).toEqual([main.id.toString()]);
    expect(preview.deferred).toEqual([
      expect.objectContaining({
        actionId: existing.id.toString(),
        hadScheduledWindow: true,
      }),
    ]);

    await expect(service.apply(preview)).resolves.toEqual({ updatedCount: 2 });
    expect((await actions.findById(main.id))?.scheduledStartMinute).toBe(540);
    expect((await actions.findById(existing.id))?.scheduledStartMinute).toBeNull();
  });
});
