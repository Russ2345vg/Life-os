import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';
import { DomainError } from '../../shared/errors/DomainError';
import { RecurringActions } from '../planner/RecurringActions';
import type { PlanningRepository, PlanningState } from '../ports/PlanningRepository';
import type { TrashRepository } from './TrashRepository';
import type { TrashDependencyPolicy } from './TrashDependencyPolicy';
import { MoveGoalToTrash } from './MoveGoalToTrash';
import { MoveLifeActionToTrash } from './MoveLifeActionToTrash';
import { RestoreTrashItem } from './RestoreTrashItem';

const createdAt = new Date('2026-09-01T08:00:00Z');
const now = new Date('2026-09-25T08:00:00Z');

function fixture() {
  const state: PlanningState = {
    goals: [Goal.create({ id: EntityId.create('goal'), title: 'Goal', now: createdAt })],
    actions: [
      LifeAction.createDraft({
        id: EntityId.create('action'),
        title: LifeActionTitle.create('Action'),
        createdAt,
        eventId: EntityId.create('created'),
        plannedDate: DayDate.create('2026-09-28'),
      }),
    ],
    rules: [],
    periods: [],
    memberships: [],
    decisions: [],
    links: [],
    contributions: [],
    legacyFocus: [],
    journal: [],
  };
  const repository: TrashRepository = {
    findGoalIncludingDeleted: async (id) => state.goals.find((g) => g.id.equals(id)) ?? null,
    findActionIncludingDeleted: async (id) => state.actions.find((a) => a.id.equals(id)) ?? null,
    findSeriesIncludingRemoved: async (id) => state.rules.find((r) => r.id === id) ?? null,
    listDeletedGoals: async () => state.goals.filter((g) => g.isDeleted()),
    listDeletedActions: async () => state.actions.filter((a) => a.isDeleted()),
    listRemovedSeries: async () => state.rules.filter((r) => r.removedAt != null),
  };
  let goalWrites = 0;
  let actionWrites = 0;
  let rejectGoalWrite = false;
  let blockMove = false;
  let blockRestore = false;
  const checks: string[] = [];
  const policy: TrashDependencyPolicy = {
    async assertCanMove(type, id) {
      checks.push(`move:${type}:${id}`);
      if (blockMove) throw new DomainError('sync.delete_blocked', 'Dependent record');
    },
    async assertCanRestore(type, id) {
      checks.push(`restore:${type}:${id}`);
      if (blockRestore) throw new DomainError('trash.relationship_conflict', 'Missing target');
    },
  };
  const goalWriter = {
    async updateIfVersionMatches(goal: Goal, expectedVersion: number) {
      if (rejectGoalWrite) return false;
      const index = state.goals.findIndex(
        (g) => g.id.equals(goal.id) && g.version === expectedVersion,
      );
      if (index < 0) return false;
      state.goals[index] = goal;
      goalWrites++;
      return true;
    },
  };
  const actionWriter = {
    async save(action: LifeAction) {
      state.actions[state.actions.findIndex((a) => a.id.equals(action.id))] = action;
      actionWrites++;
    },
  };
  const clock = { now: () => now };
  const planning: PlanningRepository = {
    read: async () => state,
    change: async (work) => work(state),
  };
  let sequence = 0;
  const recurring = new RecurringActions(
    planning,
    clock,
    { generate: () => EntityId.create(`event-${++sequence}`) },
    { getCurrentDate: () => DayDate.create('2026-09-25') },
  );
  return {
    state,
    checks,
    recurring,
    moveGoal: new MoveGoalToTrash(repository, goalWriter, policy, clock),
    moveAction: new MoveLifeActionToTrash(repository, actionWriter, policy, clock),
    restore: new RestoreTrashItem(repository, goalWriter, actionWriter, recurring, policy, clock),
    get goalWrites() {
      return goalWrites;
    },
    get actionWrites() {
      return actionWrites;
    },
    blockMove: () => {
      blockMove = true;
    },
    blockRestore: () => {
      blockRestore = true;
    },
    rejectGoalWrite: () => {
      rejectGoalWrite = true;
    },
  };
}

describe('Trash commands', () => {
  it('moves a goal once and replays its committed receipt without another policy check or write', async () => {
    const f = fixture();
    expect(await f.moveGoal.execute('goal')).toEqual({ type: 'goal', id: 'goal' });
    f.blockMove();
    expect(await f.moveGoal.execute('goal')).toEqual({ type: 'goal', id: 'goal' });
    expect(f.state.goals[0]!.deletedAt).toEqual(now);
    expect(f.state.goals[0]!.version).toBe(2);
    expect(f.goalWrites).toBe(1);
    expect(f.checks).toEqual(['move:goal:goal']);
  });

  it('moves an action once and preserves its status and plan', async () => {
    const f = fixture();
    expect(await f.moveAction.execute('action')).toEqual({ type: 'action', id: 'action' });
    f.blockMove();
    await f.moveAction.execute('action');
    expect(f.state.actions[0]!.deletedAt).toEqual(now);
    expect(f.state.actions[0]!.status).toBe('draft');
    expect(f.state.actions[0]!.plannedDate?.toString()).toBe('2026-09-28');
    expect(f.state.actions[0]!.version).toBe(2);
    expect(f.actionWrites).toBe(1);
  });

  it.each(['goal', 'action'] as const)(
    'keeps %s active when dependency policy blocks deletion',
    async (type) => {
      const f = fixture();
      f.blockMove();
      await expect(
        (type === 'goal' ? f.moveGoal : f.moveAction).execute(type),
      ).rejects.toMatchObject({ code: 'sync.delete_blocked' });
      expect(f.state.goals[0]!.isDeleted()).toBe(false);
      expect(f.state.actions[0]!.isDeleted()).toBe(false);
      expect(f.goalWrites + f.actionWrites).toBe(0);
    },
  );

  it('rejects recurring occurrences as standalone items for both move and restore', async () => {
    const f = fixture();
    const action = f.state.actions[0]!;
    action.setPlanningMetadata({
      occurrence: { ruleId: 'series', slot: 'slot', ruleRevision: 1, originalDate: '2026-09-28' },
    });
    await expect(f.moveAction.execute('action')).rejects.toMatchObject({
      code: 'trash.recurring_occurrence',
    });
    action.softDelete(now);
    await expect(f.restore.execute({ type: 'action', id: 'action' })).rejects.toMatchObject({
      code: 'trash.recurring_occurrence',
    });
    expect(f.actionWrites).toBe(0);
  });

  it('reports missing move targets and missing/wrong-type restore targets', async () => {
    const f = fixture();
    await expect(f.moveGoal.execute('missing')).rejects.toMatchObject({ code: 'goal.not_found' });
    await expect(f.moveAction.execute('missing')).rejects.toMatchObject({
      code: 'life_action.not_found',
    });
    await expect(f.restore.execute({ type: 'goal', id: 'action' })).rejects.toMatchObject({
      code: 'trash.expired',
    });
    await expect(f.restore.execute({ type: 'action', id: 'goal' })).rejects.toMatchObject({
      code: 'trash.expired',
    });
    await expect(f.restore.execute({ type: 'series', id: 'missing' })).rejects.toMatchObject({
      code: 'trash.expired',
    });
    await expect(
      f.restore.execute({ type: 'unsupported' as 'goal', id: 'goal' }),
    ).rejects.toMatchObject({ code: 'trash.invalid_type' });
  });

  it.each(['goal', 'action'] as const)(
    'restores %s with the same identity and safely replays restore',
    async (type) => {
      const f = fixture();
      await (type === 'goal' ? f.moveGoal : f.moveAction).execute(type);
      const result = await f.restore.execute({ type, id: type });
      expect(result.type).toBe(type);
      expect(result.entity.id.toString()).toBe(type);
      if (result.type !== 'series') expect(result.entity.isDeleted()).toBe(false);
      f.blockRestore();
      const replay = await f.restore.execute({ type, id: type });
      expect(replay.entity.version).toBe(3);
      expect(f.goalWrites + f.actionWrites).toBe(2);
      expect(f.checks).toEqual([`move:${type}:${type}`, `restore:${type}:${type}`]);
      expect(f.state.actions[0]!.plannedDate?.toString()).toBe('2026-09-28');
    },
  );

  it.each(['goal', 'action'] as const)(
    'keeps %s deleted if a relationship target prevents restore',
    async (type) => {
      const f = fixture();
      await (type === 'goal' ? f.moveGoal : f.moveAction).execute(type);
      f.blockRestore();
      await expect(f.restore.execute({ type, id: type })).rejects.toMatchObject({
        code: 'trash.relationship_conflict',
      });
      expect((type === 'goal' ? f.state.goals[0]! : f.state.actions[0]!).isDeleted()).toBe(true);
      expect(f.goalWrites + f.actionWrites).toBe(1);
    },
  );

  it('does not report a successful move when a concurrent goal update wins', async () => {
    const f = fixture();
    f.rejectGoalWrite();
    await expect(f.moveGoal.execute('goal')).rejects.toMatchObject({
      code: 'goal.version_conflict',
    });
    expect(f.state.goals[0]!.isDeleted()).toBe(false);
  });

  it('does not report a successful restore when a concurrent goal update wins', async () => {
    const f = fixture();
    await f.moveGoal.execute('goal');
    f.rejectGoalWrite();
    await expect(f.restore.execute({ type: 'goal', id: 'goal' })).rejects.toMatchObject({
      code: 'goal.version_conflict',
    });
    expect(f.state.goals[0]!.isDeleted()).toBe(true);
  });

  it('restores a series through RecurringActions once and returns the current generation on replay', async () => {
    const f = fixture();
    f.state.rules.push(series());
    const restored = await f.restore.execute({ type: 'series', id: 'series' });
    expect(restored.type).toBe('series');
    if (restored.type !== 'series') throw new Error('Wrong result');
    expect(restored.entity).toMatchObject({
      removedAt: null,
      restorationGeneration: 1,
      effectiveFrom: '2026-09-25',
    });
    f.blockRestore();
    const replay = await f.restore.execute({ type: 'series', id: 'series' });
    expect(replay.entity.version).toBe(3);
    expect(f.state.journal).toHaveLength(1);
    expect(f.checks).toEqual(['restore:series:series']);
  });

  it('blocks a series relationship conflict before restoring and rejects a purged series', async () => {
    const f = fixture();
    f.state.rules.push(series());
    f.blockRestore();
    await expect(f.restore.execute({ type: 'series', id: 'series' })).rejects.toMatchObject({
      code: 'trash.relationship_conflict',
    });
    expect(f.state.rules[0]!.removedAt).not.toBeNull();
    expect(f.state.journal).toHaveLength(0);
    f.state.rules[0] = { ...f.state.rules[0]!, purgedAt: now.toISOString() };
    await expect(f.restore.execute({ type: 'series', id: 'series' })).rejects.toMatchObject({
      code: 'trash.expired',
    });
  });
});

function series(): RecurrenceRule {
  return {
    id: 'series',
    title: 'Series',
    goalId: null,
    priority: null,
    startDate: '2026-09-01',
    endDate: null,
    maxCompletions: null,
    paused: true,
    pauseUntil: null,
    removedAt: '2026-09-20T08:00:00Z',
    schedule: { kind: 'daily' },
    revision: 1,
    effectiveFrom: '2026-09-01',
    version: 2,
    schemaVersion: 1,
    updatedAt: '2026-09-20T08:00:00Z',
  };
}
