import { describe, expect, it } from 'vitest';
import { EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';
import { TrashCatalog } from './TrashCatalog';
import type { TrashRepository } from './TrashRepository';

function fixture() {
  const clock = { now: () => new Date(2026, 8, 25, 23, 30) };
  const goal = Goal.create({
    id: EntityId.create('goal'),
    title: 'Goal',
    now: new Date(2026, 0, 1),
  }).softDelete(new Date(2026, 8, 23, 23, 30));
  const action = LifeAction.createDraft({
    id: EntityId.create('action'),
    title: LifeActionTitle.create('Action'),
    createdAt: new Date(2026, 0, 1),
    eventId: EntityId.create('created'),
  });
  action.softDelete(new Date(2026, 8, 24, 23, 30));
  const series: RecurrenceRule = {
    id: 'series',
    title: 'Series',
    goalId: null,
    priority: null,
    startDate: '2026-09-01',
    endDate: null,
    maxCompletions: null,
    paused: true,
    pauseUntil: null,
    removedAt: clock.now().toISOString(),
    schedule: { kind: 'daily' },
    revision: 1,
    effectiveFrom: '2026-09-01',
    version: 2,
    schemaVersion: 1,
    updatedAt: clock.now().toISOString(),
  };
  const rows = { goals: [goal], actions: [action], series: [series] };
  const repository: TrashRepository = {
    findGoalIncludingDeleted: async () => null,
    findActionIncludingDeleted: async () => null,
    findSeriesIncludingRemoved: async () => null,
    listDeletedGoals: async () => rows.goals,
    listDeletedActions: async () => rows.actions,
    listRemovedSeries: async () => rows.series,
  };
  return { rows, catalog: new TrashCatalog(repository) };
}

describe('TrashCatalog', () => {
  it('combines authoritative records in descending deletion order with 30 local calendar days', async () => {
    const { catalog } = fixture();
    expect(await catalog.list('all')).toEqual([
      {
        type: 'series',
        id: 'series',
        title: 'Series',
        deletedAt: new Date(2026, 8, 25, 23, 30),
        purgeAt: '2026-10-25',
      },
      {
        type: 'action',
        id: 'action',
        title: 'Action',
        deletedAt: new Date(2026, 8, 24, 23, 30),
        purgeAt: '2026-10-24',
      },
      {
        type: 'goal',
        id: 'goal',
        title: 'Goal',
        deletedAt: new Date(2026, 8, 23, 23, 30),
        purgeAt: '2026-10-23',
      },
    ]);
  });

  it.each([
    ['goals', 'goal'],
    ['actions', 'action'],
    ['series', 'series'],
  ] as const)('filters %s', async (filter, type) => {
    expect((await fixture().catalog.list(filter)).map((row) => row.type)).toEqual([type]);
  });

  it.each([
    [new Date(2026, 11, 15, 0, 30), '2027-01-14'],
    [new Date(2028, 1, 1, 23, 30), '2028-03-02'],
    [new Date(2026, 2, 1, 23, 30), '2026-03-31'],
    [new Date(2026, 9, 15, 0, 30), '2026-11-14'],
  ])(
    'uses local calendar dates across month/year and daylight-saving boundaries: %s',
    async (deletedAt, expected) => {
      const { rows, catalog } = fixture();
      rows.goals = [
        Goal.create({
          id: EntityId.create('boundary'),
          title: 'Boundary',
          now: new Date(2026, 0, 1),
        }).softDelete(deletedAt),
      ];
      expect((await catalog.list('goals'))[0]!.purgeAt).toBe(expected);
    },
  );

  it('excludes active records, occurrences and purged series even if raw reads include them', async () => {
    const { rows, catalog } = fixture();
    rows.goals = [rows.goals[0]!.restoreFromTrash(new Date(2026, 8, 26))];
    rows.actions[0]!.setPlanningMetadata({
      occurrence: { ruleId: 'series', slot: 'slot', ruleRevision: 1, originalDate: '2026-09-24' },
    });
    rows.series.push({ ...rows.series[0]!, id: 'active', removedAt: null, paused: false });
    rows.series[0] = { ...rows.series[0]!, purgedAt: '2026-09-26T08:00:00Z' };
    expect(await catalog.list('all')).toEqual([]);
  });

  it('reloads repository records rather than retaining a copied trash store', async () => {
    const { rows, catalog } = fixture();
    expect(await catalog.list('all')).toHaveLength(3);
    rows.goals = [];
    rows.actions = [];
    rows.series = [];
    expect(await catalog.list('all')).toEqual([]);
  });
});
