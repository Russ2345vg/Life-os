import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_MODE,
  WALK_TYPE,
  Walk,
  type WalkPhoto,
  type WalkType,
} from '../../domain';
import { InMemoryWalkRepository } from '../../infrastructure';
import { FakeClock, FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import { CompleteWalk } from '../commands/CompleteWalk';
import { UpdateWalkPhoto } from '../commands/UpdateWalkPhoto';
import { GetWalkStatistics, WALK_STATISTICS_PERIOD } from './GetWalkStatistics';

const TODAY = DayDate.create('2026-08-08');
const PHOTO: WalkPhoto = {
  dataUrl: 'data:image/png;base64,AQID',
  mimeType: 'image/png',
  sizeBytes: 3,
};

describe('GetWalkStatistics', () => {
  it('returns zero completed walks and no average for an empty period', async () => {
    const statistics = await queryFor([]).execute();

    expect(statistics).toEqual({
      period: WALK_STATISTICS_PERIOD.last7Days,
      completedCount: 0,
      abandonedCount: 0,
      totalDurationMilliseconds: 0,
      averageDurationMilliseconds: null,
      completedByType: {
        restorative: 0,
        mindful: 0,
        reflection: 0,
        physical: 0,
        phoneFree: 0,
      },
    });
  });

  it('counts one completed walk using timestamps rather than its timer target', async () => {
    const walk = completedWalk({
      id: 'one',
      type: WALK_TYPE.mindful,
      startedAt: '2026-08-08T08:00:00.000Z',
      endedAt: '2026-08-08T08:45:00.000Z',
      timerTargetMinutes: 10,
    });

    expect(await queryFor([walk]).execute()).toMatchObject({
      completedCount: 1,
      totalDurationMilliseconds: 45 * 60 * 1000,
      averageDurationMilliseconds: 45 * 60 * 1000,
      completedByType: { mindful: 1 },
    });
  });

  it('calculates total, average and every canonical WalkType across multiple walks', async () => {
    const types = Object.values(WALK_TYPE);
    const walks = types.map((type, index) =>
      completedWalk({
        id: type,
        type,
        startedAt: `2026-08-08T0${index}:00:00.000Z`,
        endedAt: `2026-08-08T0${index}:10:00.000Z`,
      }),
    );

    expect(await queryFor(walks).execute()).toMatchObject({
      completedCount: 5,
      totalDurationMilliseconds: 50 * 60 * 1000,
      averageDurationMilliseconds: 10 * 60 * 1000,
      completedByType: {
        restorative: 1,
        mindful: 1,
        reflection: 1,
        physical: 1,
        phoneFree: 1,
      },
    });
  });

  it('calculates a completed duration across midnight', async () => {
    const walk = completedWalk({
      id: 'midnight',
      type: WALK_TYPE.reflection,
      date: '2026-08-07',
      startedAt: '2026-08-07T23:50:00.000Z',
      endedAt: '2026-08-08T00:20:00.000Z',
    });

    expect((await queryFor([walk]).execute()).totalDurationMilliseconds).toBe(30 * 60 * 1000);
  });

  it('excludes planned and running walks and reports abandoned separately', async () => {
    const planned = plannedWalk('planned', '2026-08-08', WALK_TYPE.restorative);
    const running = plannedWalk('running', '2026-08-08', WALK_TYPE.physical).start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T07:00:00.000Z'),
      reflectionQuestion: 'Что важно заметить?',
    });
    const abandoned = plannedWalk('abandoned', '2026-08-08', WALK_TYPE.phoneFree)
      .start({
        mode: WALK_MODE.stopwatch,
        startedAt: new Date('2026-08-08T08:00:00.000Z'),
        reflectionQuestion: 'Что важно заметить?',
      })
      .abandon(new Date('2026-08-08T08:20:00.000Z'));

    expect(await queryFor([planned, running, abandoned]).execute()).toMatchObject({
      completedCount: 0,
      abandonedCount: 1,
      totalDurationMilliseconds: 0,
      averageDurationMilliseconds: null,
      completedByType: { restorative: 0, physical: 0, phoneFree: 0 },
    });
  });

  it('uses inclusive calendar boundaries for 7 days, 30 days and all time', async () => {
    const walks = [
      completedWalkForDate('before-30', '2026-07-09'),
      completedWalkForDate('first-30', '2026-07-10'),
      completedWalkForDate('before-7', '2026-08-01'),
      completedWalkForDate('first-7', '2026-08-02'),
      completedWalkForDate('today', '2026-08-08'),
      completedWalkForDate('future', '2026-08-09'),
    ];
    const query = queryFor(walks);

    expect((await query.execute(WALK_STATISTICS_PERIOD.last7Days)).completedCount).toBe(2);
    expect((await query.execute(WALK_STATISTICS_PERIOD.last30Days)).completedCount).toBe(4);
    expect((await query.execute(WALK_STATISTICS_PERIOD.allTime)).completedCount).toBe(6);
  });

  it('updates immediately after completion and ignores later photo changes', async () => {
    const running = plannedWalk('live-update', '2026-08-08', WALK_TYPE.mindful).start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T08:00:00.000Z'),
      reflectionQuestion: 'Что важно заметить?',
    });
    const repository = new InMemoryWalkRepository([running]);
    const query = new GetWalkStatistics(repository, new FakeCurrentDateProvider(TODAY));
    expect((await query.execute()).completedCount).toBe(0);

    const completed = await new CompleteWalk(
      repository,
      new FakeClock(new Date('2026-08-08T08:25:00.000Z')),
    ).execute({ walkId: running.id, result: 'Стало спокойнее.' });
    expect(completed).toMatchObject({ ok: true });
    const beforePhoto = await query.execute();
    expect(beforePhoto).toMatchObject({
      completedCount: 1,
      totalDurationMilliseconds: 25 * 60 * 1000,
    });

    await new UpdateWalkPhoto(
      repository,
      new FakeClock(new Date('2026-08-08T09:00:00.000Z')),
    ).execute({ walkId: running.id, photo: PHOTO });
    expect(await query.execute()).toEqual(beforePhoto);
  });
});

function queryFor(walks: readonly Walk[]): GetWalkStatistics {
  return new GetWalkStatistics(
    new InMemoryWalkRepository(walks),
    new FakeCurrentDateProvider(TODAY),
  );
}

function plannedWalk(id: string, date: string, type: WalkType): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DayDate.create(date),
    type,
    now: new Date(`${date}T00:00:00.000Z`),
  });
}

function completedWalkForDate(id: string, date: string): Walk {
  return completedWalk({
    id,
    type: WALK_TYPE.restorative,
    date,
    startedAt: `${date}T08:00:00.000Z`,
    endedAt: `${date}T08:10:00.000Z`,
  });
}

function completedWalk(input: {
  readonly id: string;
  readonly type: WalkType;
  readonly date?: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly timerTargetMinutes?: number;
}): Walk {
  const date = input.date ?? '2026-08-08';
  return plannedWalk(input.id, date, input.type)
    .start({
      mode: input.timerTargetMinutes === undefined ? WALK_MODE.stopwatch : WALK_MODE.timer,
      startedAt: new Date(input.startedAt),
      ...(input.timerTargetMinutes === undefined
        ? {}
        : { timerTargetMinutes: input.timerTargetMinutes }),
      reflectionQuestion: 'Что важно заметить?',
    })
    .complete({ endedAt: new Date(input.endedAt) });
}
