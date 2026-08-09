import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  AbandonWalk,
  CompleteWalk,
  CreateWalk,
  DeleteWalk,
  GetRunningWalk,
  GetWalkStatistics,
  GetWalksForDate,
  StartWalk,
  UpdateWalkPhoto,
} from '../../application';
import { DayDate, EntityId, WALK_MODE, WALK_STATUS, WALK_TYPE } from '../../domain';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbWalkRepository } from './IndexedDbWalkRepository';

const DATE = DayDate.create('2026-08-08');

function services(database: LifeOsIndexedDb, prefix: string) {
  const repository = new IndexedDbWalkRepository(database);
  const clock = new FakeClock(new Date('2026-08-08T08:00:00.000Z'));
  return {
    create: new CreateWalk(repository, clock, new FakeIdGenerator(prefix)),
    remove: new DeleteWalk(repository),
    query: new GetWalksForDate(repository),
    statistics: new GetWalkStatistics(repository, new FakeCurrentDateProvider(DATE)),
    running: new GetRunningWalk(repository),
    start: new StartWalk(
      repository,
      new FakeCurrentDateProvider(DATE),
      clock,
      () => 'Постоянный вопрос',
    ),
    complete: new CompleteWalk(repository, clock),
    abandon: new AbandonWalk(repository, clock),
    updatePhoto: new UpdateWalkPhoto(repository, clock),
    clock,
  };
}

describe('IndexedDbWalkRepository', () => {
  it('restores walks after IndexedDB is closed and reopened (F5)', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = services(firstDatabase, 'persisted-walk');
    expect(
      await first.create.execute({
        date: DATE,
        type: WALK_TYPE.restorative,
        sphereId: EntityId.create('sphere-health'),
      }),
    ).toMatchObject({ ok: true });
    expect(await first.create.execute({ date: DATE, type: WALK_TYPE.physical })).toMatchObject({
      ok: true,
    });
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const restored = await services(reopenedDatabase, 'reopened-walk').query.execute(DATE);
    expect(restored.map((walk) => walk.type)).toEqual([WALK_TYPE.restorative, WALK_TYPE.physical]);
    expect(restored[0]?.sphereId?.toString()).toBe('sphere-health');
    reopenedDatabase.close();
  });

  it('deletes only the requested walk', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = services(database, 'delete-walk');
    const first = await app.create.execute({ date: DATE, type: WALK_TYPE.mindful });
    await app.create.execute({ date: DATE, type: WALK_TYPE.phoneFree });
    if (!first.ok) throw first.error;

    expect(
      await app.remove.execute({ id: first.value.id, expectedVersion: first.value.version }),
    ).toMatchObject({ ok: true });
    expect((await app.query.execute(DATE)).map((walk) => walk.type)).toEqual([WALK_TYPE.phoneFree]);
    database.close();
  });

  it.each([
    [WALK_MODE.stopwatch, undefined],
    [WALK_MODE.timer, 30],
  ] as const)('restores a running %s with unchanged start data after F5', async (mode, target) => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = services(firstDatabase, `running-${mode}`);
    const created = await first.create.execute({ date: DATE, type: WALK_TYPE.reflection });
    if (!created.ok) throw created.error;
    const started = await first.start.execute(
      mode === WALK_MODE.timer
        ? { walkId: created.value.id, mode, timerTargetMinutes: target }
        : { walkId: created.value.id, mode },
    );
    if (!started.ok) throw started.error;
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const restored = await services(reopenedDatabase, `reopened-${mode}`).running.execute();

    expect(restored).toMatchObject({
      status: WALK_STATUS.running,
      mode,
      timerTargetMinutes: target ?? null,
      reflectionQuestion: 'Постоянный вопрос',
      version: 2,
    });
    expect(restored?.startedAt).toEqual(new Date('2026-08-08T08:00:00.000Z'));
    reopenedDatabase.close();
  });

  it('atomically permits only one running walk', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = services(database, 'atomic');
    const first = await app.create.execute({ date: DATE, type: WALK_TYPE.mindful });
    const second = await app.create.execute({ date: DATE, type: WALK_TYPE.physical });
    if (!first.ok) throw first.error;
    if (!second.ok) throw second.error;
    const firstCommand = new StartWalk(
      new IndexedDbWalkRepository(database),
      new FakeCurrentDateProvider(DATE),
      new FakeClock(new Date('2026-08-08T08:00:00.000Z')),
      () => 'Первый вопрос',
    );
    const secondCommand = new StartWalk(
      new IndexedDbWalkRepository(database),
      new FakeCurrentDateProvider(DATE),
      new FakeClock(new Date('2026-08-08T08:00:00.000Z')),
      () => 'Второй вопрос',
    );

    const results = await Promise.all([
      firstCommand.execute({ walkId: first.value.id, mode: WALK_MODE.stopwatch }),
      secondCommand.execute({ walkId: second.value.id, mode: WALK_MODE.stopwatch }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(
      (await app.query.execute(DATE)).filter((walk) => walk.status === WALK_STATUS.running),
    ).toHaveLength(1);
    database.close();
  });

  it('restores a completed walk with result and photo after F5, then removes the photo', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = services(firstDatabase, 'completed');
    const created = await first.create.execute({ date: DATE, type: WALK_TYPE.mindful });
    if (!created.ok) throw created.error;
    const started = await first.start.execute({
      walkId: created.value.id,
      mode: WALK_MODE.stopwatch,
    });
    if (!started.ok) throw started.error;
    first.clock.setTime(new Date('2026-08-08T08:45:00.000Z'));
    const completed = await first.complete.execute({
      walkId: created.value.id,
      result: 'Стало яснее.',
      photo: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', sizeBytes: 3 },
    });
    expect(completed).toMatchObject({ ok: true });
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const reopened = services(reopenedDatabase, 'reopened-completed');
    reopened.clock.setTime(new Date('2026-08-08T09:00:00.000Z'));
    const restored = (await reopened.query.execute(DATE))[0];
    expect(restored).toMatchObject({
      status: WALK_STATUS.completed,
      result: 'Стало яснее.',
      photo: { mimeType: 'image/png', sizeBytes: 3 },
    });
    expect(restored?.endedAt).toEqual(new Date('2026-08-08T08:45:00.000Z'));
    if (restored === undefined) throw new Error('Walk was not restored');
    expect(await reopened.updatePhoto.execute({ walkId: restored.id, photo: null })).toMatchObject({
      ok: true,
      value: { photo: null },
    });
    reopenedDatabase.close();
  });

  it('restores an abandoned walk after F5', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = services(firstDatabase, 'abandoned');
    const created = await first.create.execute({ date: DATE, type: WALK_TYPE.phoneFree });
    if (!created.ok) throw created.error;
    await first.start.execute({ walkId: created.value.id, mode: WALK_MODE.stopwatch });
    first.clock.setTime(new Date('2026-08-08T08:12:00.000Z'));
    expect(await first.abandon.execute({ walkId: created.value.id })).toMatchObject({ ok: true });
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const restored = (
      await services(reopenedDatabase, 'reopened-abandoned').query.execute(DATE)
    )[0];
    expect(restored).toMatchObject({ status: WALK_STATUS.abandoned, result: null, photo: null });
    expect(restored?.endedAt).toEqual(new Date('2026-08-08T08:12:00.000Z'));
    reopenedDatabase.close();
  });

  it('recalculates completed statistics from Walk records after IndexedDB reopen', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = services(firstDatabase, 'statistics');
    const created = await first.create.execute({ date: DATE, type: WALK_TYPE.physical });
    if (!created.ok) throw created.error;
    await first.start.execute({
      walkId: created.value.id,
      mode: WALK_MODE.timer,
      timerTargetMinutes: 5,
    });
    first.clock.setTime(new Date('2026-08-08T08:40:00.000Z'));
    await first.complete.execute({ walkId: created.value.id });
    expect(await first.statistics.execute()).toMatchObject({
      completedCount: 1,
      totalDurationMilliseconds: 40 * 60 * 1000,
      completedByType: { physical: 1 },
    });
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    expect(
      await services(reopenedDatabase, 'statistics-reopened').statistics.execute(),
    ).toMatchObject({
      completedCount: 1,
      totalDurationMilliseconds: 40 * 60 * 1000,
      averageDurationMilliseconds: 40 * 60 * 1000,
      completedByType: { physical: 1 },
    });
    reopenedDatabase.close();
  });
});
