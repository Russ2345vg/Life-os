import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActionSession, DayDate, EntityId } from '../../domain';
import { ActionSessionRecordMapper } from '../../infrastructure/persistence/mappers/ActionSessionRecordMapper';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbLifeActionRepository } from '../../infrastructure/persistence/IndexedDbLifeActionRepository';
import { IndexedDbActionSessionRepository } from '../../infrastructure/persistence/IndexedDbActionSessionRepository';
import { IndexedDbJournalUnitOfWork } from '../../infrastructure/persistence/IndexedDbJournalUnitOfWork';
import { WorkSessions } from '../../application/time/WorkSessions';

describe('WorkSessions', () => {
  let db: LifeOsIndexedDb;
  let actions: IndexedDbLifeActionRepository;
  let sessions: IndexedDbActionSessionRepository;
  let service: WorkSessions;
  let clock: FakeClock;
  beforeEach(() => {
    db = new LifeOsIndexedDb(new IDBFactory());
    actions = new IndexedDbLifeActionRepository(db);
    sessions = new IndexedDbActionSessionRepository(db);
    clock = new FakeClock(new Date('2026-09-28T08:00:00Z'));
    service = new WorkSessions(
      sessions,
      actions,
      new IndexedDbJournalUnitOfWork(db),
      clock,
      new FakeIdGenerator('work'),
    );
  });
  afterEach(() => db.close());

  it('runs a draft session through reload, pauses and finish without completing the action', async () => {
    const action = createLifeActionDraft('work-action');
    action.setGoal(EntityId.create('goal-original'));
    await actions.save(action);
    const started = await service.start(action.id.toString());
    expect(started.goalIdAtStart?.toString()).toBe('goal-original');
    clock.setTime(new Date('2026-09-28T08:10:00Z'));
    const paused = await service.pause(started.id.toString(), started.version);
    expect((await sessions.findById(started.id))?.status).toBe('paused');
    clock.setTime(new Date('2026-09-28T08:15:00Z'));
    const resumed = await service.resume(started.id.toString(), paused.version);
    clock.setTime(new Date('2026-09-28T08:25:00Z'));
    const finished = await service.finish(started.id.toString(), resumed.version);
    expect(finished.workedDurationAt(clock.now())).toBe(20 * 60 * 1000);
    expect((await actions.findById(action.id))?.status).toBe('draft');
    expect((await sessions.findById(started.id))?.goalIdAtStart?.toString()).toBe('goal-original');
  });

  it('records focus time only up to its deadline after the app wakes late', async () => {
    const action = createLifeActionDraft('deadline-work');
    await actions.save(action);
    const started = await service.start(action.id.toString());
    clock.setTime(new Date('2026-09-28T08:40:00Z'));
    const paused = await service.pauseAtDeadline(
      started.id.toString(),
      started.version,
      new Date('2026-09-28T08:25:00Z'),
    );
    expect(paused.isPaused()).toBe(true);
    expect(paused.workedDurationAt(clock.now())).toBe(25 * 60_000);
    expect((await sessions.findById(started.id))?.pausedAt).toEqual(
      new Date('2026-09-28T08:25:00Z'),
    );
  });

  it('serializes concurrent starts and rejects starting another session while paused', async () => {
    const first = createLifeActionDraft('first-work');
    const second = createLifeActionDraft('second-work');
    await actions.save(first);
    await actions.save(second);
    const results = await Promise.allSettled([
      service.start(first.id.toString()),
      service.start(second.id.toString()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const active = (await service.list()).find((session) => !session.isCompleted())!;
    await service.pause(active.id.toString(), active.version);
    await expect(service.start(second.id.toString())).rejects.toMatchObject({
      code: 'session.unfinished_exists',
    });
  });

  it('refuses a stale pause after a later transition', async () => {
    const action = createLifeActionDraft('versioned-work');
    await actions.save(action);
    const started = await service.start(action.id.toString());
    await service.pause(started.id.toString(), started.version);
    await expect(service.pause(started.id.toString(), started.version)).rejects.toMatchObject({
      code: 'persistence.version_conflict',
    });
  });

  it('atomically rejects an autopilot batch when one action starts running', async () => {
    const active = createLifeActionDraft('autopilot-active');
    const idle = createLifeActionDraft('autopilot-idle');
    active.setPlan(DayDate.create('2026-09-28'), false);
    idle.setPlan(DayDate.create('2026-09-28'), false);
    await actions.save(active);
    await actions.save(idle);
    await service.start(active.id.toString());
    const activeDraft = (await actions.findById(active.id))!;
    const idleDraft = (await actions.findById(idle.id))!;
    const activeVersion = activeDraft.version;
    const idleVersion = idleDraft.version;
    activeDraft.setTimePlanning({
      estimateMinutes: 25,
      scheduledStartMinute: 540,
      scheduledDurationMinutes: 25,
    });
    idleDraft.setTimePlanning({
      estimateMinutes: 25,
      scheduledStartMinute: 570,
      scheduledDurationMinutes: 25,
    });

    await expect(
      new IndexedDbJournalUnitOfWork(db).commit({
        inactiveSessionActionIds: [active.id, idle.id],
        lifeActions: [
          { lifeAction: activeDraft, expectedVersion: activeVersion },
          { lifeAction: idleDraft, expectedVersion: idleVersion },
        ],
        journalEntries: [],
      }),
    ).rejects.toMatchObject({ code: 'day_autopilot.active_session' });
    expect((await actions.findById(active.id))?.scheduledStartMinute).toBeNull();
    expect((await actions.findById(idle.id))?.scheduledStartMinute).toBeNull();
  });

  it('can finish imported conflicting sessions and preserves an orphaned session history', async () => {
    const connection = await db.open();
    const first = ActionSession.start({
      id: EntityId.create('imported-session-one'),
      lifeActionId: EntityId.create('missing-action-one'),
      startedAt: clock.now(),
      eventId: EntityId.create('imported-event-one'),
    });
    const second = ActionSession.start({
      id: EntityId.create('imported-session-two'),
      lifeActionId: EntityId.create('missing-action-two'),
      startedAt: clock.now(),
      eventId: EntityId.create('imported-event-two'),
    });
    await new Promise<void>((resolve, reject) => {
      const tx = connection.transaction('actionSessions', 'readwrite');
      for (const session of [first, second])
        tx.objectStore('actionSessions').put(ActionSessionRecordMapper.toRecord(session));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    expect((await service.list()).filter((session) => !session.isCompleted())).toHaveLength(2);
    await service.finish(first.id.toString(), first.version, true);
    expect((await service.list()).filter((session) => !session.isCompleted())).toHaveLength(1);
    expect((await sessions.findById(first.id))?.isInterrupted()).toBe(true);
  });
});
