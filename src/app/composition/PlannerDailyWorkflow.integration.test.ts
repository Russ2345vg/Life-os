import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, LifeActionTitle } from '../../domain';
import { selectGoalCardActions } from '../../presentation/planner-v2/plannerCatalogModel';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

describe('Planner daily workflow persistence', () => {
  it('keeps each Goal next step independent from the main Action of the Day', async () => {
    const factory = new IDBFactory();
    const database = new LifeOsIndexedDb(factory);
    const app = await createLifeOsApplication({
      database,
      clock: new FakeClock(new Date('2026-09-14T09:00:00Z')),
      idGenerator: new FakeIdGenerator('goal-next'),
    });
    const firstGoal = await app.createGoal.execute({ title: 'Первая цель', status: 'active' });
    const secondGoal = await app.createGoal.execute({ title: 'Вторая цель', status: 'active' });
    if (!firstGoal.ok || !secondGoal.ok) throw new Error('Goals were not created');
    const main = await app.createLifeActionDraft.execute({
      title: LifeActionTitle.create('Главное действие дня'),
      plannedDate: DayDate.create('2026-09-14'),
      isNext: true,
    });
    const first = await app.createLifeActionDraft.execute({
      title: LifeActionTitle.create('Шаг первой цели'),
      goalId: firstGoal.value.id,
    });
    const second = await app.createLifeActionDraft.execute({
      title: LifeActionTitle.create('Шаг второй цели'),
      goalId: secondGoal.value.id,
    });
    if (!main.ok || !first.ok || !second.ok) throw new Error('Actions were not created');
    expect(
      (
        await app.selectGoalNextAction.execute({
          goalId: firstGoal.value.id,
          actionId: first.value.id,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await app.selectGoalNextAction.execute({
          goalId: secondGoal.value.id,
          actionId: second.value.id,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await app.selectGoalNextAction.execute({
          goalId: firstGoal.value.id,
          actionId: second.value.id,
        })
      ).ok,
    ).toBe(false);
    database.close();

    const reopened = new LifeOsIndexedDb(factory);
    const restored = await createLifeOsApplication({ database: reopened });
    const actions = await restored.lifeActionRepository.findAll!();
    const goalA = await restored.getGoalById.execute(firstGoal.value.id);
    const goalB = await restored.getGoalById.execute(secondGoal.value.id);
    expect(goalA?.nextActionId?.toString()).toBe(first.value.id.toString());
    expect(goalB?.nextActionId?.toString()).toBe(second.value.id.toString());
    expect(selectGoalCardActions(goalA!, actions).next?.id.toString()).toBe(
      first.value.id.toString(),
    );
    expect(selectGoalCardActions(goalB!, actions).next?.id.toString()).toBe(
      second.value.id.toString(),
    );
    expect(actions.find((action) => action.id.equals(main.value.id))?.isNext).toBe(true);
    expect(actions.find((action) => action.id.equals(first.value.id))?.plannedDate).toBeNull();
    expect(actions.find((action) => action.id.equals(second.value.id))?.plannedDate).toBeNull();
    reopened.close();
  });
  it('edits a draft, preserves one-level children after reload, and unlinks without deleting either action', async () => {
    const factory = new IDBFactory();
    const database = new LifeOsIndexedDb(factory);
    const app = await createLifeOsApplication({
      database,
      clock: new FakeClock(new Date('2026-09-14T09:00:00Z')),
      idGenerator: new FakeIdGenerator('daily-workflow'),
    });
    const root = await app.createLifeActionDraft.execute({
      title: LifeActionTitle.create('Родитель'),
    });
    if (!root.ok) throw root.error;
    const child = await app.createLifeActionDraft.execute({
      title: LifeActionTitle.create('Поддействие'),
      parentActionId: root.value.id,
    });
    if (!child.ok) throw child.error;
    const edit = await app.editPlannerActionDraft.execute({
      lifeActionId: child.value.id,
      title: 'Поддействие изменено',
      description: 'Детали',
    });
    expect(edit.ok).toBe(true);
    const grandchild = await app.createLifeActionDraft.execute({
      title: LifeActionTitle.create('Лишний уровень'),
      parentActionId: child.value.id,
    });
    expect(grandchild.ok).toBe(false);
    database.close();

    const reopened = new LifeOsIndexedDb(factory);
    const restored = await createLifeOsApplication({ database: reopened });
    const saved = await restored.lifeActionRepository.findById(child.value.id);
    expect(saved?.parentActionId?.toString()).toBe(root.value.id.toString());
    expect(saved?.title.toString()).toBe('Поддействие изменено');
    expect(saved?.description).toBe('Детали');
    const unlink = await restored.setLifeActionParent.execute({
      lifeActionId: child.value.id,
      parentActionId: null,
    });
    expect(unlink.ok).toBe(true);
    expect(
      (await restored.lifeActionRepository.findById(child.value.id))?.parentActionId,
    ).toBeNull();
    expect(
      await restored.lifeActionRepository.findById(EntityId.create(root.value.id.toString())),
    ).not.toBeNull();
    reopened.close();
  });
});
