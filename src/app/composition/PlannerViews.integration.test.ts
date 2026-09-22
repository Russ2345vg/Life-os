import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, LifeActionTitle } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock } from '../../test/helpers/Fakes';
import {
  changePlannerGoalStatus,
  linkPlannerGoalDirection,
} from '../../presentation/planner-v2/plannerGoalCommands';
import {
  completePlannerAction,
  planPlannerAction,
} from '../../presentation/planner-v2/plannerTodayCommands';
import { buildPlannerViews } from '../../presentation/planner-v2/plannerViewsModel';
import { createLifeOsApplication } from './createLifeOsApplication';

const now = new Date('2026-09-13T10:00:00Z');

describe('V2 views use the same persisted entities', () => {
  it('changes Kanban columns and tree links on the same records and survives reload', async () => {
    const factory = new IDBFactory();
    const database = new LifeOsIndexedDb(factory);
    const app = await createLifeOsApplication({ database, clock: new FakeClock(now) });
    const createdGoal = await app.createGoal.execute({ title: 'Одна цель', status: 'active' });
    const createdDirection = await app.balance.createDirection.execute({ name: 'Направление' });
    const createdAction = await app.createLifeActionDraft.execute({
      title: LifeActionTitle.create('Одно действие'),
    });
    if (!createdGoal.ok) throw createdGoal.error;
    if (!createdDirection.ok) throw createdDirection.error;
    if (!createdAction.ok) throw createdAction.error;
    let goal = await changePlannerGoalStatus(app.updateGoal, createdGoal.value, 'paused');
    await expect(
      changePlannerGoalStatus(app.updateGoal, createdGoal.value, 'future'),
    ).rejects.toThrow();
    goal = await changePlannerGoalStatus(app.updateGoal, goal, 'active');
    goal = await linkPlannerGoalDirection(
      app.updateGoal,
      goal,
      createdDirection.value.id.toString(),
    );
    await app.setLifeActionGoal.execute({ lifeActionId: createdAction.value.id, goalId: goal.id });
    await planPlannerAction(app.setLifeActionPlan, createdAction.value.id.toString(), '2026-09-20');
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
    database.close();

    const reopened = new LifeOsIndexedDb(factory);
    const reloaded = await createLifeOsApplication({
      database: reopened,
      clock: new FakeClock(now),
    });
    expect(await reloaded.getGoals.execute()).toMatchObject([
      { id: createdGoal.value.id, status: 'active', directionId: createdDirection.value.id },
    ]);
    expect(await reloaded.plannerCatalog.actions()).toMatchObject([
      {
        id: createdAction.value.id,
        plannedDate: DayDate.create('2026-09-20'),
        status: 'completed',
        completedAt: now,
      },
    ]);
    reloaded.close();
  });

  it('moves one future Goal to active, then archives the same ID without adding records', async () => {
    const factory = new IDBFactory();
    const database = new LifeOsIndexedDb(factory);
    const app = await createLifeOsApplication({ database, clock: new FakeClock(now) });
    const created = await app.createGoal.execute({ title: 'Переносимая цель', status: 'future' });
    if (!created.ok) throw created.error;
    const moved = await changePlannerGoalStatus(
      app.updateGoal,
      created.value,
      'active',
      app.archiveGoal,
    );
    expect(moved.id).toEqual(created.value.id);
    expect(await app.getGoals.execute()).toHaveLength(1);
    const archived = await changePlannerGoalStatus(
      app.updateGoal,
      moved,
      'archived',
      app.archiveGoal,
    );
    expect(archived.id).toEqual(created.value.id);
    database.close();

    const reopened = new LifeOsIndexedDb(factory);
    const reloaded = await createLifeOsApplication({
      database: reopened,
      clock: new FakeClock(now),
    });
    expect(await reloaded.getGoals.execute()).toMatchObject([
      { id: created.value.id, status: 'archived' },
    ]);
    reloaded.close();
  });
});
