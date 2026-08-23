import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  EntityId,
  Goal,
  GOAL_HORIZON,
  GOAL_INTENTION_LEVEL,
  GOAL_PROGRESS_TYPE,
  GOAL_STAGE,
  GOAL_STATUS,
} from '../../domain';
import { IndexedDbGoalRepository } from './IndexedDbGoalRepository';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

describe('Goal IndexedDB persistence', () => {
  it('saves, restores, updates and archives a goal without losing typed data', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const firstRepository = new IndexedDbGoalRepository(firstDatabase);
    const createdAt = new Date('2026-08-23T08:00:00.000Z');
    const goal = Goal.create({
      id: EntityId.create('goal-persisted'),
      title: 'Собственная мастерская',
      description: 'Тихое рабочее пространство',
      whyImportant: 'Делать вещи своими руками',
      whyNow: 'Есть возможность подготовить помещение',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: GOAL_INTENTION_LEVEL.commit,
      horizon: GOAL_HORIZON.withinYear,
      progress: {
        type: GOAL_PROGRESS_TYPE.qualitative,
        stage: 'moving',
      },
      achievementCriteria: 'Помещение готово и первый предмет сделан',
      nextProgress: 'Составить список оборудования',
      coverImage: {
        dataUrl: 'data:image/png;base64,AQID',
        mimeType: 'image/png',
        sizeBytes: 3,
      },
      now: createdAt,
    });

    await expect(firstRepository.create(goal)).resolves.toBe(true);
    firstDatabase.close();

    const reloadedDatabase = new LifeOsIndexedDb(factory);
    const reloadedRepository = new IndexedDbGoalRepository(reloadedDatabase);
    const restored = await reloadedRepository.findById(goal.id);

    expect(restored).toMatchObject({
      title: 'Собственная мастерская',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: GOAL_INTENTION_LEVEL.commit,
      horizon: GOAL_HORIZON.withinYear,
      progressType: GOAL_PROGRESS_TYPE.qualitative,
      progress: { stage: 'moving' },
      coverImage: { mimeType: 'image/png', sizeBytes: 3 },
      version: 1,
    });
    expect(restored?.createdAt).toEqual(createdAt);
    if (restored === null) throw new Error('Goal was not restored');

    const archivedAt = new Date('2026-08-24T08:00:00.000Z');
    const archived = restored.archive(archivedAt);
    await expect(
      reloadedRepository.updateIfVersionMatches(archived, restored.version),
    ).resolves.toBe(true);
    await expect(reloadedRepository.findAll()).resolves.toMatchObject([
      { id: goal.id, status: GOAL_STATUS.archived, archivedAt, version: 2 },
    ]);
    reloadedDatabase.close();
  });

  it('updates atomically only when the stored version matches', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbGoalRepository(database);
    const goal = Goal.create({
      id: EntityId.create('goal-concurrent'),
      title: 'Исходная цель',
      now: new Date('2026-08-23T08:00:00.000Z'),
    });
    await repository.create(goal);
    const firstUpdate = goal.update(
      { title: 'Первая правка' },
      new Date('2026-08-24T08:00:00.000Z'),
    );
    const staleUpdate = goal.update(
      { title: 'Устаревшая правка' },
      new Date('2026-08-24T09:00:00.000Z'),
    );

    await expect(repository.updateIfVersionMatches(firstUpdate, goal.version)).resolves.toBe(true);
    await expect(repository.updateIfVersionMatches(staleUpdate, goal.version)).resolves.toBe(false);
    await expect(repository.findById(goal.id)).resolves.toMatchObject({
      title: 'Первая правка',
      version: 2,
    });
    database.close();
  });

  it('rejects a malformed stored goal record', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const connection = await database.open();
    await executeIndexedDbRequest(connection, LIFE_OS_STORE.goals, 'readwrite', (store) =>
      store.add({
        schemaVersion: 1,
        id: 'goal-malformed',
        title: 'Повреждённая цель',
        description: null,
        whyImportant: null,
        whyNow: null,
        status: 'unknown',
        stage: GOAL_STAGE.idea,
        intentionLevel: null,
        horizon: null,
        progressType: null,
        progress: null,
        achievementCriteria: null,
        nextProgress: null,
        coverImage: null,
        createdAt: '2026-08-23T08:00:00.000Z',
        updatedAt: '2026-08-23T08:00:00.000Z',
        archivedAt: null,
        version: 1,
      }),
    );
    const repository = new IndexedDbGoalRepository(database);

    await expect(repository.findById(EntityId.create('goal-malformed'))).rejects.toMatchObject({
      code: 'persistence.invalid_record',
    });
    database.close();
  });
});
