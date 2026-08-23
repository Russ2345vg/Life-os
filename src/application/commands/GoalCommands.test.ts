import { describe, expect, it, vi } from 'vitest';
import {
  GOAL_HORIZON,
  GOAL_INTENTION_LEVEL,
  GOAL_PROGRESS_TYPE,
  GOAL_STAGE,
  GOAL_STATUS,
} from '../../domain';
import { InMemoryGoalRepository } from '../../infrastructure';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { GetGoalById } from '../queries/GetGoalById';
import { GetGoals } from '../queries/GetGoals';
import { ArchiveGoal } from './ArchiveGoal';
import { CreateGoal } from './CreateGoal';
import { UpdateGoal } from './UpdateGoal';

const CREATED_AT = new Date('2026-08-23T08:00:00.000Z');

function setup() {
  const repository = new InMemoryGoalRepository();
  const clock = new FakeClock(CREATED_AT);
  return {
    repository,
    clock,
    createGoal: new CreateGoal(repository, clock, new FakeIdGenerator('goal')),
    getGoal: new GetGoalById(repository),
    listGoals: new GetGoals(repository),
    updateGoal: new UpdateGoal(repository, clock),
    archiveGoal: new ArchiveGoal(repository, clock),
  };
}

describe('Goal commands and queries', () => {
  it('creates a goal and returns it through get and list queries', async () => {
    const app = setup();

    const created = await app.createGoal.execute({
      title: 'Подготовить собственную мастерскую',
      whyImportant: 'Создавать вещи своими руками',
      stage: GOAL_STAGE.intention,
      intentionLevel: GOAL_INTENTION_LEVEL.plan,
      horizon: GOAL_HORIZON.withinYear,
    });

    expect(created).toMatchObject({
      ok: true,
      value: {
        title: 'Подготовить собственную мастерскую',
        whyImportant: 'Создавать вещи своими руками',
        stage: GOAL_STAGE.intention,
        intentionLevel: GOAL_INTENTION_LEVEL.plan,
        horizon: GOAL_HORIZON.withinYear,
        version: 1,
      },
    });
    if (!created.ok) return;
    await expect(app.getGoal.execute(created.value.id)).resolves.toEqual(created.value);
    await expect(app.listGoals.execute()).resolves.toEqual([created.value]);
  });

  it('updates a goal with optimistic version checking', async () => {
    const app = setup();
    const created = await app.createGoal.execute({ title: 'Пробежать марафон' });
    if (!created.ok) throw created.error;
    app.clock.setTime(new Date('2026-08-24T08:00:00.000Z'));

    const updated = await app.updateGoal.execute({
      id: created.value.id,
      expectedVersion: created.value.version,
      title: 'Пробежать первый марафон',
      whyNow: 'Регистрация на осенний старт открыта',
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: GOAL_INTENTION_LEVEL.commit,
      horizon: GOAL_HORIZON.withinYear,
      progress: {
        type: GOAL_PROGRESS_TYPE.milestones,
        completed: 1,
        total: 4,
      },
      achievementCriteria: 'Финишировать официальную дистанцию 42,2 км',
      nextProgress: 'Выбрать тренировочный план',
    });

    expect(updated).toMatchObject({
      ok: true,
      value: {
        title: 'Пробежать первый марафон',
        progressType: GOAL_PROGRESS_TYPE.milestones,
        progress: { completed: 1, total: 4 },
        version: 2,
      },
    });
    await expect(
      app.updateGoal.execute({
        id: created.value.id,
        expectedVersion: 1,
        title: 'Устаревшая правка',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'goal.version_conflict' } });
  });

  it('rejects an invalid expected version before reading the goal', async () => {
    const app = setup();
    const created = await app.createGoal.execute({ title: 'Цель' });
    if (!created.ok) throw created.error;
    const findById = vi.spyOn(app.repository, 'findById');

    await expect(
      app.updateGoal.execute({
        id: created.value.id,
        expectedVersion: 0,
        title: 'Некорректная правка',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'goal.invalid_expected_version' } });
    expect(findById).not.toHaveBeenCalled();
  });

  it('archives a goal without deleting it from storage', async () => {
    const app = setup();
    const created = await app.createGoal.execute({
      title: 'Временно неактуальная цель',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
    });
    if (!created.ok) throw created.error;
    app.clock.setTime(new Date('2026-08-25T08:00:00.000Z'));

    const archived = await app.archiveGoal.execute({
      id: created.value.id,
      expectedVersion: created.value.version,
    });

    expect(archived).toMatchObject({
      ok: true,
      value: { status: GOAL_STATUS.archived, version: 2 },
    });
    expect((await app.listGoals.execute()).map((goal) => goal.status)).toEqual([
      GOAL_STATUS.archived,
    ]);
  });
});
