import { describe, expect, it } from 'vitest';
import { createEmptySleepSchedule, type NightCycle } from '../../domain/sleep/SleepSchedule';
import { summarizeEveningHistory } from './eveningHistoryModel';

const night = (
  date: string,
  kind: NightCycle['preparationCompletionKind'],
  done = false,
): NightCycle => ({
  id: date,
  cycleDate: date,
  plannedSleepAt: new Date(`${date}T22:30:00Z`),
  plannedWakeAt: new Date(`${date}T23:30:00Z`),
  createdAt: new Date(`${date}T20:00:00Z`),
  preparationCompletedAt: kind === null ? null : new Date(`${date}T22:00:00Z`),
  preparationCompletionKind: kind,
  preparationItems: [
    {
      id: 'base-room-air',
      groupId: 'room',
      groupTitle: 'Комната',
      title: 'Старое имя',
      position: 0,
      status: done ? 'DONE' : 'SKIPPED',
    },
  ],
});

describe('evening history', () => {
  it('excludes the active and older nights, and does not invent missing evenings', () => {
    const state = {
      ...createEmptySleepSchedule(),
      nightCycles: [
        night('2026-09-27', 'ALL_DONE'),
        night('2026-09-26', 'ALL_DONE', true),
        night('2026-09-13', null),
        night('2026-09-12', 'ALL_DONE'),
      ],
    };
    expect(summarizeEveningHistory(state, '2026-09-27')).toMatchObject({
      recorded: 2,
      completed: 1,
      onTime: 1,
      incomplete: 1,
      skipped: 0,
      suggestions: [],
    });
  });
  it('counts item opportunities only in completed preparations and preserves IDs after renaming', () => {
    const state = {
      ...createEmptySleepSchedule(),
      nightCycles: [13, 14, 15, 16, 17]
        .map((day) => night(`2026-09-${day}`, 'WITH_SKIPS', day === 13))
        .concat(night('2026-09-18', 'SKIPPED_TODAY'), night('2026-09-19', null)),
    };
    expect(summarizeEveningHistory(state, '2026-09-27').suggestions).toEqual([
      { id: 'base-room-air', title: 'Проветрить комнату', missed: 4, total: 5 },
    ]);
  });
  it('never counts skipping the whole evening as finishing before sleep', () => {
    const state = {
      ...createEmptySleepSchedule(),
      nightCycles: [night('2026-09-26', 'SKIPPED_TODAY')],
    };
    expect(summarizeEveningHistory(state, '2026-09-27')).toMatchObject({
      completed: 0,
      onTime: 0,
      skipped: 1,
    });
  });
});
