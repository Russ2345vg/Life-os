import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  PauseInterval,
  WALK_IMPACT,
  WALK_INTENT,
  WALK_TYPE,
} from '../../domain';
import { historyWalk } from '../../test/helpers/WalkHistoryFixtures';
import * as history from './WalkHistoryPresentation';
import * as presentation from './walkPresentation';

describe('WALK-11 factual presentation', () => {
  it.each([
    [WALK_INTENT.free, 'Свободная'],
    [WALK_INTENT.recovery, 'Восстановительная'],
    [WALK_INTENT.reflection, 'Размышление'],
    [null, 'Физическая'],
  ] as const)('labels %s using its stored intent, or the real legacy type', (intent, expected) => {
    expect(history.walkHistoryLabel).toBeTypeOf('function');
    expect(
      history.walkHistoryLabel(historyWalk('label', { intent, type: WALK_TYPE.physical })),
    ).toBe(expected);
  });

  it('formats the existing actual duration with pauses removed, not the planned target', () => {
    expect(presentation.formatActualDuration).toBeTypeOf('function');
    const walk = historyWalk('paused', {
      mode: 'timer',
      timerTargetMinutes: 40,
      pauseIntervals: [
        PauseInterval.create(new Date('2026-08-26T08:10:00Z'), new Date('2026-08-26T08:20:00Z')),
      ],
    });
    expect(presentation.formatActualDuration(walk.actualDurationMilliseconds)).toBe('20 мин');
  });
  it.each([
    [0, '0 сек'],
    [59000, '59 сек'],
    [3_900_000, '1 ч 5 мин'],
    [null, '—'],
  ] as const)('formats %s without rounding invented minutes', (milliseconds, expected) => {
    expect(presentation.formatActualDuration).toBeTypeOf('function');
    expect(presentation.formatActualDuration(milliseconds)).toBe(expected);
  });

  it('presents all before/after values as facts', () => {
    expect(history.walkHistoryStates).toBeTypeOf('function');
    expect(
      history.walkHistoryStates(
        historyWalk('states', {
          beforeState: { energy: 4, tension: 7, clarity: 5 },
          afterState: { energy: 6, tension: 4, clarity: 7 },
        }),
      ),
    ).toEqual([
      { label: 'Энергия', before: '4', after: '6' },
      { label: 'Напряжение', before: '7', after: '4' },
      { label: 'Ясность', before: '5', after: '7' },
    ]);
  });
  it('does not invent missing before values or lose valid zero after values', () => {
    expect(history.walkHistoryStates).toBeTypeOf('function');
    expect(
      history.walkHistoryStates(
        historyWalk('missing-before', {
          afterState: { energy: 0, tension: 0, clarity: 0 },
        }),
      ),
    ).toEqual([
      { label: 'Энергия', before: 'Не отмечено', after: '0' },
      { label: 'Напряжение', before: 'Не отмечено', after: '0' },
      { label: 'Ясность', before: 'Не отмечено', after: '0' },
    ]);
  });
  it('marks missing after-state without copying the before-state', () => {
    expect(history.walkHistoryStates).toBeTypeOf('function');
    expect(
      history.walkHistoryStates(
        historyWalk('missing-after', {
          beforeState: { energy: 4, tension: 7, clarity: 5 },
        }),
      )[1],
    ).toEqual({ label: 'Напряжение', before: '7', after: 'Не отмечено' });
  });

  it('uses a recorded reflection result in the compact row', () => {
    expect(history.walkHistorySummary).toBeTypeOf('function');
    expect(
      history.walkHistorySummary(
        historyWalk('result', {
          intent: WALK_INTENT.reflection,
          result: 'Определён следующий приоритет',
          impact: WALK_IMPACT.better,
        }),
      ),
    ).toBe('Определён следующий приоритет');
  });
  it('shows recovery tension as raw before → after, not effectiveness', () => {
    expect(history.walkHistorySummary).toBeTypeOf('function');
    expect(
      history.walkHistorySummary(
        historyWalk('recovery', {
          intent: WALK_INTENT.recovery,
          beforeState: { energy: 4, tension: 7, clarity: 5 },
          afterState: { energy: 6, tension: 4, clarity: 7 },
          impact: WALK_IMPACT.better,
        }),
      ),
    ).toBe('Напряжение 7 → 4');
  });
  it('uses a calm empty result even when a walk has before-state', () => {
    expect(history.walkHistorySummary).toBeTypeOf('function');
    expect(
      history.walkHistorySummary(
        historyWalk('no-outcome', {
          beforeState: { energy: 4, tension: 7, clarity: 5 },
        }),
      ),
    ).toBe('Без итога');
  });

  it.each([
    [0, 0],
    [1, 1],
    [21, 20],
    [100, 20],
  ] as const)('bounds %i walks to %i rendered rows', (count, expected) => {
    expect(history.walkHistoryPage).toBeTypeOf('function');
    const walks = Array.from({ length: count }, (_, i) => historyWalk(`walk-${i}`));
    expect(history.walkHistoryPage(walks, 0).items).toHaveLength(expected);
  });
  it('clamps a stale page after filtering and selects the final page without repeating entries', () => {
    expect(history.walkHistoryPage).toBeTypeOf('function');
    const walks = Array.from({ length: 21 }, (_, i) => historyWalk(`walk-${i}`));
    const page = history.walkHistoryPage(walks, 8);
    expect(page.page).toBe(1);
    expect(page.pages).toBe(2);
    expect(page.items.map((walk) => walk.id.toString())).toEqual(['walk-20']);
    expect(history.walkHistoryPage(walks, -1).items[0]?.id.toString()).toBe('walk-0');
  });

  it('opens the original Routine occurrence rather than the next Reentry step', () => {
    expect(history.walkHistoryRoutineDestination).toBeTypeOf('function');
    const source = {
      routineBlockId: EntityId.create('source'),
      occurrenceDate: DayDate.create('2026-08-25'),
      effectiveDate: DayDate.create('2026-08-26'),
    };
    const walk = historyWalk('routine', {
      linkedEntity: { type: 'routine', id: source.routineBlockId },
      returnContext: {
        origin: 'routine',
        entity: { type: 'routine', id: source.routineBlockId },
        nextStep: null,
        routineContext: {
          source,
          sourceTitle: 'Прогулка',
          next: { ...source, routineBlockId: EntityId.create('next') },
        },
      },
    });
    expect(history.walkHistoryRoutineDestination(walk)).toEqual({
      date: DayDate.create('2026-08-26'),
      focus: source,
    });
  });
});
