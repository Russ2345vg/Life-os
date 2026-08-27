import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DayDate,
  WALK_IMPACT,
  WALK_INTENT,
  WALK_MODE,
  WALK_REENTRY_STATUS,
  WALK_REFLECTION_STAGE,
  WALK_REFLECTION_TEMPLATE,
  WALK_STATUS,
  WALK_TYPE,
} from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

const DATE = DayDate.create('2026-08-08');
const NOW = new Date('2026-08-08T08:00:00.000Z');

describe('walk application composition', () => {
  it('advances and restores reflection guidance without touching action or routine sessions', async () => {
    const factory = new IDBFactory();
    const clock = new FakeClock(NOW);
    const first = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-reflection-composition'),
    });
    const created = await first.createWalk.execute({
      date: DATE,
      intent: WALK_INTENT.reflection,
      reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
    });
    if (!created.ok) throw created.error;
    const started = await first.startWalk.execute({
      walkId: created.value.id,
      mode: WALK_MODE.stopwatch,
    });
    if (!started.ok) throw started.error;
    clock.setTime(new Date('2026-08-08T08:05:00.000Z'));
    expect(
      await first.advanceWalkReflectionStage.execute({ walkId: created.value.id }),
    ).toMatchObject({
      ok: true,
      value: { reflectionStage: WALK_REFLECTION_STAGE.assumptions },
    });
    expect(await first.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await first.routineOccurrenceExecutionRepository.findAll()).toEqual([]);
    first.close();

    const reopened = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock: new FakeClock(new Date('2026-08-08T08:06:00.000Z')),
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-reflection-reopened'),
    });
    expect(await reopened.getActiveWalk.execute()).toMatchObject({
      reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
      reflectionStage: WALK_REFLECTION_STAGE.assumptions,
      status: WALK_STATUS.running,
    });
    expect(await reopened.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await reopened.routineOccurrenceExecutionRepository.findAll()).toEqual([]);
    reopened.close();
  });

  it('wires create, date query, delete and F5 recovery through IndexedDB', async () => {
    const factory = new IDBFactory();
    const first = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock: new FakeClock(NOW),
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-composition'),
    });
    const created = await first.createWalk.execute({ date: DATE, type: WALK_TYPE.reflection });
    if (!created.ok) throw created.error;
    expect(await first.getWalksForDate.execute(DATE)).toHaveLength(1);
    first.close();

    const reopened = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock: new FakeClock(NOW),
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-reopened'),
    });
    const restored = await reopened.getWalksForDate.execute(DATE);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.type).toBe(WALK_TYPE.reflection);
    expect(
      await reopened.deleteWalk.execute({
        id: restored[0]!.id,
        expectedVersion: restored[0]!.version,
      }),
    ).toMatchObject({ ok: true });
    expect(await reopened.getWalksForDate.execute(DATE)).toHaveLength(0);
    reopened.close();
  });

  it('starts and restores a walk without creating WorkSession or changing LifeAction data', async () => {
    const factory = new IDBFactory();
    const first = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock: new FakeClock(NOW),
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-start-composition'),
    });
    const created = await first.createWalk.execute({ date: DATE, type: WALK_TYPE.phoneFree });
    if (!created.ok) throw created.error;
    const started = await first.startWalk.execute({
      walkId: created.value.id,
      mode: WALK_MODE.timer,
      timerTargetMinutes: 20,
    });
    expect(started).toMatchObject({ ok: true, value: { status: WALK_STATUS.running } });
    expect(await first.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await first.lifeActionRepository.findByDate(DATE)).toEqual([]);
    first.close();

    const reopened = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock: new FakeClock(new Date('2026-08-08T08:05:00.000Z')),
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-start-reopened'),
    });
    const restored = await reopened.getRunningWalk.execute();
    expect(restored).toMatchObject({
      status: WALK_STATUS.running,
      mode: WALK_MODE.timer,
      timerTargetMinutes: 20,
      version: 2,
    });
    if (!started.ok) throw started.error;
    expect(restored?.startedAt).toEqual(started.value.startedAt);
    expect(restored?.reflectionQuestion).toBe(started.value.reflectionQuestion);
    expect(await reopened.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await reopened.lifeActionRepository.findByDate(DATE)).toEqual([]);
    reopened.close();
  });

  it('pauses, restores and resumes the active walk through application composition', async () => {
    const factory = new IDBFactory();
    const firstClock = new FakeClock(NOW);
    const first = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock: firstClock,
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-active-composition'),
    });
    const created = await first.createWalk.execute({
      date: DATE,
      intent: WALK_INTENT.recovery,
      beforeState: { energy: 4, tension: 7, clarity: 5 },
    });
    if (!created.ok) throw created.error;
    const started = await first.startWalk.execute({
      walkId: created.value.id,
      mode: WALK_MODE.stopwatch,
      reflectionQuestion: 'Что поможет отпустить напряжение?',
    });
    if (!started.ok) throw started.error;
    firstClock.setTime(new Date('2026-08-08T08:10:00.000Z'));
    expect(await first.pauseWalk.execute({ walkId: created.value.id })).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.paused },
    });
    first.close();

    const resumedAt = new Date('2026-08-08T08:20:00.000Z');
    const reopened = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock: new FakeClock(resumedAt),
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-active-reopened'),
    });
    const active = await reopened.getActiveWalk.execute();
    expect(active).toMatchObject({
      status: WALK_STATUS.paused,
      intent: WALK_INTENT.recovery,
      type: WALK_TYPE.restorative,
      beforeState: { energy: 4, tension: 7, clarity: 5 },
      reflectionQuestion: 'Что поможет отпустить напряжение?',
    });
    if (active === null) throw new Error('Active walk was not restored');

    const resumed = await reopened.resumeWalk.execute({ walkId: active.id });

    expect(resumed).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.running, pausedAt: null },
    });
    if (!resumed.ok) throw resumed.error;
    expect(resumed.value.pauseIntervals[0]?.endedAt).toEqual(resumedAt);
    expect(await reopened.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await reopened.routineOccurrenceExecutionRepository.findAll()).toEqual([]);
    reopened.close();
  });

  it('completes and restores a walk without changing actions or routine executions', async () => {
    const factory = new IDBFactory();
    const clock = new FakeClock(NOW);
    const first = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-complete-composition'),
    });
    const actionsBefore = await first.lifeActionRepository.findByDate(DATE);
    const routinesBefore = await first.routineOccurrenceExecutionRepository.findAll();
    const created = await first.createWalk.execute({ date: DATE, type: WALK_TYPE.mindful });
    if (!created.ok) throw created.error;
    const started = await first.startWalk.execute({
      walkId: created.value.id,
      mode: WALK_MODE.stopwatch,
    });
    if (!started.ok) throw started.error;
    clock.setTime(new Date('2026-08-08T08:30:00.000Z'));
    const completed = await first.completeWalk.execute({ walkId: created.value.id });
    expect(completed).toMatchObject({ ok: true, value: { status: WALK_STATUS.completed } });
    if (!completed.ok) throw completed.error;
    clock.setTime(new Date('2026-08-08T08:32:00.000Z'));
    expect(
      await first.recordWalkOutcome.execute({
        walkId: completed.value.id,
        afterState: { energy: 7, tension: 2, clarity: 8 },
        impact: WALK_IMPACT.better,
        reflection: 'Вернулся спокойнее.',
      }),
    ).toMatchObject({ ok: true });
    expect(await first.getWalkStatistics.execute()).toMatchObject({
      completedCount: 1,
      totalDurationMilliseconds: 30 * 60 * 1000,
      completedByType: { mindful: 1 },
    });
    expect(await first.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await first.lifeActionRepository.findByDate(DATE)).toEqual([]);
    expect(await first.routineOccurrenceExecutionRepository.findAll()).toEqual([]);
    first.close();

    const reopened = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock: new FakeClock(new Date('2026-08-08T09:00:00.000Z')),
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-complete-reopened'),
    });
    const restored = (await reopened.getWalksForDate.execute(DATE))[0];
    expect(restored).toMatchObject({
      status: WALK_STATUS.completed,
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      result: 'Вернулся спокойнее.',
    });
    expect(restored?.startedAt).toEqual(NOW);
    expect(restored?.endedAt).toEqual(new Date('2026-08-08T08:30:00.000Z'));
    const pending = await reopened.getPendingWalkReentry.execute();
    expect(pending).toMatchObject({
      id: completed.value.id,
      reentry: { status: WALK_REENTRY_STATUS.pending },
    });
    expect(
      await reopened.completeWalkReentry.execute({ walkId: completed.value.id }),
    ).toMatchObject({
      ok: true,
      value: { reentry: { status: WALK_REENTRY_STATUS.completed } },
    });
    await expect(reopened.getPendingWalkReentry.execute()).resolves.toBeNull();
    expect(await reopened.getWalkStatistics.execute()).toMatchObject({
      completedCount: 1,
      totalDurationMilliseconds: 30 * 60 * 1000,
    });
    expect(await reopened.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await reopened.lifeActionRepository.findByDate(DATE)).toEqual(actionsBefore);
    expect(await reopened.routineOccurrenceExecutionRepository.findAll()).toEqual(routinesBefore);
    reopened.close();
  });
});
