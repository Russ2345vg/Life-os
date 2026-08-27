import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, WALK_MODE, WALK_STATUS, WALK_TYPE, Walk } from '../../domain';
import { InMemoryWalkRepository } from '../../infrastructure';
import { FakeClock } from '../../test/helpers/Fakes';
import { PauseWalk } from './PauseWalk';
import { ResumeWalk } from './ResumeWalk';

const STARTED_AT = new Date('2026-08-08T08:00:00.000Z');
const PAUSED_AT = new Date('2026-08-08T08:20:00.000Z');
const RESUMED_AT = new Date('2026-08-08T08:25:00.000Z');

describe('active walk commands', () => {
  it('pauses a running walk at the clock timestamp and keeps repeated pause idempotent', async () => {
    const running = runningWalk('pause');
    const repository = new InMemoryWalkRepository([running]);
    const command = new PauseWalk(repository, new FakeClock(PAUSED_AT));

    const first = await command.execute({ walkId: running.id });
    const repeated = await command.execute({ walkId: running.id });

    expect(first).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.paused, pausedAt: PAUSED_AT, version: 3 },
    });
    expect(repeated).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.paused, pausedAt: PAUSED_AT, version: 3 },
    });
    expect(await repository.findById(running.id)).toMatchObject({
      status: WALK_STATUS.paused,
      pausedAt: PAUSED_AT,
      version: 3,
    });
  });

  it('resumes a paused walk at the clock timestamp and keeps repeated resume idempotent', async () => {
    const paused = runningWalk('resume').pause(PAUSED_AT);
    const repository = new InMemoryWalkRepository([paused]);
    const command = new ResumeWalk(repository, new FakeClock(RESUMED_AT));

    const first = await command.execute({ walkId: paused.id });
    const repeated = await command.execute({ walkId: paused.id });

    expect(first).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.running, pausedAt: null, version: 4 },
    });
    expect(repeated).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.running, pausedAt: null, version: 4 },
    });
    if (!first.ok) throw first.error;
    expect(first.value.pauseIntervals).toHaveLength(1);
    expect(first.value.pauseIntervals[0]?.startedAt).toEqual(PAUSED_AT);
    expect(first.value.pauseIntervals[0]?.endedAt).toEqual(RESUMED_AT);
  });

  it('permits only one concurrent pause update', async () => {
    const running = runningWalk('concurrent-pause');
    const repository = new InMemoryWalkRepository([running]);
    const command = new PauseWalk(repository, new FakeClock(PAUSED_AT));

    const results = await Promise.all([
      command.execute({ walkId: running.id }),
      command.execute({ walkId: running.id }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      ok: false,
      error: { code: 'walk.version_conflict' },
    });
    expect(await repository.findById(running.id)).toMatchObject({
      status: WALK_STATUS.paused,
      version: 3,
    });
  });
});

function runningWalk(id: string): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DayDate.create('2026-08-08'),
    type: WALK_TYPE.mindful,
    now: new Date('2026-08-08T07:00:00.000Z'),
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: STARTED_AT,
    reflectionQuestion: 'Что сейчас важно заметить?',
  });
}
