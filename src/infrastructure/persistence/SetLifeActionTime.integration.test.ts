import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbJournalUnitOfWork } from '../../infrastructure/persistence/IndexedDbJournalUnitOfWork';
import { IndexedDbLifeActionRepository } from '../../infrastructure/persistence/IndexedDbLifeActionRepository';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import { SetLifeActionTime } from '../../application/commands/SetLifeActionTime';

describe('SetLifeActionTime', () => {
  const date = DayDate.create('2026-09-28');
  let db: LifeOsIndexedDb;
  let repository: IndexedDbLifeActionRepository;
  let command: SetLifeActionTime;
  beforeEach(() => {
    db = new LifeOsIndexedDb(new IDBFactory());
    repository = new IndexedDbLifeActionRepository(db);
    command = new SetLifeActionTime(repository, new IndexedDbJournalUnitOfWork(db));
  });
  afterEach(() => db.close());

  it('rejects a stale estimate edit without losing the newer estimate', async () => {
    const action = createLifeActionDraft('stale-time');
    await repository.save(action);
    const input = {
      lifeActionId: action.id,
      estimateMinutes: 30,
      scheduledStartMinute: null,
      scheduledDurationMinutes: null,
      expectedVersion: action.version,
    };
    expect((await command.execute(input)).ok).toBe(true);
    const stale = await command.execute({ ...input, estimateMinutes: 90 });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('persistence.version_conflict');
    expect((await repository.findById(action.id))?.estimateMinutes).toBe(30);
  });

  it('allows an estimate edit for an existing imported overlap', async () => {
    const first = createLifeActionDraft('imported-first');
    const second = createLifeActionDraft('imported-second');
    for (const action of [first, second]) {
      action.setPlan(date, false);
      action.setTimePlanning({
        estimateMinutes: 60,
        scheduledStartMinute: 600,
        scheduledDurationMinutes: 60,
      });
    }
    // Sync may import simultaneous assignments from separate devices; bypass local commands.
    const database = await db.open();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(LIFE_OS_STORE.lifeActions, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      for (const action of [first, second])
        tx.objectStore(LIFE_OS_STORE.lifeActions).put(LifeActionRecordMapper.toRecord(action));
    });
    expect(
      (
        await command.execute({
          lifeActionId: first.id,
          estimateMinutes: 90,
          scheduledStartMinute: 600,
          scheduledDurationMinutes: 60,
          expectedVersion: first.version,
        })
      ).ok,
    ).toBe(true);
    expect((await repository.findById(second.id))?.scheduledStartMinute).toBe(600);
  });

  it('saves adjacent blocks on the same day without a collision', async () => {
    const first = createLifeActionDraft('time-first');
    const second = createLifeActionDraft('time-second');
    first.setPlan(date, false);
    second.setPlan(date, false);
    await repository.save(first);
    await repository.save(second);

    expect(
      (
        await command.execute({
          lifeActionId: first.id,
          estimateMinutes: 60,
          scheduledStartMinute: 600,
          scheduledDurationMinutes: 60,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await command.execute({
          lifeActionId: second.id,
          estimateMinutes: 60,
          scheduledStartMinute: 660,
          scheduledDurationMinutes: 60,
        })
      ).ok,
    ).toBe(true);
    expect((await repository.findById(second.id))?.scheduledStartMinute).toBe(660);
  });

  it('atomically rejects an overlapping block and leaves the other action unchanged', async () => {
    const first = createLifeActionDraft('time-first');
    const second = createLifeActionDraft('time-second');
    first.setPlan(date, false);
    second.setPlan(date, false);
    first.setTimePlanning({
      estimateMinutes: 90,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 90,
    });
    await repository.save(first);
    await repository.save(second);

    const result = await command.execute({
      lifeActionId: second.id,
      estimateMinutes: 60,
      scheduledStartMinute: 650,
      scheduledDurationMinutes: 60,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('life_action.time_conflict');
    const stored = await repository.findById(second.id);
    expect(stored?.scheduledStartMinute).toBeNull();
    expect(stored?.version).toBe(second.version);
  });

  it('serializes concurrent assignments to the same window', async () => {
    const first = createLifeActionDraft('time-first');
    const second = createLifeActionDraft('time-second');
    first.setPlan(date, false);
    second.setPlan(date, false);
    await repository.save(first);
    await repository.save(second);
    const results = await Promise.all(
      [first, second].map((action) =>
        command.execute({
          lifeActionId: action.id,
          estimateMinutes: null,
          scheduledStartMinute: 600,
          scheduledDurationMinutes: 60,
        }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });
});
