import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLifeOsApplication } from './createLifeOsApplication';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbPlanningRepository } from '../../infrastructure/persistence/IndexedDbPlanningRepository';
import {
  emptyActionDraft,
  submitPlannerAction,
} from '../../presentation/planner-v2/plannerFormSubmission';

describe('V2 Action form through application and IndexedDB', () => {
  it('keeps valid parent and contribution Goal IDs while ignoring an empty optional link', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const goal = await app.createGoal.execute({
        title: 'Шаги',
        measurement: {
          mode: 'count',
          target: 10,
          unit: 'шагов',
          start: 0,
          direction: 'at_least',
          cycle: null,
        },
      });
      if (!goal.ok) throw goal.error;
      const parent = await submitPlannerAction(app.createLifeActionDraft, {
        ...emptyActionDraft(),
        title: 'Родитель',
      });
      const child = await submitPlannerAction(app.createLifeActionDraft, {
        ...emptyActionDraft(goal.value.id.toString()),
        title: 'Дочернее',
        parentActionId: parent.id.toString(),
        contributions: [
          { goalId: '', mode: 'fixed', amount: 1 },
          { goalId: goal.value.id.toString(), mode: 'fixed', amount: 1 },
        ],
      });
      expect(child.parentActionId?.toString()).toBe(parent.id.toString());
      expect(child.goalId?.toString()).toBe(goal.value.id.toString());
      const planning = await new IndexedDbPlanningRepository(database).read();
      expect(planning.links).toMatchObject([
        { goalId: goal.value.id.toString(), sourceId: child.id.toString() },
      ]);
    } finally {
      database.close();
    }
  });
  it.each(['Actions', 'Today', 'Goal Card', 'cleared advanced fields'])(
    'creates and reloads an Action from %s without hidden IDs',
    async (source) => {
      const database = new LifeOsIndexedDb(new IDBFactory());
      const app = await createLifeOsApplication({ database });
      try {
        const draft = { ...emptyActionDraft(), title: 'Прогуляться' };
        if (source === 'Today') draft.date = '2026-09-14';
        if (source === 'Goal Card') {
          const goal = await app.createGoal.execute({ title: 'Здоровье' });
          if (!goal.ok) throw goal.error;
          draft.goalId = goal.value.id.toString();
        }
        if (source === 'cleared advanced fields') {
          draft.contributions = [{ goalId: '', mode: 'fixed', amount: 1 }];
        }
        const saved = await submitPlannerAction(app.createLifeActionDraft, draft);
        expect(saved.id.toString()).not.toBe('');
        database.close();
        const restored = await app.lifeActionRepository.findById(saved.id);
        expect(restored?.title.toString()).toBe(draft.title);
        expect(restored?.goalId?.toString() ?? null).toBe(draft.goalId || null);
        expect(restored?.plannedDate?.toString() ?? null).toBe(draft.date || null);
        expect(restored?.parentActionId).toBeNull();
        expect(restored?.occurrence).toBeNull();
        expect(restored?.expectedContributions).toBeNull();
        const planning = await new IndexedDbPlanningRepository(database).read();
        expect(planning.links).toEqual([]);
        expect(planning.rules).toEqual([]);
      } finally {
        database.close();
      }
    },
  );
});
