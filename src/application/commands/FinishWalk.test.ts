import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, WALK_MODE, WALK_STATUS, WALK_TYPE, Walk } from '../../domain';
import { InMemoryWalkRepository } from '../../infrastructure';
import { FakeClock } from '../../test/helpers/Fakes';
import { AbandonWalk } from './AbandonWalk';
import { CompleteWalk } from './CompleteWalk';
import { UpdateWalkPhoto } from './UpdateWalkPhoto';

const DATE = DayDate.create('2026-08-08');
const STARTED_AT = new Date('2026-08-08T08:00:00.000Z');
const ENDED_AT = new Date('2026-08-08T08:27:15.000Z');
const PHOTO = { dataUrl: 'data:image/jpeg;base64,AQID', mimeType: 'image/jpeg', sizeBytes: 3 };

describe('walk finishing commands', () => {
  it('completes a running walk with the real clock timestamp and optional result', async () => {
    const running = createRunning('complete');
    const repository = new InMemoryWalkRepository([running]);
    const result = await new CompleteWalk(repository, new FakeClock(ENDED_AT)).execute({
      walkId: running.id,
      result: '  Хорошо проветрил голову. ',
      photo: PHOTO,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.completed, result: 'Хорошо проветрил голову.', photo: PHOTO },
    });
    if (!result.ok) throw result.error;
    expect(result.value.startedAt).toEqual(STARTED_AT);
    expect(result.value.endedAt).toEqual(ENDED_AT);
    expect(result.value.actualDurationMilliseconds).toBe(27 * 60 * 1000 + 15 * 1000);
  });

  it('rejects completion of a planned or already completed walk', async () => {
    const planned = Walk.create({
      id: EntityId.create('walk-planned'),
      date: DATE,
      type: WALK_TYPE.physical,
      now: new Date('2026-08-08T07:00:00.000Z'),
    });
    const completed = createRunning('already-completed').complete({ endedAt: ENDED_AT });
    const repository = new InMemoryWalkRepository([planned, completed]);
    const command = new CompleteWalk(repository, new FakeClock(new Date('2026-08-08T09:00:00Z')));

    expect(await command.execute({ walkId: planned.id })).toMatchObject({
      ok: false,
      error: { code: 'walk.cannot_complete' },
    });
    const repeated = await command.execute({ walkId: completed.id });
    expect(repeated).toMatchObject({ ok: false, error: { code: 'walk.cannot_complete' } });
    expect((await repository.findById(completed.id))?.endedAt).toEqual(ENDED_AT);
  });

  it('atomically permits only one concurrent completion', async () => {
    const running = createRunning('double-complete');
    const repository = new InMemoryWalkRepository([running]);
    const command = new CompleteWalk(repository, new FakeClock(ENDED_AT));

    const results = await Promise.all([
      command.execute({ walkId: running.id, result: 'Первый итог' }),
      command.execute({ walkId: running.id, result: 'Второй итог' }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect((await repository.findById(running.id))?.endedAt).toEqual(ENDED_AT);
  });

  it('abandons once and persists the actual end timestamp', async () => {
    const running = createRunning('abandon');
    const repository = new InMemoryWalkRepository([running]);
    const command = new AbandonWalk(repository, new FakeClock(ENDED_AT));

    expect(await command.execute({ walkId: running.id })).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.abandoned, endedAt: ENDED_AT },
    });
    expect(await command.execute({ walkId: running.id })).toMatchObject({
      ok: false,
      error: { code: 'walk.cannot_abandon' },
    });
  });

  it('replaces and removes the one photo without changing completion timestamps', async () => {
    const completed = createRunning('photo').complete({ endedAt: ENDED_AT, photo: PHOTO });
    const repository = new InMemoryWalkRepository([completed]);
    const command = new UpdateWalkPhoto(
      repository,
      new FakeClock(new Date('2026-08-08T09:00:00.000Z')),
    );
    const replacement = {
      dataUrl: 'data:image/png;base64,BAUG',
      mimeType: 'image/png',
      sizeBytes: 3,
    };

    expect(await command.execute({ walkId: completed.id, photo: replacement })).toMatchObject({
      ok: true,
      value: { photo: replacement },
    });
    const removed = await command.execute({ walkId: completed.id, photo: null });
    expect(removed).toMatchObject({ ok: true, value: { photo: null } });
    if (!removed.ok) throw removed.error;
    expect(removed.value.startedAt).toEqual(STARTED_AT);
    expect(removed.value.endedAt).toEqual(ENDED_AT);
  });
});

function createRunning(id: string): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type: WALK_TYPE.reflection,
    now: new Date('2026-08-08T07:00:00.000Z'),
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: STARTED_AT,
    reflectionQuestion: 'Что сейчас важно заметить?',
  });
}
