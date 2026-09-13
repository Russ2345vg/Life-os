import { describe, expect, it } from 'vitest';
import {
  CreateDirection,
  CreateGoal,
  EnsureDefaultSpheres,
  GetDirections,
  GetGoals,
  GetSpheres,
  RestoreDirection,
} from '../../application';
import { GOAL_HORIZON, GOAL_PROGRESS_TYPE, GOAL_STAGE, GOAL_STATUS } from '../../domain';
import {
  InMemoryDirectionRepository,
  InMemoryGoalRepository,
  InMemorySphereRepository,
} from '../../infrastructure';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { seedGoalAlbumDemo } from './GoalAlbumDemoSeed';

const NOW = new Date('2026-08-23T09:00:00.000Z');

async function setup() {
  const spheres = new InMemorySphereRepository();
  const directions = new InMemoryDirectionRepository();
  const goals = new InMemoryGoalRepository();
  const clock = new FakeClock(NOW);
  await new EnsureDefaultSpheres(spheres, clock).execute();

  return {
    getDirections: new GetDirections(directions),
    getGoals: new GetGoals(goals),
    application: {
      getSpheres: new GetSpheres(spheres),
      getDirections: new GetDirections(directions),
      createDirection: new CreateDirection(
        directions,
        clock,
        new FakeIdGenerator('demo-direction'),
      ),
      restoreDirection: new RestoreDirection(directions, clock),
      getGoals: new GetGoals(goals),
      createGoal: new CreateGoal(goals, directions, clock, new FakeIdGenerator('demo-goal')),
    },
  };
}

describe('Goal Album DEV demo seed', () => {
  it('creates the approved six-goal dataset through existing application APIs', async () => {
    const fixture = await setup();

    await expect(seedGoalAlbumDemo(fixture.application)).resolves.toEqual({
      createdDirections: 6,
      reusedDirections: 0,
      createdGoals: 6,
      reusedGoals: 0,
      verifiedGoals: 6,
    });

    const directions = await fixture.getDirections.execute();
    const directionNames = new Map(
      directions.map((direction) => [direction.id.toString(), direction.name]),
    );
    const goals = await fixture.getGoals.execute();
    const byTitle = new Map(goals.map((goal) => [goal.title, goal]));

    expect(goals).toHaveLength(6);
    expect([...directions].map((direction) => direction.name).sort()).toEqual([
      'Впечатления',
      'Крупные покупки',
      'Рост дохода',
      'Собственный продукт',
      'Среда жизни',
      'Финансовая безопасность',
    ]);
    expect(byTitle.get('Собственный дом')).toMatchObject({
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      horizon: GOAL_HORIZON.oneToThreeYears,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 68, target: 100, unit: '%' },
    });
    expect(directionNames.get(byTitle.get('Собственный дом')?.directionId?.toString() ?? '')).toBe(
      'Среда жизни',
    );
    expect(byTitle.get('LifeOS v1')).toMatchObject({
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 72, target: 100, unit: '%' },
    });
    expect(byTitle.get('Доход 150 000 ₽')).toMatchObject({
      status: GOAL_STATUS.active,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 55, target: 100, unit: '%' },
    });
    expect(byTitle.get('Резерв 500 000 ₽')).toMatchObject({
      status: GOAL_STATUS.active,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 38, target: 100, unit: '%' },
    });
    expect(byTitle.get('Мощный ПК')).toMatchObject({
      status: GOAL_STATUS.active,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 30, target: 100, unit: '%' },
    });
    expect(byTitle.get('Путешествие в Японию')).toMatchObject({
      status: GOAL_STATUS.future,
      stage: GOAL_STAGE.idea,
    });
    expect(
      directionNames.get(byTitle.get('Путешествие в Японию')?.directionId?.toString() ?? ''),
    ).toBe('Впечатления');
  });

  it('reuses the seeded Directions and Goals without duplicates on repeat runs', async () => {
    const fixture = await setup();
    await seedGoalAlbumDemo(fixture.application);
    const firstGoalIds = (await fixture.getGoals.execute())
      .map((goal) => goal.id.toString())
      .sort();
    const firstDirectionIds = (await fixture.getDirections.execute())
      .map((direction) => direction.id.toString())
      .sort();

    await expect(seedGoalAlbumDemo(fixture.application)).resolves.toEqual({
      createdDirections: 0,
      reusedDirections: 6,
      createdGoals: 0,
      reusedGoals: 6,
      verifiedGoals: 6,
    });

    expect((await fixture.getGoals.execute()).map((goal) => goal.id.toString()).sort()).toEqual(
      firstGoalIds,
    );
    expect(
      (await fixture.getDirections.execute()).map((direction) => direction.id.toString()).sort(),
    ).toEqual(firstDirectionIds);
  });
});
