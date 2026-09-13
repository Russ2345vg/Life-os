import { describe, expect, it } from 'vitest';
import {
  Direction,
  EntityId,
  Goal,
  GOAL_HORIZON,
  GOAL_INTENTION_LEVEL,
  GOAL_PROGRESS_TYPE,
  GOAL_STAGE,
  GOAL_STATUS,
  Sphere,
} from '../../domain';
import { buildGoalDetailModel, replaceGoalDetailModelGoal } from './goalDetailPresentation';

const NOW = new Date('2026-08-24T09:00:00.000Z');

function buildContext() {
  const sphere = Sphere.create({
    id: EntityId.create('sphere-home'),
    name: 'Дом',
    now: NOW,
  });
  const direction = Direction.create({
    id: EntityId.create('direction-home'),
    sphereId: sphere.id,
    name: 'Среда жизни',
    now: NOW,
  });
  return { direction, sphere };
}

describe('Goal detail presentation', () => {
  it('maps every real Goal field and derives Direction then Sphere', () => {
    const { direction, sphere } = buildContext();
    const goal = Goal.create({
      id: EntityId.create('goal-home'),
      directionId: direction.id,
      title: 'Собственный дом',
      description: 'Пространство для спокойной семейной жизни.',
      whyImportant: 'Это даёт семье устойчивость.',
      whyNow: 'Есть ресурсы начать подготовку.',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: GOAL_INTENTION_LEVEL.commit,
      horizon: GOAL_HORIZON.oneToThreeYears,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 68, target: 100, unit: '%' },
      achievementCriteria: 'Дом введён в эксплуатацию.',
      nextProgress: 'Подготовить финансовую модель.',
      now: NOW,
    });

    expect(
      buildGoalDetailModel({
        goal,
        directions: [direction],
        spheres: { active: [sphere], archived: [] },
      }),
    ).toMatchObject({
      goal,
      id: 'goal-home',
      title: 'Собственный дом',
      description: 'Пространство для спокойной семейной жизни.',
      directionLabel: 'Среда жизни',
      sphereLabel: 'Дом',
      statusLabel: 'Активная',
      stageLabel: 'Активная цель',
      intentionLabel: 'Обязуюсь',
      horizonLabel: '1–3 года',
      progressTypeLabel: 'Измеримый',
      progress: { kind: 'metric', percent: 68 },
      whyImportant: 'Это даёт семье устойчивость.',
      whyNow: 'Есть ресурсы начать подготовку.',
      achievementCriteria: 'Дом введён в эксплуатацию.',
      nextProgress: 'Подготовить финансовую модель.',
      createdAtLabel: '24.08.2026',
      updatedAtLabel: '24.08.2026',
    });
  });

  it('uses human empty states and never exposes null values', () => {
    const goal = Goal.create({
      id: EntityId.create('goal-idea'),
      title: 'Идея без направления',
      now: NOW,
    });

    const model = buildGoalDetailModel({
      goal,
      directions: [],
      spheres: { active: [], archived: [] },
    });

    expect(model).toMatchObject({
      directionLabel: 'Без направления',
      sphereLabel: 'Без сферы',
      intentionLabel: 'Не задан',
      horizonLabel: 'Горизонт не задан',
      progressTypeLabel: 'Не задан',
      progress: { kind: 'none', label: 'Прогресс не задан' },
      whyImportant: 'Почему это важно пока не указано',
      whyNow: 'Почему сейчас пока не указано',
      achievementCriteria: 'Критерий пока не задан',
      nextProgress: 'Следующее продвижение пока не задано',
    });
    expect([
      model.directionLabel,
      model.sphereLabel,
      model.intentionLabel,
      model.horizonLabel,
      model.progressTypeLabel,
      model.whyImportant,
      model.whyNow,
      model.achievementCriteria,
      model.nextProgress,
    ]).not.toContain(null);
  });

  it('replaces the Goal after archive and refreshes mutable labels without losing context', () => {
    const { direction, sphere } = buildContext();
    const goal = Goal.create({
      id: EntityId.create('goal-home'),
      directionId: direction.id,
      title: 'Собственный дом',
      now: NOW,
    });
    const model = buildGoalDetailModel({
      goal,
      directions: [direction],
      spheres: { active: [sphere], archived: [] },
    });
    const archived = goal.archive(new Date('2026-08-25T09:00:00.000Z'));

    expect(replaceGoalDetailModelGoal(model, archived)).toMatchObject({
      goal: archived,
      statusLabel: 'Архивная',
      updatedAtLabel: '25.08.2026',
      directionLabel: 'Среда жизни',
      sphereLabel: 'Дом',
    });
  });
});
