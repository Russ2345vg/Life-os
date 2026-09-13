import { describe, expect, it, vi } from 'vitest';
import { Direction, EntityId, Goal, GOAL_STAGE, GOAL_STATUS, Sphere } from '../../domain';
import {
  createGoalEditLoadController,
  loadGoalEdit,
  settleGoalEditLoad,
  type GoalEditSource,
} from './GoalEditLoader';

const NOW = new Date('2026-08-24T08:00:00.000Z');

function source(goal: Goal | null): GoalEditSource {
  const sphere = Sphere.create({ id: EntityId.create('sphere-home'), name: 'Дом', now: NOW });
  const direction = Direction.create({
    id: EntityId.create('direction-home'),
    sphereId: sphere.id,
    name: 'Среда жизни',
    now: NOW,
  }).archive(new Date(NOW.getTime() + 1_000));
  return { goal, directions: [direction], spheres: { active: [sphere], archived: [] } };
}

function activeGoal(): Goal {
  return Goal.create({
    id: EntityId.create('goal-home'),
    directionId: EntityId.create('direction-home'),
    title: 'Собственный дом',
    whyImportant: 'Для семьи',
    stage: GOAL_STAGE.activeGoal,
    status: GOAL_STATUS.active,
    coverImage: { dataUrl: 'data:image/png;base64,YQ==', mimeType: 'image/png', sizeBytes: 1 },
    now: NOW,
  });
}

describe('GoalEditLoader', () => {
  it('loads Goal, Direction and Sphere data in parallel through queries', async () => {
    const data = source(activeGoal());
    const getGoalById = { execute: vi.fn().mockResolvedValue(data.goal) };
    const getDirections = { execute: vi.fn().mockResolvedValue(data.directions) };
    const getSpheres = { execute: vi.fn().mockResolvedValue(data.spheres) };

    await expect(
      loadGoalEdit('goal-home', { getGoalById, getDirections, getSpheres }),
    ).resolves.toEqual(data);
    expect(getGoalById.execute).toHaveBeenCalledWith(EntityId.create('goal-home'));
  });

  it('prefills the full draft and retains the current archived Direction option', async () => {
    const state = await settleGoalEditLoad(Promise.resolve(source(activeGoal())), () => true);

    expect(state).toMatchObject({
      status: 'ready',
      draft: {
        title: 'Собственный дом',
        whyImportant: 'Для семьи',
        directionId: 'direction-home',
        coverImage: { dataUrl: 'data:image/png;base64,YQ==' },
      },
      groups: [
        {
          sphereName: 'Дом',
          options: [{ id: 'direction-home', archived: true }],
        },
      ],
    });
  });

  it('distinguishes missing, archived, technical and stale loads', async () => {
    const archived = activeGoal().archive(new Date(NOW.getTime() + 2_000));
    await expect(settleGoalEditLoad(Promise.resolve(source(null)), () => true)).resolves.toEqual({
      status: 'not-found',
    });
    await expect(
      settleGoalEditLoad(Promise.resolve(source(archived)), () => true),
    ).resolves.toEqual({ status: 'archived', goal: archived });
    await expect(
      settleGoalEditLoad(Promise.reject(new Error('storage details')), () => true),
    ).resolves.toEqual({ status: 'error' });
    await expect(
      settleGoalEditLoad(Promise.resolve(source(activeGoal())), () => false),
    ).resolves.toBeNull();
  });

  it('lets retry replace an older request and ignores its late completion', async () => {
    let resolveFirst: ((value: GoalEditSource) => void) | undefined;
    const first = new Promise<GoalEditSource>((resolve) => {
      resolveFirst = resolve;
    });
    const second = Promise.resolve(source(activeGoal()));
    const load = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const publish = vi.fn();
    const controller = createGoalEditLoadController({ load, publish });

    controller.activate();
    controller.retry();
    await second;
    await Promise.resolve();
    resolveFirst?.(source(null));
    await first;
    await Promise.resolve();

    expect(publish.mock.calls.map(([state]) => state.status)).toEqual([
      'loading',
      'loading',
      'ready',
    ]);
  });
});
