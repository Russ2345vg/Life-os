import { describe, expect, it, vi } from 'vitest';
import {
  Direction,
  DIRECTION_STATUS,
  EntityId,
  Goal,
  GOAL_HORIZON,
  GOAL_INTENTION_LEVEL,
  GOAL_PROGRESS_TYPE,
  GOAL_STAGE,
  GOAL_STATUS,
} from '../../domain';
import { InMemoryDirectionRepository, InMemoryGoalRepository } from '../../infrastructure';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { GetGoalById } from '../queries/GetGoalById';
import { GetGoals } from '../queries/GetGoals';
import { ArchiveGoal } from './ArchiveGoal';
import { CreateGoal } from './CreateGoal';
import { UpdateGoal } from './UpdateGoal';

const CREATED_AT = new Date('2026-08-23T08:00:00.000Z');

function setup() {
  const repository = new InMemoryGoalRepository();
  const directionRepository = new InMemoryDirectionRepository();
  const clock = new FakeClock(CREATED_AT);
  return {
    repository,
    directionRepository,
    clock,
    createGoal: new CreateGoal(repository, directionRepository, clock, new FakeIdGenerator('goal')),
    getGoal: new GetGoalById(repository),
    listGoals: new GetGoals(repository),
    updateGoal: new UpdateGoal(repository, directionRepository, clock),
    archiveGoal: new ArchiveGoal(repository, clock),
  };
}

describe('Goal commands and queries', () => {
  it('requires an existing Direction when creating an active goal', async () => {
    const app = setup();

    await expect(
      app.createGoal.execute({
        title: 'Активная цель без направления',
        status: GOAL_STATUS.active,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'goal.direction_required' } });

    const direction = Direction.create({
      id: EntityId.create('direction-goal'),
      name: 'Развитие',
      now: CREATED_AT,
    });
    await app.directionRepository.create(direction);

    await expect(
      app.createGoal.execute({
        title: 'Активная цель с направлением',
        status: GOAL_STATUS.active,
        directionId: direction.id,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { directionId: direction.id, status: GOAL_STATUS.active },
    });
  });

  it('rejects a Goal reference to an unknown Direction', async () => {
    const app = setup();

    await expect(
      app.createGoal.execute({
        title: 'Будущая цель с отсутствующим направлением',
        directionId: EntityId.create('direction-missing'),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'goal.direction_not_found' } });
  });

  it('rejects assigning an archived Direction to a new Goal', async () => {
    const app = setup();
    const archivedDirection = Direction.create({
      id: EntityId.create('direction-archived'),
      name: 'Архивное направление',
      now: CREATED_AT,
    }).archive(new Date('2026-08-24T08:00:00.000Z'));
    await app.directionRepository.create(archivedDirection);

    await expect(
      app.createGoal.execute({
        title: 'Цель в архивном направлении',
        directionId: archivedDirection.id,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'goal.archived_direction' } });
  });

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
    const direction = Direction.create({
      id: EntityId.create('direction-marathon'),
      name: 'Здоровье',
      now: CREATED_AT,
    });
    await app.directionRepository.create(direction);
    const created = await app.createGoal.execute({
      title: 'Пробежать марафон',
      directionId: direction.id,
    });
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

  it('requires a Direction when an update makes a Goal active', async () => {
    const app = setup();
    const created = await app.createGoal.execute({ title: 'Будущая цель' });
    if (!created.ok) throw created.error;

    await expect(
      app.updateGoal.execute({
        id: created.value.id,
        expectedVersion: created.value.version,
        title: created.value.title,
        status: GOAL_STATUS.active,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'goal.direction_required' } });
  });

  it('rejects changing a Goal to an unknown Direction', async () => {
    const app = setup();
    const created = await app.createGoal.execute({ title: 'Цель для переноса' });
    if (!created.ok) throw created.error;

    await expect(
      app.updateGoal.execute({
        id: created.value.id,
        expectedVersion: created.value.version,
        title: created.value.title,
        directionId: EntityId.create('direction-unknown-update'),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'goal.direction_not_found' } });
  });

  it('rejects changing a Goal to an archived Direction', async () => {
    const app = setup();
    const created = await app.createGoal.execute({ title: 'Цель для архивного направления' });
    if (!created.ok) throw created.error;
    const archivedDirection = Direction.create({
      id: EntityId.create('direction-archived-update'),
      name: 'Архивное направление для обновления',
      now: CREATED_AT,
    }).archive(new Date('2026-08-24T08:00:00.000Z'));
    await app.directionRepository.create(archivedDirection);

    await expect(
      app.updateGoal.execute({
        id: created.value.id,
        expectedVersion: created.value.version,
        title: created.value.title,
        directionId: archivedDirection.id,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'goal.archived_direction' } });
  });

  it('allows editing a Goal when its unchanged Direction was archived independently', async () => {
    const app = setup();
    const direction = Direction.create({
      id: EntityId.create('direction-archived-after-goal'),
      name: 'Позже архивированное направление',
      now: CREATED_AT,
    });
    await app.directionRepository.create(direction);
    const created = await app.createGoal.execute({
      title: 'Цель существующего направления',
      status: GOAL_STATUS.active,
      directionId: direction.id,
    });
    if (!created.ok) throw created.error;
    const archivedDirection = direction.archive(new Date('2026-08-24T08:00:00.000Z'));
    await app.directionRepository.updateIfVersionMatches(archivedDirection, direction.version);

    await expect(
      app.updateGoal.execute({
        id: created.value.id,
        expectedVersion: created.value.version,
        title: 'Обновлённая цель существующего направления',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        directionId: direction.id,
        title: 'Обновлённая цель существующего направления',
      },
    });
  });

  it('rejects activating a future Goal in its unchanged archived Direction', async () => {
    const app = setup();
    const direction = Direction.create({
      id: EntityId.create('direction-archived-before-activation'),
      name: 'Направление до активации',
      now: CREATED_AT,
    });
    await app.directionRepository.create(direction);
    const created = await app.createGoal.execute({
      title: 'Будущая цель архивированного направления',
      directionId: direction.id,
    });
    if (!created.ok) throw created.error;
    const archivedDirection = direction.archive(new Date('2026-08-24T08:00:00.000Z'));
    await app.directionRepository.updateIfVersionMatches(archivedDirection, direction.version);

    await expect(
      app.updateGoal.execute({
        id: created.value.id,
        expectedVersion: created.value.version,
        title: created.value.title,
        status: GOAL_STATUS.active,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'goal.archived_direction' } });
  });

  it('repairs a legacy active Goal by assigning an existing Direction atomically', async () => {
    const app = setup();
    const legacyGoal = Goal.create({
      id: EntityId.create('goal-legacy-active'),
      title: 'Активная цель из старой версии',
      status: GOAL_STATUS.active,
      now: CREATED_AT,
    });
    await app.repository.create(legacyGoal);
    const direction = Direction.create({
      id: EntityId.create('direction-legacy-repair'),
      name: 'Направление для восстановления связи',
      now: CREATED_AT,
    });
    await app.directionRepository.create(direction);

    await expect(
      app.updateGoal.execute({
        id: legacyGoal.id,
        expectedVersion: legacyGoal.version,
        title: legacyGoal.title,
        directionId: direction.id,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { directionId: direction.id, status: GOAL_STATUS.active, version: 2 },
    });
  });

  it('changes a Goal Direction and allows clearing it after moving the Goal to future', async () => {
    const app = setup();
    const firstDirection = Direction.create({
      id: EntityId.create('direction-change-first'),
      name: 'Первое направление',
      now: CREATED_AT,
    });
    const secondDirection = Direction.create({
      id: EntityId.create('direction-change-second'),
      name: 'Второе направление',
      now: CREATED_AT,
    });
    await app.directionRepository.create(firstDirection);
    await app.directionRepository.create(secondDirection);
    const created = await app.createGoal.execute({
      title: 'Переносимая цель',
      status: GOAL_STATUS.active,
      directionId: firstDirection.id,
    });
    if (!created.ok) throw created.error;

    const moved = await app.updateGoal.execute({
      id: created.value.id,
      expectedVersion: created.value.version,
      title: created.value.title,
      directionId: secondDirection.id,
    });
    expect(moved).toMatchObject({ ok: true, value: { directionId: secondDirection.id } });
    if (!moved.ok) throw moved.error;

    await expect(
      app.updateGoal.execute({
        id: moved.value.id,
        expectedVersion: moved.value.version,
        title: moved.value.title,
        status: GOAL_STATUS.future,
        directionId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { directionId: null, status: GOAL_STATUS.future },
    });
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
    const direction = Direction.create({
      id: EntityId.create('direction-archive'),
      name: 'Архивируемое направление',
      now: CREATED_AT,
    });
    await app.directionRepository.create(direction);
    const created = await app.createGoal.execute({
      title: 'Временно неактуальная цель',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      directionId: direction.id,
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
    await expect(app.directionRepository.findById(direction.id)).resolves.toMatchObject({
      status: DIRECTION_STATUS.active,
    });
  });

  it('filters Goals by every lifecycle status', async () => {
    const directionId = EntityId.create('direction-query-status');
    const future = Goal.create({
      id: EntityId.create('goal-future-query'),
      directionId,
      title: 'Будущая цель',
      now: CREATED_AT,
    });
    const active = Goal.create({
      id: EntityId.create('goal-active-query'),
      directionId,
      title: 'Активная цель',
      status: GOAL_STATUS.active,
      now: CREATED_AT,
    });
    const achieved = Goal.create({
      id: EntityId.create('goal-achieved-query'),
      directionId,
      title: 'Достигнутая цель',
      now: CREATED_AT,
    }).update(
      {
        title: 'Достигнутая цель',
        status: GOAL_STATUS.achieved,
        stage: GOAL_STAGE.achieved,
      },
      new Date('2026-08-24T08:00:00.000Z'),
    );
    const archived = Goal.create({
      id: EntityId.create('goal-archived-query'),
      directionId,
      title: 'Архивная цель',
      now: CREATED_AT,
    }).archive(new Date('2026-08-24T08:00:00.000Z'));
    const query = new GetGoals(new InMemoryGoalRepository([future, active, achieved, archived]));

    await expect(query.execute({ status: GOAL_STATUS.active })).resolves.toEqual([active]);
    await expect(query.execute({ status: GOAL_STATUS.future })).resolves.toEqual([future]);
    await expect(query.execute({ status: GOAL_STATUS.achieved })).resolves.toEqual([achieved]);
    await expect(query.execute({ status: GOAL_STATUS.archived })).resolves.toEqual([archived]);
  });

  it('filters Goals by Direction and combines it with a status filter', async () => {
    const firstDirectionId = EntityId.create('direction-query-first');
    const secondDirectionId = EntityId.create('direction-query-second');
    const firstFuture = Goal.create({
      id: EntityId.create('goal-first-future'),
      directionId: firstDirectionId,
      title: 'Первая будущая цель',
      now: CREATED_AT,
    });
    const firstActive = Goal.create({
      id: EntityId.create('goal-first-active'),
      directionId: firstDirectionId,
      title: 'Первая активная цель',
      status: GOAL_STATUS.active,
      now: CREATED_AT,
    });
    const secondActive = Goal.create({
      id: EntityId.create('goal-second-active'),
      directionId: secondDirectionId,
      title: 'Вторая активная цель',
      status: GOAL_STATUS.active,
      now: CREATED_AT,
    });
    const query = new GetGoals(
      new InMemoryGoalRepository([firstFuture, firstActive, secondActive]),
    );

    await expect(query.execute({ directionId: firstDirectionId })).resolves.toEqual([
      firstFuture,
      firstActive,
    ]);
    await expect(
      query.execute({ directionId: firstDirectionId, status: GOAL_STATUS.active }),
    ).resolves.toEqual([firstActive]);
  });
});
