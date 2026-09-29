import { describe, expect, it } from 'vitest';
import {
  completeDiaryEntry,
  createDiaryDraft,
  DayDate,
  diaryPeriod,
  reviseDiaryEntry,
  type DiaryDayEntry,
} from '../../domain';
import {
  compareDiaryAverages,
  monthDiaryWeekBuckets,
  monthWeeklyReflections,
  roundDiaryAverage,
  summarizeDiaryRatings,
} from './DiarySummary';

const completedDay = (
  date: string,
  ratings: readonly [number, number, number, number],
): DiaryDayEntry => {
  const now = new Date(`${date}T20:00:00.000Z`);
  const draft = createDiaryDraft(diaryPeriod('day', DayDate.create(date)), now);
  return completeDiaryEntry(
    reviseDiaryEntry(
      draft,
      {
        ...draft.payload,
        productivity: ratings[0] as 1,
        energy: ratings[1] as 1,
        mood: ratings[2] as 1,
        overall: ratings[3] as 1,
      },
      now,
    ),
    now,
  );
};

describe('DiarySummary', () => {
  it('averages only completed days and keeps independent sample counts', () => {
    const days = [
      completedDay('2026-09-01', [5, 2, 4, 3]),
      completedDay('2026-09-03', [3, 4, 2, 5]),
    ];
    const result = summarizeDiaryRatings(days, 7);
    expect(result).toEqual({
      productivity: { value: 4, sampleCount: 2 },
      energy: { value: 3, sampleCount: 2 },
      mood: { value: 3, sampleCount: 2 },
      overall: { value: 4, sampleCount: 2 },
      completedDays: 2,
      totalDays: 7,
    });
    expect(roundDiaryAverage(10 / 3)).toBe(3.3);
  });

  it('returns no delta until both periods have enough observations', () => {
    expect(
      compareDiaryAverages({ value: 4, sampleCount: 2 }, { value: 3, sampleCount: 7 }),
    ).toEqual({
      value: null,
      sufficient: false,
    });
    expect(
      compareDiaryAverages({ value: 4, sampleCount: 3 }, { value: 3, sampleCount: 3 }),
    ).toEqual({
      value: 1,
      sufficient: true,
    });
  });

  it('builds calendar-week month buckets and includes reflections by week end', () => {
    const month = diaryPeriod('month', DayDate.create('2026-09-18'));
    const buckets = monthDiaryWeekBuckets(month, [
      completedDay('2026-09-01', [5, 5, 5, 5]),
      completedDay('2026-09-30', [3, 3, 3, 3]),
    ]);
    expect(
      buckets.map((bucket) => [bucket.startDate, bucket.endDate, bucket.summary.completedDays]),
    ).toEqual([
      ['2026-09-01', '2026-09-06', 1],
      ['2026-09-07', '2026-09-13', 0],
      ['2026-09-14', '2026-09-20', 0],
      ['2026-09-21', '2026-09-27', 0],
      ['2026-09-28', '2026-09-30', 1],
    ]);
    const inside = completeWeek('2026-09-21', 'Главное за неделю');
    const outside = completeWeek('2026-09-28', 'Заканчивается в октябре');
    expect(
      monthWeeklyReflections(month, [inside, outside]).map((entry) => entry.payload.learned),
    ).toEqual(['Главное за неделю']);
  });
});

function completeWeek(start: string, learned: string) {
  const now = new Date(`${start}T20:00:00.000Z`);
  const draft = createDiaryDraft(diaryPeriod('week', DayDate.create(start)), now);
  return completeDiaryEntry(reviseDiaryEntry(draft, { ...draft.payload, learned }, now), now);
}
