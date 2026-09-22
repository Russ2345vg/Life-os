import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LifeActionTitle } from '../../domain';
import { createLifeOsApplication } from './createLifeOsApplication';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import {
  submitPlannerAction,
  submitPlannerGoal,
  emptyActionDraft,
  emptyGoalDraft,
} from '../../presentation/planner-v2/plannerFormSubmission';
import { completePlannerAction } from '../../presentation/planner-v2/plannerTodayCommands';

describe('Planner UI flows', () => {
  it('saves a title-only UI draft without a Decision, date, expected result or session', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const action = await submitPlannerAction(app.createLifeActionDraft, {
        ...emptyActionDraft(),
        title: ' Самостоятельное дело ',
      });
      expect(action.title.toString()).toBe('Самостоятельное дело');
      expect(action.plannedDate).toBeNull();
      expect(action.decisionId).toBeNull();
      expect(action.expectedResult).toBeNull();
    } finally {
      database.close();
    }
  });
  it('creates an active unassigned Goal and pre-fills its id when submitting a first action', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const goal = await submitPlannerGoal(app.createGoal, {
        ...emptyGoalDraft(),
        title: 'Здоровье',
        outcome: 'Чувствовать себя лучше',
        firstStep: 'Прогулка',
      });
      expect(goal.directionId).toBeNull();
      expect(goal.status).toBe('active');
      expect(goal.achievementCriteria).toBe('Чувствовать себя лучше');
      const action = await submitPlannerAction(app.createLifeActionDraft, {
        ...emptyActionDraft(goal.id.toString(), goal.nextProgress),
        date: '2026-09-13',
      });
      expect(action.goalId?.toString()).toBe(goal.id.toString());
      expect(action.plannedDate?.toString()).toBe('2026-09-13');
    } finally {
      database.close();
    }
  });
  it('completes by one command without a session and keeps one Journal fact on repeat', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Прочитать главу'),
      });
      if (!created.ok) throw created.error;
      await completePlannerAction(app.completeLifeAction, created.value.id.toString());
      await completePlannerAction(app.completeLifeAction, created.value.id.toString());
      const saved = (await app.plannerCatalog.actions()).find((action) =>
        action.id.equals(created.value.id),
      );
      expect(saved?.status).toBe('completed');
      expect(saved?.actualResult).toBeNull();
    } finally {
      database.close();
    }
  });
});
