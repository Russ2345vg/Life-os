import { describe, expect, it } from 'vitest';
import {
  DayDate,
  Direction,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
  Sphere,
} from '../../domain';
import type { ConnectionReadRepository } from '../ports/ConnectionReadRepository';
import { GetConnections } from './GetConnections';

const now = new Date('2026-10-05T10:00:00.000Z');
const sphere = Sphere.create({ id: EntityId.create('sphere-1'), name: 'Развитие', now });
const direction = Direction.create({
  id: EntityId.create('direction-1'),
  name: 'Впечатления',
  sphereId: sphere.id,
  now,
});
const goal = Goal.create({
  id: EntityId.create('goal-1'),
  title: 'Копить на поездку',
  sphereId: sphere.id,
  directionId: direction.id,
  now,
});
const action = LifeAction.createDraft({
  id: EntityId.create('action-1'),
  eventId: EntityId.create('event-1'),
  title: LifeActionTitle.create('Сравнить маршрут'),
  goalId: goal.id,
  plannedDate: DayDate.create('2026-10-07'),
  createdAt: now,
});

function fixture(
  options: {
    missingGoal?: boolean;
    contribution?: boolean;
    routine?: boolean;
    deletedSource?: boolean;
    manyActions?: boolean;
  } = {},
) {
  const deletedAction = LifeAction.createDraft({
    id: EntityId.create('deleted-action'),
    eventId: EntityId.create('deleted-event'),
    title: LifeActionTitle.create('Удалённое действие'),
    goalId: goal.id,
    createdAt: now,
  });
  deletedAction.softDelete(now);
  const extraActions = options.manyActions
    ? Array.from({ length: 31 }, (_, index) =>
        LifeAction.createDraft({
          id: EntityId.create(
            index === 0
              ? 'action-A'
              : index === 1
                ? 'action-a'
                : `action-${String(index).padStart(2, '0')}`,
          ),
          eventId: EntityId.create(`extra-event-${index}`),
          title: LifeActionTitle.create(`Действие ${index}`),
          goalId: goal.id,
          createdAt: now,
        }),
      )
    : [];
  const sourceId = options.deletedSource ? 'deleted-action' : 'action-1';
  const lookup: ConnectionReadRepository = {
    readPlanning: async () => ({
      goals: options.missingGoal ? [] : [goal],
      actions: options.deletedSource
        ? [action, deletedAction, ...extraActions]
        : [action, ...extraActions],
      links: options.contribution
        ? [
            {
              schemaVersion: 1,
              id: 'link-1',
              version: 1,
              updatedAt: now.toISOString(),
              sourceType: 'action',
              sourceId,
              goalId: 'goal-1',
              mode: 'fixed',
              amount: 2,
              effectiveFrom: '2026-10-05',
              removed: false,
            },
          ]
        : [],
      contributions: options.contribution
        ? [
            {
              schemaVersion: 1,
              id: 'fact-1',
              version: 1,
              updatedAt: now.toISOString(),
              goalId: 'goal-1',
              actionId: sourceId,
              completionKey: 'completion-1',
              linkId: 'link-1',
              source: 'completion',
              amount: 2,
              effectiveDate: '2026-10-05',
              occurredAt: now.toISOString(),
              voided: false,
              reason: 'Выполнено',
            },
          ]
        : [],
      rules: [],
    }),
    getWalk: async () => ({
      id: 'walk-1',
      date: '2026-10-05',
      title: 'Как выбрать маршрут?',
      sphereId: 'sphere-1',
      linkedEntity: options.deletedSource
        ? { type: 'lifeAction', id: 'deleted-action' }
        : { type: 'goal', id: 'goal-1' },
      deletedAt: null,
    }),
    getMemory: async () => ({
      id: 'memory-1',
      title: 'Первый шаг',
      occurredOn: '2026-10-05',
      context: {
        sphereId: 'sphere-1',
        sphereTitle: 'Развитие',
        directionId: 'direction-1',
        directionTitle: 'Впечатления',
        goalId: 'goal-1',
        goalTitle: 'Копить на поездку',
      },
      diarySource: {
        entryId: 'diary-1',
        kind: 'day',
        periodStart: '2026-10-05',
        field: 'note',
        version: 1,
      },
      deletedAt: null,
    }),
    listWalksBySource: async (source) => ({
      items:
        source.type === 'goal' && source.id === 'goal-1'
          ? [
              {
                id: 'walk-1',
                date: '2026-10-05',
                title: 'Как выбрать маршрут?',
                sphereId: 'sphere-1',
                linkedEntity: { type: 'goal', id: 'goal-1' },
                deletedAt: null,
              },
            ]
          : [],
      nextCursor: null,
    }),
    listMemoriesByGoal: async (id) => ({
      items:
        id === 'goal-1'
          ? [
              {
                id: 'memory-1',
                title: 'Первый шаг',
                occurredOn: '2026-10-05',
                context: null,
                diarySource: null,
                deletedAt: null,
              },
            ]
          : [],
      nextCursor: null,
    }),
    listRoutineAssignments: async () =>
      options.routine
        ? [
            {
              id: 'block-1',
              title: 'Утренний ритуал',
              anchorDate: '2026-10-05',
              assignment: 'existingAction',
            },
          ]
        : [],
  };
  return new GetConnections({
    lookup,
    goals: { findById: async () => (options.missingGoal ? null : goal) },
    actions: {
      findById: async (id) => (id.toString() === 'deleted-action' ? deletedAction : action),
    },
    directions: { findById: async () => direction },
    spheres: { findById: async () => sphere },
    diarySource: { sourceStatus: async () => 'missing' as const },
  });
}

describe('GetConnections', () => {
  it('shows only saved goal relationships and explains each source', async () => {
    const result = await fixture().read({ kind: 'goal', id: 'goal-1' });
    expect(result.title).toBe('Копить на поездку');
    expect(result.rows.map((row) => [row.kind, row.title, row.reason])).toEqual([
      ['direction', 'Впечатления', 'Цель принадлежит направлению'],
      ['sphere', 'Развитие', 'Контекст направления'],
      ['lifeAction', 'Сравнить маршрут', 'Действие относится к цели'],
      ['walk', 'Как выбрать маршрут?', 'Запущена из этой цели'],
      ['memory', 'Первый шаг', 'Цель указана во воспоминании'],
    ]);
    expect(result.rows.every((row) => row.availability === 'available')).toBe(true);
  });

  it('does not treat an action goal context as measurable contribution', async () => {
    const result = await fixture().read({ kind: 'lifeAction', id: 'action-1' });
    expect(result.rows).toContainEqual(
      expect.objectContaining({ kind: 'goal', reason: 'Действие относится к цели' }),
    );
    expect(result.rows).toContainEqual(
      expect.objectContaining({ kind: 'plan', title: '7 октября 2026', target: null }),
    );
    expect(result.rows.some((row) => row.kind === 'contribution')).toBe(false);
  });

  it('separates an explicit progress link and confirmed contribution from ordinary context', async () => {
    const result = await fixture({ contribution: true, routine: true }).read({
      kind: 'lifeAction',
      id: 'action-1',
    });
    expect(result.rows).toContainEqual(
      expect.objectContaining({
        kind: 'contribution',
        reason: 'Явная связь с измеряемым прогрессом',
      }),
    );
    expect(result.rows).toContainEqual(
      expect.objectContaining({
        kind: 'contribution',
        title: 'Вклад: 2',
        reason: 'Подтверждённый вклад в цель',
      }),
    );
    expect(result.rows).toContainEqual(
      expect.objectContaining({ kind: 'routine', title: 'Утренний ритуал', target: null }),
    );
  });

  it('keeps a saved missing source visible without a false destination', async () => {
    const actionResult = await fixture({ missingGoal: true }).read({
      kind: 'lifeAction',
      id: 'action-1',
    });
    expect(actionResult.rows).toContainEqual(
      expect.objectContaining({
        kind: 'goal',
        availability: 'missing',
        target: null,
      }),
    );
    const memoryResult = await fixture({ missingGoal: true }).read({
      kind: 'memory',
      id: 'memory-1',
    });
    expect(memoryResult.rows).toContainEqual(
      expect.objectContaining({
        kind: 'goal',
        title: 'Копить на поездку',
        availability: 'missing',
        target: null,
      }),
    );
    expect(memoryResult.rows).toContainEqual(
      expect.objectContaining({ kind: 'diary', availability: 'missing', target: null }),
    );
  });

  it('keeps a deleted contribution source visible but does not link to its tombstone', async () => {
    const query = fixture({ contribution: true, deletedSource: true });
    const result = await query.read({
      kind: 'goal',
      id: 'goal-1',
    });
    const sources = result.rows.filter(
      (item) => item.key === 'link:link-1' || item.key === 'fact:fact-1',
    );
    expect(sources).toHaveLength(2);
    expect(sources.every((item) => item.availability === 'missing' && item.target === null)).toBe(
      true,
    );
    const walk = await query.read({ kind: 'walk', id: 'walk-1' });
    expect(walk.rows).toContainEqual(
      expect.objectContaining({ kind: 'lifeAction', availability: 'missing', target: null }),
    );
  });

  it('paginates action IDs in one binary order across mixed case', async () => {
    const query = fixture({ manyActions: true });
    const first = await query.read({ kind: 'goal', id: 'goal-1' });
    const next = await query.more(
      { kind: 'goal', id: 'goal-1' },
      'actions',
      first.cursors.actions!,
    );
    const IDs = [...first.rows, ...next.items]
      .filter((item) => item.kind === 'lifeAction')
      .map((item) => (item.target?.kind === 'lifeAction' ? item.target.id : null));
    const expected = [
      'action-1',
      ...Array.from({ length: 31 }, (_, index) =>
        index === 0
          ? 'action-A'
          : index === 1
            ? 'action-a'
            : `action-${String(index).padStart(2, '0')}`,
      ),
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(IDs).toEqual(expected);
  });
});
