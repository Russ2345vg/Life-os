import { describe, expect, it, vi } from 'vitest';
import { Direction, EntityId, Goal, Sphere } from '../../domain';
import { loadGoalDetail, type GoalDetailQueries } from './GoalDetailLoader';

const NOW = new Date('2026-08-24T09:00:00.000Z');

function setup(goal: Goal | null): GoalDetailQueries {
  const direction = Direction.create({
    id: EntityId.create('direction-home'),
    sphereId: EntityId.create('sphere-home'),
    name: 'Среда жизни',
    now: NOW,
  });
  const sphere = Sphere.create({
    id: EntityId.create('sphere-home'),
    name: 'Дом',
    now: NOW,
  });

  return {
    getGoalById: { execute: vi.fn().mockResolvedValue(goal) },
    getDirections: { execute: vi.fn().mockResolvedValue([direction]) },
    getSpheres: { execute: vi.fn().mockResolvedValue({ active: [sphere], archived: [] }) },
  };
}

describe('Goal detail loader', () => {
  it('loads the requested Goal and its Direction/Sphere context in one snapshot', async () => {
    const goal = Goal.create({
      id: EntityId.create('goal-home'),
      directionId: EntityId.create('direction-home'),
      title: 'Собственный дом',
      now: NOW,
    });
    const queries = setup(goal);

    const source = await loadGoalDetail('goal-home', queries);

    expect(source.goal).toBe(goal);
    expect(source.directions.map((direction) => direction.name)).toEqual(['Среда жизни']);
    expect(source.spheres.active.map((sphere) => sphere.name)).toEqual(['Дом']);
    expect(queries.getGoalById.execute).toHaveBeenCalledWith(EntityId.create('goal-home'));
  });

  it('preserves a not-found result without turning it into a technical failure', async () => {
    await expect(loadGoalDetail('goal-missing', setup(null))).resolves.toMatchObject({
      goal: null,
    });
  });
});
