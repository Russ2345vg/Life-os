import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, EntityId, JOURNAL_ENTRY_TYPE, LifeActionTitle } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock } from '../../test/helpers/Fakes';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { createLifeOsApplication } from './createLifeOsApplication';
import {
  changePlannerGoalStatus,
  linkPlannerGoalDirection,
} from '../../presentation/planner-v2/plannerGoalCommands';
import {
  completePlannerAction,
  planPlannerAction,
} from '../../presentation/planner-v2/plannerTodayCommands';
import { buildPlannerViews } from '../../presentation/planner-v2/plannerViewsModel';

const now = new Date('2026-09-13T10:00:00Z');
const date = DayDate.create('2026-09-13');
const later = DayDate.create('2026-09-20');

describe('V2 views use the same persisted entities', () => {
  it('changes Kanban columns and tree links on the same records, survives reload, and rejects stale Goal edits', async () => {
    const factory = new IDBFactory();
    const db = new LifeOsIndexedDb(factory);
    const app = await createLifeOsApplication({ database: db, clock: new FakeClock(now) });
    const createdGoal = await app.createGoal.execute({ title: 'Одна цель', status: 'active' });
    const createdDirection = await app.createDirection.execute({ name: 'Направление' });
    const createdAction = await app.createLifeActionDraft.execute({
      title: LifeActionTitle.create('Одно действие'),
    });
    if (!createdGoal.ok) throw createdGoal.error;
    if (!createdDirection.ok) throw createdDirection.error;
    if (!createdAction.ok) throw createdAction.error;
    const original = createdGoal.value;
    let goal = await changePlannerGoalStatus(app.updateGoal, original, 'paused');
    expect(goal.id).toEqual(original.id);
    await expect(changePlannerGoalStatus(app.updateGoal, original, 'future')).rejects.toThrow();
    goal = await changePlannerGoalStatus(app.updateGoal, goal, 'achieved');
    expect(goal.stage).toBe('achieved');
    goal = await changePlannerGoalStatus(app.updateGoal, goal, 'active');
    goal = await linkPlannerGoalDirection(
      app.updateGoal,
      goal,
      createdDirection.value.id.toString(),
    );
    await app.setLifeActionGoal.execute({ lifeActionId: createdAction.value.id, goalId: goal.id });
    await planPlannerAction(
      app.setLifeActionPlan,
      createdAction.value.id.toString(),
      later.toString(),
    );
    const view = buildPlannerViews({
      goals: await app.getGoals.execute(),
      actions: await app.plannerCatalog.actions(),
      directions: await app.getDirections.execute(),
      spheres: [],
    });
    expect(view.goalsByStatus.get('active')).toHaveLength(1);
    expect(view.actionsByColumn.get('planned')).toHaveLength(1);
    expect(view.goalsByDirection.get(createdDirection.value.id.toString())).toHaveLength(1);
    expect(view.actionsByGoal.get(goal.id.toString())).toHaveLength(1);
    await completePlannerAction(app.completeLifeAction, createdAction.value.id.toString());
    await completePlannerAction(app.completeLifeAction, createdAction.value.id.toString());
    await app.setLifeActionGoal.execute({ lifeActionId: createdAction.value.id, goalId: null });
    db.close();
    const reopened = new LifeOsIndexedDb(factory);
    try {
      const reloaded = await createLifeOsApplication({
        database: reopened,
        clock: new FakeClock(now),
      });
      expect(await reloaded.getGoals.execute()).toMatchObject([
        { id: original.id, status: 'active', directionId: createdDirection.value.id },
      ]);
      expect(await reloaded.plannerCatalog.actions()).toMatchObject([
        {
          id: createdAction.value.id,
          goalId: null,
          plannedDate: later,
          status: 'completed',
          completedAt: now,
        },
      ]);
      const journal = await reloaded.journalRepository.findByEffectiveDateRange(date, later);
      expect(journal.filter((e) => e.type === JOURNAL_ENTRY_TYPE.actionCompleted)).toHaveLength(1);
    } finally {
      reopened.close();
    }
  });

  it('moves one future Goal to active, then archives the same ID without adding records', async () => {
    const factory = new IDBFactory();
    const db = new LifeOsIndexedDb(factory);
    const app = await createLifeOsApplication({ database: db, clock: new FakeClock(now) });
    const created = await app.createGoal.execute({ title: 'Переносимая цель', status: 'future' });
    if (!created.ok) throw created.error;
    const original = created.value;
    const moved = await changePlannerGoalStatus(
      app.updateGoal,
      original,
      'active',
      app.archiveGoal,
    );
    expect(moved.id).toEqual(original.id);
    expect(moved.status).toBe('active');
    expect(await app.getGoals.execute()).toHaveLength(1);
    await expect(
      changePlannerGoalStatus(app.updateGoal, original, 'paused', app.archiveGoal),
    ).rejects.toThrow();
    const archived = await changePlannerGoalStatus(
      app.updateGoal,
      moved,
      'archived',
      app.archiveGoal,
    );
    expect(archived.id).toEqual(original.id);
    expect(archived.status).toBe('archived');
    await expect(
      changePlannerGoalStatus(app.updateGoal, archived, 'active', app.archiveGoal),
    ).rejects.toThrow();
    db.close();
    const reopened = new LifeOsIndexedDb(factory);
    try {
      const reloaded = await createLifeOsApplication({
        database: reopened,
        clock: new FakeClock(now),
      });
      const goals = await reloaded.getGoals.execute();
      expect(goals).toHaveLength(1);
      expect(goals[0]).toMatchObject({ id: original.id, status: 'archived' });
      expect(
        buildPlannerViews({ goals, actions: [], directions: [], spheres: [] }).goalsByStatus.get(
          'archived',
        ),
      ).toHaveLength(1);
    } finally {
      reopened.close();
    }
  });

  it('leaves a Goal in its original column when the status write fails', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database: db, clock: new FakeClock(now) });
    try {
      const created = await app.createGoal.execute({
        title: 'Остаётся на месте',
        status: 'future',
      });
      if (!created.ok) throw created.error;
      vi.spyOn(app.goalRepository, 'updateIfVersionMatches').mockRejectedValueOnce(
        new Error('Нет доступа к хранилищу'),
      );
      await expect(
        changePlannerGoalStatus(app.updateGoal, created.value, 'active', app.archiveGoal),
      ).rejects.toThrow('Нет доступа к хранилищу');
      const goals = await app.getGoals.execute();
      expect(goals).toHaveLength(1);
      expect(goals[0]).toMatchObject({ id: created.value.id, status: 'future' });
      expect(
        buildPlannerViews({ goals, actions: [], directions: [], spheres: [] }).goalsByStatus.get(
          'future',
        ),
      ).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
      db.close();
    }
  });

  it('rolls back a failed completed-date write and preserves the completion event', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database: db, clock: new FakeClock(now) });
    try {
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Сохранено'),
        plannedDate: date,
      });
      if (!created.ok) throw created.error;
      await completePlannerAction(app.completeLifeAction, created.value.id.toString());
      const read = app.lifeActionRepository.findById.bind(app.lifeActionRepository);
      vi.spyOn(app.lifeActionRepository, 'findById').mockImplementationOnce(async (id) => {
        const stale = await read(id);
        await planPlannerAction(app.setLifeActionPlan, id.toString(), '2026-09-19');
        return stale;
      });
      await expect(
        planPlannerAction(app.setLifeActionPlan, created.value.id.toString(), '2026-09-20'),
      ).rejects.toThrow();
      expect(await read(created.value.id)).toMatchObject({
        plannedDate: DayDate.create('2026-09-19'),
        completedAt: now,
        status: 'completed',
      });
      const journal = await app.journalRepository.findByEffectiveDateRange(date, later);
      expect(journal.filter((e) => e.type === JOURNAL_ENTRY_TYPE.actionCompleted)).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
      db.close();
    }
  });
  it.each(['standalone', 'legacy'] as const)(
    'moves a completed %s action without changing completion or the open main action',
    async (kind) => {
      const factory = new IDBFactory();
      const db = new LifeOsIndexedDb(factory);
      const app = await createLifeOsApplication({ database: db, clock: new FakeClock(now) });
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Закончено'),
        plannedDate: date,
        isNext: true,
      });
      if (!created.ok) throw created.error;
      const action = kind === 'legacy' ? createReadyLifeAction('legacy', date) : created.value;
      if (kind === 'legacy') await app.lifeActionRepository.save(action);
      const completed = await app.completeLifeAction.execute({ lifeActionId: action.id });
      if (!completed.ok) throw completed.error;
      const main = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Главное'),
        plannedDate: later,
        isNext: true,
      });
      if (!main.ok) throw main.error;
      const before = await app.journalRepository.findByEffectiveDateRange(date, later);
      const moved = await app.setLifeActionPlan.execute({
        lifeActionId: action.id,
        plannedDate: later,
      });
      expect(moved).toMatchObject({ ok: true, value: { status: 'completed', completedAt: now } });
      if (!moved.ok) throw moved.error;
      expect(moved.value.id).toEqual(action.id);
      expect(moved.value.plannedDate).toEqual(later);
      expect(moved.value.actualResult).toEqual(completed.value.actualResult);
      await app.completeLifeAction.execute({ lifeActionId: action.id });
      expect(await app.journalRepository.findByEffectiveDateRange(date, later)).toEqual(before);
      expect(before.filter((e) => e.type === JOURNAL_ENTRY_TYPE.actionCompleted)).toHaveLength(1);
      const count = (await app.plannerCatalog.actions()).length;
      db.close();
      const reopened = new LifeOsIndexedDb(factory);
      try {
        const reloaded = await createLifeOsApplication({
          database: reopened,
          clock: new FakeClock(now),
        });
        expect(await reloaded.lifeActionRepository.findById(action.id)).toMatchObject({
          plannedDate: later,
          completedAt: now,
          status: 'completed',
        });
        expect(await reloaded.lifeActionRepository.findById(main.value.id)).toMatchObject({
          isNext: true,
        });
        expect(await reloaded.plannerCatalog.actions()).toHaveLength(count);
      } finally {
        reopened.close();
      }
    },
  );

  it('can remove the planning date of a standalone completion but preserves legacy ready fields', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database: db, clock: new FakeClock(now) });
    try {
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Без даты'),
        plannedDate: date,
      });
      if (!created.ok) throw created.error;
      await app.completeLifeAction.execute({ lifeActionId: created.value.id });
      expect(
        await app.setLifeActionPlan.execute({ lifeActionId: created.value.id, plannedDate: null }),
      ).toMatchObject({ ok: true, value: { plannedDate: null, completedAt: now } });
      const legacy = createReadyLifeAction('legacy', date);
      await app.lifeActionRepository.save(legacy);
      await app.completeLifeAction.execute({ lifeActionId: legacy.id });
      expect(
        await app.setLifeActionPlan.execute({ lifeActionId: legacy.id, plannedDate: null }),
      ).toMatchObject({ ok: false });
      expect(await app.lifeActionRepository.findById(EntityId.create('legacy'))).toMatchObject({
        plannedDate: date,
        completedAt: now,
      });
    } finally {
      db.close();
    }
  });
});
