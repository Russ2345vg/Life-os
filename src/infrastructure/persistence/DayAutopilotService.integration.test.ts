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
