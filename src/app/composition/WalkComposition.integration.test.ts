import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, WALK_MODE, WALK_STATUS, WALK_TYPE } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

const DATE = DayDate.create('2026-08-08');
const NOW = new Date('2026-08-08T08:00:00.000Z');

describe('walk application composition', () => {
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

  it('completes and restores a walk without changing actions or routine executions', async () => {
    const factory = new IDBFactory();
    const clock = new FakeClock(NOW);
    const first = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('walk-complete-composition'),
    });
    const created = await first.createWalk.execute({ date: DATE, type: WALK_TYPE.mindful });
    if (!created.ok) throw created.error;
    const started = await first.startWalk.execute({
      walkId: created.value.id,
      mode: WALK_MODE.stopwatch,
    });
    if (!started.ok) throw started.error;
    clock.setTime(new Date('2026-08-08T08:30:00.000Z'));
    expect(
      await first.completeWalk.execute({ walkId: created.value.id, result: 'Вернулся спокойнее.' }),
    ).toMatchObject({ ok: true, value: { status: WALK_STATUS.completed } });
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
      result: 'Вернулся спокойнее.',
    });
    expect(restored?.startedAt).toEqual(NOW);
    expect(restored?.endedAt).toEqual(new Date('2026-08-08T08:30:00.000Z'));
    expect(await reopened.getWalkStatistics.execute()).toMatchObject({
      completedCount: 1,
      totalDurationMilliseconds: 30 * 60 * 1000,
    });
    expect(await reopened.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await reopened.lifeActionRepository.findByDate(DATE)).toEqual([]);
    expect(await reopened.routineOccurrenceExecutionRepository.findAll()).toEqual([]);
    reopened.close();
  });
});
