import { describe, expect, it } from 'vitest';
import { occurrenceSlots, type RecurrenceRule } from './RecurrenceRule';
const rule: RecurrenceRule = {
  id: 'rule-1',
  title: 'Тренировка',
  goalId: null,
  priority: null,
  startDate: '2026-09-14',
  endDate: null,
  maxCompletions: null,
  paused: false,
  pauseUntil: null,
  schedule: { kind: 'weekdays', weekdays: [1, 3, 5] },
  revision: 1,
  effectiveFrom: '2026-09-14',
  version: 1,
  schemaVersion: 1,
  updatedAt: '2026-09-14T00:00:00Z',
};
describe('recurring slots', () => {
  it('materializes selected weekdays with stable identity and a bounded window', () => {
    const slots = occurrenceSlots(rule, '2026-09-14', '2026-09-20', []);
    expect(slots.map((s) => s.date)).toEqual(['2026-09-14', '2026-09-16', '2026-09-18']);
    expect(occurrenceSlots(rule, '2026-09-14', '2026-09-20', [])).toEqual(slots);
    expect(() => occurrenceSlots(rule, '2026-09-14', '2027-09-14', [])).toThrow();
  });
  it('honors pause, resume date, end and completion limit', () => {
    expect(occurrenceSlots({ ...rule, paused: true }, '2026-09-14', '2026-09-20', [])).toEqual([]);
    expect(
      occurrenceSlots(
        { ...rule, paused: true, pauseUntil: '2026-09-17' },
        '2026-09-14',
        '2026-09-20',
        [],
      ).map((s) => s.date),
    ).toEqual(['2026-09-18']);
    expect(
      occurrenceSlots({ ...rule, endDate: '2026-09-16' }, '2026-09-14', '2026-09-20', []),
    ).toHaveLength(2);
    expect(
      occurrenceSlots({ ...rule, maxCompletions: 1 }, '2026-09-14', '2026-09-20', [
        { key: 'done', date: '2026-09-14' },
      ]),
    ).toEqual([]);
  });
  it('calculates interval from actual completion and generates one next slot', () => {
    const interval = { ...rule, schedule: { kind: 'interval' as const, days: 3 } };
    expect(
      occurrenceSlots(interval, '2026-09-14', '2026-09-27', [
        { key: 'done', date: '2026-09-18' },
      ]).map((s) => s.date),
    ).toEqual(['2026-09-21']);
  });
});
