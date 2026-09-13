import type { CreateGoalInput } from '../../application';
import {
  DIRECTION_STATUS,
  GOAL_HORIZON,
  GOAL_PROGRESS_TYPE,
  GOAL_STAGE,
  GOAL_STATUS,
  type Direction,
  type EntityId,
} from '../../domain';
import type { LifeOsApplication } from '../composition';

type GoalAlbumDemoApplication = Pick<
  LifeOsApplication,
  | 'getSpheres'
  | 'getDirections'
  | 'createDirection'
  | 'restoreDirection'
  | 'getGoals'
  | 'createGoal'
>;

interface DemoDirectionDefinition {
  readonly name: string;
  readonly sphereName: 'Дом' | 'Работа' | 'Деньги' | 'Развитие';
}

interface DemoGoalDefinition {
  readonly directionName: string;
  readonly input: Omit<CreateGoalInput, 'directionId'>;
}

export interface GoalAlbumDemoSeedResult {
  readonly createdDirections: number;
  readonly reusedDirections: number;
  readonly createdGoals: number;
  readonly reusedGoals: number;
  readonly verifiedGoals: number;
}

const DEMO_DIRECTIONS: readonly DemoDirectionDefinition[] = [
  { name: 'Среда жизни', sphereName: 'Дом' },
  { name: 'Собственный продукт', sphereName: 'Работа' },
  { name: 'Рост дохода', sphereName: 'Деньги' },
  { name: 'Финансовая безопасность', sphereName: 'Деньги' },
  { name: 'Крупные покупки', sphereName: 'Деньги' },
  { name: 'Впечатления', sphereName: 'Развитие' },
];

const DEMO_GOALS: readonly DemoGoalDefinition[] = [
  {
    directionName: 'Собственный продукт',
    input: {
      title: 'LifeOS v1',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      horizon: GOAL_HORIZON.withinYear,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 72, target: 100, unit: '%' },
      nextProgress: 'Завершить визуальную приёмку Альбома целей',
    },
  },
  {
    directionName: 'Крупные покупки',
    input: {
      title: 'Мощный ПК',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      horizon: GOAL_HORIZON.withinYear,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 30, target: 100, unit: '%' },
      nextProgress: 'Собрать финальную конфигурацию компонентов',
    },
  },
  {
    directionName: 'Впечатления',
    input: {
      title: 'Путешествие в Японию',
      status: GOAL_STATUS.future,
      stage: GOAL_STAGE.idea,
      horizon: GOAL_HORIZON.oneToThreeYears,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 15, target: 100, unit: '%' },
      nextProgress: 'Выбрать сезон и предварительный маршрут',
    },
  },
  {
    directionName: 'Финансовая безопасность',
    input: {
      title: 'Резерв 500 000 ₽',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      horizon: GOAL_HORIZON.withinYear,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 38, target: 100, unit: '%' },
      nextProgress: 'Настроить автоматическое пополнение резерва',
    },
  },
  {
    directionName: 'Рост дохода',
    input: {
      title: 'Доход 150 000 ₽',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      horizon: GOAL_HORIZON.withinYear,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 55, target: 100, unit: '%' },
      nextProgress: 'Проверить гипотезу нового источника дохода',
    },
  },
  {
    directionName: 'Среда жизни',
    input: {
      title: 'Собственный дом',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      horizon: GOAL_HORIZON.oneToThreeYears,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 68, target: 100, unit: '%' },
      nextProgress: 'Подготовить финансовую модель покупки',
    },
  },
];

export async function seedGoalAlbumDemo(
  application: GoalAlbumDemoApplication,
): Promise<GoalAlbumDemoSeedResult> {
  const [spheres, storedDirections] = await Promise.all([
    application.getSpheres.execute(),
    application.getDirections.execute(),
  ]);
  const activeSpheresByName = new Map(
    spheres.active.map((sphere) => [normalizeName(sphere.name), sphere.id]),
  );
  const directions = [...storedDirections];
  const directionsByName = new Map<string, Direction>();
  let createdDirections = 0;
  let reusedDirections = 0;

  for (const definition of DEMO_DIRECTIONS) {
    const key = normalizeName(definition.name);
    const active = directions.find(
      (direction) =>
        normalizeName(direction.name) === key && direction.status === DIRECTION_STATUS.active,
    );
    if (active !== undefined) {
      directionsByName.set(key, active);
      reusedDirections += 1;
      continue;
    }

    const archived = directions.find((direction) => normalizeName(direction.name) === key);
    if (archived !== undefined) {
      const restored = await application.restoreDirection.execute({
        id: archived.id,
        expectedVersion: archived.version,
      });
      if (!restored.ok) throw demoSeedError('restore Direction', definition.name, restored.error);
      directionsByName.set(key, restored.value);
      directions.push(restored.value);
      reusedDirections += 1;
      continue;
    }

    const sphereId = requireSphere(activeSpheresByName, definition.sphereName);
    const created = await application.createDirection.execute({
      sphereId,
      name: definition.name,
    });
    if (!created.ok) throw demoSeedError('create Direction', definition.name, created.error);
    directionsByName.set(key, created.value);
    directions.push(created.value);
    createdDirections += 1;
  }

  const existingGoalTitles = new Set(
    (await application.getGoals.execute()).map((goal) => normalizeName(goal.title)),
  );
  let createdGoals = 0;
  let reusedGoals = 0;

  for (const definition of DEMO_GOALS) {
    const titleKey = normalizeName(definition.input.title);
    if (existingGoalTitles.has(titleKey)) {
      reusedGoals += 1;
      continue;
    }

    const direction = directionsByName.get(normalizeName(definition.directionName));
    if (direction === undefined) {
      throw new Error(`DEV Goal Album seed: Direction «${definition.directionName}» не найден.`);
    }
    const created = await application.createGoal.execute({
      ...definition.input,
      directionId: direction.id,
    });
    if (!created.ok) throw demoSeedError('create Goal', definition.input.title, created.error);
    existingGoalTitles.add(titleKey);
    createdGoals += 1;
  }

  const persistedGoalTitles = new Set(
    (await application.getGoals.execute()).map((goal) => normalizeName(goal.title)),
  );
  const verifiedGoals = DEMO_GOALS.filter((definition) =>
    persistedGoalTitles.has(normalizeName(definition.input.title)),
  ).length;
  if (verifiedGoals !== DEMO_GOALS.length) {
    throw new Error(
      `DEV Goal Album seed: сохранено ${verifiedGoals} из ${DEMO_GOALS.length} демонстрационных целей.`,
    );
  }

  return { createdDirections, reusedDirections, createdGoals, reusedGoals, verifiedGoals };
}

function requireSphere(
  spheresByName: ReadonlyMap<string, EntityId>,
  sphereName: DemoDirectionDefinition['sphereName'],
): EntityId {
  const sphereId = spheresByName.get(normalizeName(sphereName));
  if (sphereId === undefined) {
    throw new Error(`DEV Goal Album seed: активная сфера «${sphereName}» не найдена.`);
  }
  return sphereId;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ru-RU');
}

function demoSeedError(action: string, subject: string, error: Error): Error {
  return new Error(`DEV Goal Album seed: не удалось ${action} «${subject}»: ${error.message}`);
}
