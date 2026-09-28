import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { SetLifeActionPlan } from '../../application/commands/SetLifeActionPlan';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

describe('safe date undo', () => {
  let database: LifeOsIndexedDb;
  let repository: IndexedDbLifeActionRepository;
  let command: SetLifeActionPlan;
  const oldDate = DayDate.create('2026-09-27');
  const nextDate = DayDate.create('2026-09-28');
  beforeEach(() => {
    database = new LifeOsIndexedDb(new IDBFactory());
    repository = new IndexedDbLifeActionRepository(database);
    command = new SetLifeActionPlan(
      repository,
      new IndexedDbJournalUnitOfWork(database),
      new FakeClock(new Date('2026-09-27T12:00:00Z')),
      new FakeIdGenerator(),
    );
  });
  afterEach(() => database.close());

  it('restores an undated draft and refuses using the same receipt twice', async () => {
    const action = createLifeActionDraft('draft');
    await repository.save(action);
    const moved = await command.changeDate({ lifeActionId: action.id, plannedDate: nextDate });
    if (!moved.ok || !moved.value.receipt) throw new Error('Missing receipt');
    expect((await command.undoDate(moved.value.receipt)).ok).toBe(true);
    expect((await repository.findById(action.id))?.plannedDate).toBeNull();
    expect((await command.undoDate(moved.value.receipt)).ok).toBe(false);
  });

  it('restores a previous time block and refuses undo when that window was taken', async () => {
    const action = createLifeActionDraft('timed-original');
    action.setPlan(oldDate, false);
    action.setTimePlanning({
      estimateMinutes: 80,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    });
    await repository.save(action);
    const moved = await command.changeDate({ lifeActionId: action.id, plannedDate: nextDate });
    if (!moved.ok || !moved.value.receipt) throw new Error('Missing receipt');
    expect(moved.value.action.scheduledStartMinute).toBe(600);
    const replacement = createLifeActionDraft('timed-replacement');
    replacement.setPlan(oldDate, false);
    replacement.setTimePlanning({
      estimateMinutes: null,
      scheduledStartMinute: 630,
      scheduledDurationMinutes: 30,
    });
    await repository.save(replacement);
    const rejected = await command.undoDate(moved.value.receipt);
    expect(rejected.ok).toBe(false);
    expect((await repository.findById(action.id))?.plannedDate?.toString()).toBe(
      nextDate.toString(),
    );
  });

  it('preserves the destination main and restores the previous main', async () => {
    const action = createReadyLifeAction('main', oldDate);
    action.setPlan(oldDate, true);
    const destination = createLifeActionDraft('destination');
    destination.setPlan(nextDate, true);
    await repository.save(action);
    await repository.save(destination);
    const moved = await command.changeDate({ lifeActionId: action.id, plannedDate: nextDate });
    if (!moved.ok || !moved.value.receipt) throw new Error('Missing receipt');
    expect(moved.value.action.isNext).toBe(false);
    expect((await repository.findById(destination.id))?.isNext).toBe(true);
    expect((await command.undoDate(moved.value.receipt)).ok).toBe(true);
    const restored = await repository.findById(action.id);
    expect(restored?.plannedDate?.toString()).toBe(oldDate.toString());
    expect(restored?.isNext).toBe(true);
  });

  it('restores time and estimate after clearing a dated block', async () => {
    const action = createLifeActionDraft('clear-timed');
    action.setPlan(oldDate, false);
    action.setTimePlanning({
      estimateMinutes: 80,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    });
    await repository.save(action);
    const moved = await command.changeDate({ lifeActionId: action.id, plannedDate: null });
    if (!moved.ok || !moved.value.receipt) throw new Error('Missing receipt');
    expect(moved.value.action.scheduledStartMinute).toBeNull();
    expect((await command.undoDate(moved.value.receipt)).ok).toBe(true);
    expect(await repository.findById(action.id)).toMatchObject({
      estimateMinutes: 80,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    });
  });

  it('does not overwrite a later change', async () => {
    const action = createLifeActionDraft('later');
    action.setPlan(oldDate, false);
    await repository.save(action);
    const moved = await command.changeDate({ lifeActionId: action.id, plannedDate: nextDate });
    if (!moved.ok || !moved.value.receipt) throw new Error('Missing receipt');
    await command.execute({ lifeActionId: action.id, plannedDate: nextDate, isNext: true });
    expect((await command.undoDate(moved.value.receipt)).ok).toBe(false);
    expect((await repository.findById(action.id))?.isNext).toBe(true);
    expect((await repository.findById(action.id))?.plannedDate?.toString()).toBe(
      nextDate.toString(),
    );
  });

  it('atomically refuses restoring a main when the old day has another main', async () => {
    const action = createLifeActionDraft('original');
    action.setPlan(oldDate, true);
    await repository.save(action);
    const moved = await command.changeDate({ lifeActionId: action.id, plannedDate: nextDate });
    if (!moved.ok || !moved.value.receipt) throw new Error('Missing receipt');
    const replacement = createLifeActionDraft('replacement');
    replacement.setPlan(oldDate, true);
    await repository.save(replacement);
    expect((await command.undoDate(moved.value.receipt)).ok).toBe(false);
    expect((await repository.findById(action.id))?.version).toBe(
      moved.value.receipt.expectedVersion,
    );
    expect((await repository.findById(action.id))?.plannedDate?.toString()).toBe(
      nextDate.toString(),
    );
    expect((await repository.findById(replacement.id))?.isNext).toBe(true);
  });

  it('keeps a same-date main unchanged and supplies no undo', async () => {
    const action = createLifeActionDraft('same');
    action.setPlan(oldDate, true);
    await repository.save(action);
    const result = await command.changeDate({ lifeActionId: action.id, plannedDate: oldDate });
    expect(result.ok && result.value.receipt).toBeNull();
    expect((await repository.findById(action.id))?.version).toBe(action.version);
    expect((await repository.findById(action.id))?.isNext).toBe(true);
  });

  it('rejects a stale date move after completion while legacy execute remains available', async () => {
    const action = completeLifeAction(createReadyLifeAction('completed', oldDate));
    await repository.save(action);
    expect((await command.changeDate({ lifeActionId: action.id, plannedDate: nextDate })).ok).toBe(
      false,
    );
    expect((await repository.findById(action.id))?.version).toBe(action.version);
    expect(
      (
        await command.execute({
          lifeActionId: action.id,
          plannedDate: nextDate,
          allowedStatuses: ['completed'],
        })
      ).ok,
    ).toBe(true);
  });

  it.each([undefined, false, true])(
    'restores recurrence manualDate=%s exactly',
    async (manualDate) => {
      const action = createLifeActionDraft('recurring');
      action.setPlan(oldDate, false);
      const occurrence = {
        ruleId: 'rule',
        slot: 'slot',
        ruleRevision: 1,
        originalDate: oldDate.toString(),
        ...(manualDate === undefined ? {} : { manualDate }),
      };
      action.setPlanningMetadata({ occurrence });
      await repository.save(action);
      const moved = await command.changeDate({ lifeActionId: action.id, plannedDate: nextDate });
      if (!moved.ok || !moved.value.receipt) throw new Error('Missing receipt');
      expect(moved.value.action.occurrence?.manualDate).toBe(true);
      expect((await command.undoDate(moved.value.receipt)).ok).toBe(true);
      expect((await repository.findById(action.id))?.occurrence).toEqual(occurrence);
    },
  );
});
