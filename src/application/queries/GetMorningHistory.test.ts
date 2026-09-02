import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_STATUS,
  MorningCycle,
} from '../../domain';
import { GetMorningHistory } from './GetMorningHistory';

const END = DayDate.create('2026-08-23');

describe('GetMorningHistory', () => {
  it('показывает фактические записи newest-first и не смешивает сокращённое утро со средней обычного', async () => {
    const normal = finishedCycle('normal', '2026-08-22', false, 30);
    const shortened = finishedCycle('short', '2026-08-23', true, 10);
    const query = new GetMorningHistory(
      {
        findBetween: async () => [shortened, normal],
      },
      {
        execute: async (date) => ({
          ...emptyMainAction(),
          decisionId: EntityId.create(`decision-${date.toString()}`),
          decisionTitle: `Главное действие ${date.toString()}`,
          ready: true,
        }),
      },
    );

    const history = await query.execute(END);

    expect(history.items.map((item) => item.date.toString())).toEqual(['2026-08-23', '2026-08-22']);
    expect(history.items[0]).toMatchObject({
      startedAt: new Date('2026-08-23T07:12:00.000+09:00'),
      finishedAt: new Date('2026-08-23T07:22:00.000+09:00'),
      durationMs: 10 * 60_000,
      mainActionTitle: 'Главное действие 2026-08-23',
    });
    expect(history.periods.sevenDays.completedMornings).toBe(2);
    expect(history.periods.sevenDays.averageNormalMorningDurationMs).toBe(30 * 60_000);
    expect(history.periods.thirtyDays.averageNormalMorningDurationMs).toBe(30 * 60_000);
  });
});

function finishedCycle(id: string, date: string, shortened: boolean, durationMinutes: number) {
  const startedAt = new Date(`${date}T07:12:00.000+09:00`);
  const finishedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
  return MorningCycle.rehydrate({
    id: EntityId.create(id),
    dayId: EntityId.create(`${id}-day`),
    dateKey: DayDate.create(date),
    state: MORNING_CYCLE_STATE.finished,
    startedAt,
    finishedAt,
    shortenedMode: shortened,
    stageStates: [
      {
        stageId: 'quick_start.cold_shower',
        status: 'COMPLETED',
        updatedAt: new Date(startedAt.getTime() + 2 * 60_000),
      },
    ],
    waterCompletedAt: new Date(startedAt.getTime() + 60_000),
    waterAmountMl: 250,
    physicalStatus: MORNING_PHYSICAL_STATUS.skipped,
    physicalUpdatedAt: new Date(startedAt.getTime() + 3 * 60_000),
    updatedAt: finishedAt,
    version: 8,
  });
}

function emptyMainAction() {
  return {
    decisionId: null,
    decisionTitle: null,
    expectedResult: null,
    firstStepId: null,
    firstStepTitle: null,
    scheduledTime: null,
    completed: false,
    ready: false,
    candidates: [],
  } as const;
}
