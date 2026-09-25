import { describe, expect, it } from 'vitest';
import { EntityId, LifeAction, LifeActionTitle } from '../index';
import { occurrenceSlots, validateRule, type RecurrenceRule } from './RecurrenceRule';

const rule: RecurrenceRule = {
  id: 'rule:one',
  title: 'Практика',
  goalId: null,
  priority: null,
  startDate: '2026-09-14',
  endDate: null,
  maxCompletions: null,
  paused: false,
  pauseUntil: null,
  schedule: { kind: 'daily' },
  revision: 1,
  effectiveFrom: '2026-09-14',
  version: 1,
  schemaVersion: 1,
  updatedAt: '2026-09-14T10:00:00.000Z',
};

describe('recurring slots', () => {
  const weekdayRule: RecurrenceRule = {
    ...rule,
    id: 'rule-1',
    title: 'Тренировка',
    schedule: { kind: 'weekdays', weekdays: [1, 3, 5] },
    updatedAt: '2026-09-14T00:00:00Z',
  };
  it('materializes selected weekdays with stable identity and a bounded window', () => {
    const slots = occurrenceSlots(weekdayRule, '2026-09-14', '2026-09-20', []);
    expect(slots.map((s) => s.date)).toEqual(['2026-09-14', '2026-09-16', '2026-09-18']);
    expect(occurrenceSlots(weekdayRule, '2026-09-14', '2026-09-20', [])).toEqual(slots);
    expect(() => occurrenceSlots(weekdayRule, '2026-09-14', '2027-09-14', [])).toThrow();
  });
  it('honors pause, resume date, end and completion limit', () => {
    expect(
      occurrenceSlots({ ...weekdayRule, paused: true }, '2026-09-14', '2026-09-20', []),
    ).toEqual([]);
    expect(
      occurrenceSlots(
        { ...weekdayRule, paused: true, pauseUntil: '2026-09-17' },
        '2026-09-14',
        '2026-09-20',
        [],
      ).map((s) => s.date),
    ).toEqual(['2026-09-18']);
    expect(
      occurrenceSlots({ ...weekdayRule, endDate: '2026-09-16' }, '2026-09-14', '2026-09-20', []),
    ).toHaveLength(2);
    expect(
      occurrenceSlots({ ...weekdayRule, maxCompletions: 1 }, '2026-09-14', '2026-09-20', [
        { key: 'done', date: '2026-09-14' },
      ]),
    ).toEqual([]);
  });
  it('calculates interval from actual completion and generates one next slot', () => {
    const interval = { ...weekdayRule, schedule: { kind: 'interval' as const, days: 3 } };
    expect(
      occurrenceSlots(interval, '2026-09-14', '2026-09-27', [
        { key: 'done', date: '2026-09-18' },
      ]).map((s) => s.date),
    ).toEqual(['2026-09-21']);
  });
});

describe('recurrence trash lifecycle', () => {
  it('defaults legacy rules to active generation zero', () => {
    expect(validateRule(rule)).toMatchObject({
      removedAt: null,
      lastRemovedAt: null,
      restoredFromTrashAt: null,
      purgedAt: null,
      restorationGeneration: 0,
    });
  });

  it.each(['lastRemovedAt', 'restoredFromTrashAt', 'purgedAt'] as const)(
    'rejects an invalid %s timestamp',
    (field) => {
      expect(() => validateRule({ ...rule, [field]: 'invalid' })).toThrow();
    },
  );

  it.each([-1, 0.5, NaN, Infinity])('rejects generation %s', (restorationGeneration) => {
    expect(() => validateRule({ ...rule, restorationGeneration })).toThrow();
  });

  it.each([undefined, 0])('keeps legacy identities for generation %s', (restorationGeneration) => {
    const legacyRule =
      restorationGeneration === undefined ? rule : { ...rule, restorationGeneration };
    expect(occurrenceSlots(legacyRule, '2026-09-14', '2026-09-14', [])).toEqual([
      { id: 'occurrence:rule%3Aone:2026-09-14', slot: '2026-09-14', date: '2026-09-14' },
    ]);
  });

  it.each([
    { schedule: { kind: 'daily' } as const, slot: '2026-09-14' },
    { schedule: { kind: 'interval', days: 2 } as const, slot: 'first' },
    { schedule: { kind: 'count' } as const, slot: 'first' },
  ])('separates restored $schedule.kind identities', ({ schedule, slot }) => {
    expect(
      occurrenceSlots(
        { ...rule, schedule, maxCompletions: 5, restorationGeneration: 2 },
        '2026-09-14',
        '2026-09-14',
        [],
      ),
    ).toEqual([{ id: `occurrence:rule%3Aone:generation:2:${slot}`, slot, date: '2026-09-14' }]);
  });

  it('never materializes a purged rule even without a removed marker', () => {
    expect(
      occurrenceSlots(
        { ...rule, purgedAt: '2026-09-14T10:00:00.000Z' },
        '2026-09-14',
        '2026-09-14',
        [],
      ),
    ).toEqual([]);
  });

  it.each([-1, 0.5, NaN])('rejects invalid occurrence generation %s', (restorationGeneration) => {
    const action = LifeAction.createDraft({
      id: EntityId.create('action'),
      title: LifeActionTitle.create('Практика'),
      createdAt: new Date('2026-09-14T10:00:00Z'),
      eventId: EntityId.create('create'),
    });
    expect(() =>
      action.setPlanningMetadata({
        occurrence: {
          ruleId: rule.id,
          slot: 'first',
          ruleRevision: 1,
          originalDate: '2026-09-14',
          restorationGeneration,
        },
      }),
    ).toThrow();
  });
});
