import { describe, expect, it } from 'vitest';
import { DayDate } from '../day/DayDate';
import {
  completeDiaryEntry,
  createDiaryDraft,
  diaryPeriod,
  reviseDiaryEntry,
  validateDiaryEntry,
  type DiaryDayPayload,
  type DiaryMonthPayload,
  type DiaryWeekPayload,
} from './DiaryEntry';

const at = (value: string) => new Date(value);

describe('Diary calendar identity', () => {
  it.each([
    [
      'day',
      '2026-09-29',
      {
        start: '2026-09-29',
        end: '2026-09-29',
        key: 'day:2026-09-29',
        id: 'diary:day:2026-09-29',
      },
    ],
    [
      'week',
      '2026-01-01',
      {
        start: '2025-12-29',
        end: '2026-01-04',
        key: 'week:2025-12-29',
        id: 'diary:week:2025-12-29',
      },
    ],
    [
      'month',
      '2024-02-21',
      {
        start: '2024-02-01',
        end: '2024-02-29',
        key: 'month:2024-02-01',
        id: 'diary:month:2024-02-01',
      },
    ],
  ] as const)('normalizes a %s period from %s', (kind, anchor, expected) => {
    const period = diaryPeriod(kind, DayDate.create(anchor));

    expect(period.periodStart.toString()).toBe(expected.start);
    expect(period.periodEnd.toString()).toBe(expected.end);
    expect(period.periodKey).toBe(expected.key);
    expect(period.id.toString()).toBe(expected.id);
  });

  it('keeps a Sunday in the Monday-to-Sunday week', () => {
    const period = diaryPeriod('week', DayDate.create('2026-09-27'));

    expect(period.periodStart.toString()).toBe('2026-09-21');
    expect(period.periodEnd.toString()).toBe('2026-09-27');
  });
});

describe('Diary entry lifecycle', () => {
  it('creates an empty transient day draft with stable identity', () => {
    const entry = createDiaryDraft(
      diaryPeriod('day', DayDate.create('2026-09-29')),
      at('2026-09-29T12:00:00.000Z'),
    );

    expect(entry).toMatchObject({
      periodKey: 'day:2026-09-29',
      kind: 'day',
      status: 'draft',
      promptVersion: 1,
      payload: {
        productivity: null,
        energy: null,
        mood: null,
        overall: null,
        worldBetter: null,
        energyReflection: null,
        tomorrowReflection: null,
        note: null,
      },
      createdAt: '2026-09-29T12:00:00.000Z',
      updatedAt: '2026-09-29T12:00:00.000Z',
      version: 0,
    });
  });

  it('normalizes optional text while preserving internal line breaks', () => {
    const draft = createDiaryDraft(
      diaryPeriod('day', DayDate.create('2026-09-29')),
      at('2026-09-29T12:00:00.000Z'),
    );
    const payload: DiaryDayPayload = {
      productivity: 4,
      energy: 3,
      mood: 5,
      overall: 4,
      worldBetter: '  Помог коллеге\nи позвонил родителям.  ',
      energyReflection: '   ',
      tomorrowReflection: null,
      note: '\n  Строка один\nСтрока два  \n',
    };

    const revised = reviseDiaryEntry(draft, payload, at('2026-09-29T13:00:00.000Z'));

    expect(revised.payload.worldBetter).toBe('Помог коллеге\nи позвонил родителям.');
    expect(revised.payload.energyReflection).toBeNull();
    expect(revised.payload.note).toBe('Строка один\nСтрока два');
    expect(revised.updatedAt).toBe('2026-09-29T13:00:00.000Z');
    expect(revised.version).toBe(0);
  });

  it('requires all four independent ratings to complete a day', () => {
    const draft = createDiaryDraft(
      diaryPeriod('day', DayDate.create('2026-09-29')),
      at('2026-09-29T12:00:00.000Z'),
    );
    const incomplete = reviseDiaryEntry(
      draft,
      { ...draft.payload, productivity: 5, energy: 4, mood: 3 },
      at('2026-09-29T13:00:00.000Z'),
    );

    expect(() => completeDiaryEntry(incomplete, at('2026-09-29T14:00:00.000Z'))).toThrow(
      /четыре оценки/iu,
    );

    const complete = completeDiaryEntry(
      reviseDiaryEntry(
        incomplete,
        { ...incomplete.payload, overall: 2 },
        at('2026-09-29T13:30:00.000Z'),
      ),
      at('2026-09-29T14:00:00.000Z'),
    );
    expect(complete.status).toBe('completed');
    expect(complete.payload).toMatchObject({ productivity: 5, energy: 4, mood: 3, overall: 2 });
  });

  it.each([
    [
      'week',
      {
        learned: null,
        biggestAchievement: null,
        memorableMoments: null,
        energyReflection: null,
        nextWeek: null,
      } satisfies DiaryWeekPayload,
    ],
    [
      'month',
      {
        biggestAchievement: null,
        learnedAboutSelf: null,
        memorableMoments: null,
        energyAndMood: null,
        nextMonth: null,
      } satisfies DiaryMonthPayload,
    ],
  ] as const)('requires at least one answer to complete a %s', (kind, payload) => {
    const draft = createDiaryDraft(
      diaryPeriod(kind, DayDate.create('2026-09-29')),
      at('2026-09-29T12:00:00.000Z'),
    );

    expect(() => completeDiaryEntry(draft, at('2026-09-29T13:00:00.000Z'))).toThrow(
      /хотя бы на один вопрос/iu,
    );

    const answered =
      kind === 'week'
        ? reviseDiaryEntry(
            draft,
            { ...payload, learned: '  Просить помощь раньше.  ' },
            at('2026-09-29T12:30:00.000Z'),
          )
        : reviseDiaryEntry(
            draft,
            { ...payload, nextMonth: '  Больше сна.  ' },
            at('2026-09-29T12:30:00.000Z'),
          );

    expect(completeDiaryEntry(answered, at('2026-09-29T13:00:00.000Z')).status).toBe('completed');
  });

  it('returns a completed entry to draft when its payload changes', () => {
    const draft = createDiaryDraft(
      diaryPeriod('week', DayDate.create('2026-09-29')),
      at('2026-09-29T12:00:00.000Z'),
    );
    const completed = completeDiaryEntry(
      reviseDiaryEntry(
        draft,
        { ...draft.payload, learned: 'Первый вывод' },
        at('2026-09-29T12:30:00.000Z'),
      ),
      at('2026-09-29T13:00:00.000Z'),
    );

    const edited = reviseDiaryEntry(
      completed,
      { ...completed.payload, learned: 'Уточнённый вывод' },
      at('2026-09-29T14:00:00.000Z'),
    );

    expect(edited.status).toBe('draft');
    expect(edited.createdAt).toBe(completed.createdAt);
  });
});

describe('Diary entry validation', () => {
  it('rejects invalid ratings, text limits, timestamps and versions', () => {
    const draft = createDiaryDraft(
      diaryPeriod('day', DayDate.create('2026-09-29')),
      at('2026-09-29T12:00:00.000Z'),
    );

    for (const payload of [
      { ...draft.payload, productivity: 0 },
      { ...draft.payload, energy: 6 },
      { ...draft.payload, mood: 2.5 },
      { ...draft.payload, worldBetter: 'x'.repeat(4_001) },
      { ...draft.payload, note: 'x'.repeat(12_001) },
    ])
      expect(() =>
        reviseDiaryEntry(draft, payload as DiaryDayPayload, at('2026-09-29T13:00:00.000Z')),
      ).toThrow();

    expect(() => validateDiaryEntry({ ...draft, updatedAt: 'bad' })).toThrow();
    expect(() => validateDiaryEntry({ ...draft, updatedAt: '2026-09-29T11:59:59.999Z' })).toThrow();
    expect(() => validateDiaryEntry({ ...draft, version: -1 })).toThrow();
    expect(() => validateDiaryEntry({ ...draft, version: 0 }, { persisted: true })).toThrow();
  });

  it('rejects a record whose identity or payload does not match its kind', () => {
    const draft = createDiaryDraft(
      diaryPeriod('month', DayDate.create('2026-09-29')),
      at('2026-09-29T12:00:00.000Z'),
    );

    expect(() => validateDiaryEntry({ ...draft, periodKey: 'month:2026-08-01' })).toThrow();
    expect(() => validateDiaryEntry({ ...draft, promptVersion: 2 as 1 })).toThrow();
    expect(() =>
      validateDiaryEntry({
        ...draft,
        payload: {
          productivity: 5,
          energy: 5,
          mood: 5,
          overall: 5,
          worldBetter: null,
          energyReflection: null,
          tomorrowReflection: null,
          note: null,
        },
      }),
    ).toThrow();
  });
});
