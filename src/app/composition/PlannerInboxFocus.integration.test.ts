import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Goal, LifeActionTitle } from '../../domain';
import { planPlannerAction } from '../../presentation/planner-v2/plannerTodayCommands';
import { createLifeOsApplication } from './createLifeOsApplication';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbGoalRepository } from '../../infrastructure/persistence/IndexedDbGoalRepository';

describe('V2 inbox and period focus', () => {
  it('links an action directly to a direction without a goal and persists the context', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const direction = await app.balance.createDirection.execute({ name: 'Дом' });
      if (!direction.ok) throw direction.error;
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Убрать шерсть'),
      });
      if (!created.ok) throw created.error;
      const linked = await app.setLifeActionGoal.execute({
        lifeActionId: created.value.id,
        goalId: null,
        directionId: direction.value.id,
      });
      if (!linked.ok) throw linked.error;
      const stored = (await app.plannerCatalog.actions()).find((action) =>
        action.id.equals(created.value.id),
      );
      expect(stored?.directionId?.toString()).toBe(direction.value.id.toString());
      expect(stored?.goalId).toBeNull();
    } finally {
      database.close();
    }
  });

  it('preserves main selection on date edits and explicitly clears it when removing the date', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Главное'),
        plannedDate: DayDate.create('2026-09-13'),
        isNext: true,
      });
      if (!created.ok) throw created.error;
      const action = await planPlannerAction(
        app.setLifeActionPlan,
        created.value.id.toString(),
        '2026-09-14',
      );
      expect(action.isNext).toBe(true);
      expect(
        (await planPlannerAction(app.setLifeActionPlan, action.id.toString(), '')).isNext,
      ).toBe(false);
    } finally {
      database.close();
    }
  });
  it('rolls back conversion if the target cannot be stored and preserves data after reopen', async () => {
    const factory = new IDBFactory();
    const database = new LifeOsIndexedDb(factory);
    const app = await createLifeOsApplication({ database });
    const idea = await app.plannerInbox.capture({
      title: 'Сохранить исходник',
      note: 'Не терять текст',
    });
    await new IndexedDbGoalRepository(database).create(
      Goal.create({
        id: EntityId.create(`inbox-result:goal:${idea.id}`),
        title: 'Collision',
        now: new Date(),
      }),
    );
    await expect(app.plannerInbox.convert(idea.id, 'goal')).rejects.toBeDefined();
    expect((await app.plannerInbox.list())[0]).toEqual(idea);
    database.close();
    const reopened = new LifeOsIndexedDb(factory);
    try {
      const next = await createLifeOsApplication({ database: reopened });
      expect((await next.plannerInbox.list())[0]).toEqual(idea);
    } finally {
      reopened.close();
    }
  });
  it('keeps the completion fact when linking and unlinking a converted action later', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const idea = await app.plannerInbox.capture({ title: 'Сделать' });
      const converted = await app.plannerInbox.convert(idea.id, 'action');
      const lifeActionId = EntityId.create(converted.targetId!);
      const completed = await app.completeLifeAction.execute({ lifeActionId });
      if (!completed.ok) throw completed.error;
      const goal = await app.createGoal.execute({ title: 'Контекст' });
      if (!goal.ok) throw goal.error;
      await app.setLifeActionGoal.execute({ lifeActionId, goalId: goal.value.id });
      await app.setLifeActionGoal.execute({ lifeActionId, goalId: null });
      expect(
        (await app.plannerCatalog.actions()).find((action) => action.id.equals(lifeActionId))
          ?.completedAt,
      ).toEqual(completed.value.completedAt);
    } finally {
      database.close();
    }
  });
  it('captures title only and converts once to a goal, preserving source and link', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const idea = await app.plannerInbox.capture({ title: '  Новая мысль  ' });
      expect(idea.title).toBe('Новая мысль');
      expect(idea.note).toBeNull();
      const results = await Promise.all([
        app.plannerInbox.convert(idea.id, 'goal'),
        app.plannerInbox.convert(idea.id, 'goal'),
      ]);
      expect(results[0].targetId).toBe(results[1].targetId);
      expect(await app.getGoals.execute()).toHaveLength(1);
      expect((await app.getGoals.execute())[0]?.title).toBe(idea.title);
      const saved = (await app.plannerInbox.list())[0]!;
      expect(saved.status).toBe('converted');
      expect(saved.title).toBe(idea.title);
      expect(saved.targetId).toBe(results[0].targetId);
    } finally {
      database.close();
    }
  });
  it('converts to standalone action, rejects another destination, and archives without deletion', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const idea = await app.plannerInbox.capture({ title: 'Позвонить', note: 'После обеда' });
      await app.plannerInbox.convert(idea.id, 'action');
      await app.plannerInbox.convert(idea.id, 'action');
      await expect(app.plannerInbox.convert(idea.id, 'goal')).rejects.toThrow();
      const actions = await app.plannerCatalog.actions();
      expect(actions).toHaveLength(1);
      expect(actions[0]?.goalId).toBeNull();
      expect(actions[0]?.plannedDate).toBeNull();
      expect(actions[0]?.description).toBe('После обеда');
      const other = await app.plannerInbox.capture({ title: 'Позже' });
      await app.plannerInbox.archive(other.id);
      expect((await app.plannerInbox.list()).find((x) => x.id === other.id)?.status).toBe(
        'archived',
      );
    } finally {
      database.close();
    }
  });
  it('keeps one primary and unique supporting links without changing Goal status', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const a = await app.createGoal.execute({ title: 'Главная', status: 'active' });
      const b = await app.createGoal.execute({ title: 'Поддержка', status: 'active' });
      if (!a.ok || !b.ok) throw new Error('fixture');
      const period = '2026-09-07';
      await app.plannerFocus.setRole(period, a.value.id.toString(), 'primary');
      await app.plannerFocus.setRole(period, b.value.id.toString(), 'supporting');
      await app.plannerFocus.setRole(period, b.value.id.toString(), 'primary');
      const focus = await app.plannerFocus.get(period);
      expect(focus?.goals).toHaveLength(2);
      expect(focus?.goals).toEqual(
        expect.arrayContaining([
          { goalId: a.value.id.toString(), role: 'supporting' },
          { goalId: b.value.id.toString(), role: 'primary' },
        ]),
      );
      await app.plannerFocus.setRole(period, a.value.id.toString(), null);
      expect((await app.plannerFocus.get(period))?.goals).toHaveLength(1);
      expect(await app.plannerFocus.get('2026-09-14')).toBeNull();
      expect((await app.getGoals.execute()).map((g) => g.status)).toEqual(['active', 'active']);
    } finally {
      database.close();
    }
  });
});
