import {
  GOAL_INTENTION_LEVEL,
  GOAL_PROGRESS_TYPE,
  type Direction,
  type Goal,
  type GoalIntentionLevel,
  type Sphere,
} from '../../domain';
import {
  buildGoalProgressView,
  goalHorizonLabel,
  goalStageLabel,
  goalStatusLabel,
  type GoalAlbumProgressView,
} from './goalAlbumPresentation';
import type { GoalDetailSource } from './GoalDetailLoader';

export interface GoalDetailModel {
  readonly goal: Goal;
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly coverImageUrl: string | null;
  readonly directionLabel: string;
  readonly sphereLabel: string;
  readonly statusLabel: string;
  readonly stageLabel: string;
  readonly intentionLabel: string;
  readonly horizonLabel: string;
  readonly progressTypeLabel: string;
  readonly progress: GoalAlbumProgressView;
  readonly whyImportant: string;
  readonly whyNow: string;
  readonly achievementCriteria: string;
  readonly nextProgress: string;
  readonly createdAtLabel: string;
  readonly updatedAtLabel: string;
}

export function buildGoalDetailModel(
  source: GoalDetailSource & { readonly goal: Goal },
): GoalDetailModel {
  const directionsById = new Map<string, Direction>(
    source.directions.map((direction) => [direction.id.toString(), direction]),
  );
  const spheresById = new Map<string, Sphere>(
    [...source.spheres.active, ...source.spheres.archived].map((sphere) => [
      sphere.id.toString(),
      sphere,
    ]),
  );
  const relation = resolveRelation(source.goal, directionsById, spheresById);

  return {
    goal: source.goal,
    id: source.goal.id.toString(),
    title: source.goal.title,
    description: source.goal.description,
    coverImageUrl: source.goal.coverImage?.dataUrl ?? null,
    directionLabel: relation.directionLabel,
    sphereLabel: relation.sphereLabel,
    statusLabel: goalStatusLabel(source.goal.status),
    stageLabel: goalStageLabel(source.goal.stage),
    intentionLabel: intentionLabel(source.goal.intentionLevel),
    horizonLabel: goalHorizonLabel(source.goal.horizon),
    progressTypeLabel: progressTypeLabel(source.goal.progressType),
    progress: buildGoalProgressView(source.goal.progress),
    whyImportant: source.goal.whyImportant ?? 'Почему это важно пока не указано',
    whyNow: source.goal.whyNow ?? 'Почему сейчас пока не указано',
    achievementCriteria: source.goal.achievementCriteria ?? 'Критерий пока не задан',
    nextProgress: source.goal.nextProgress ?? 'Следующее продвижение пока не задано',
    createdAtLabel: formatGoalDate(source.goal.createdAt),
    updatedAtLabel: formatGoalDate(source.goal.updatedAt),
  };
}

export function replaceGoalDetailModelGoal(model: GoalDetailModel, goal: Goal): GoalDetailModel {
  return {
    ...model,
    goal,
    id: goal.id.toString(),
    title: goal.title,
    description: goal.description,
    coverImageUrl: goal.coverImage?.dataUrl ?? null,
    statusLabel: goalStatusLabel(goal.status),
    stageLabel: goalStageLabel(goal.stage),
    intentionLabel: intentionLabel(goal.intentionLevel),
    horizonLabel: goalHorizonLabel(goal.horizon),
    progressTypeLabel: progressTypeLabel(goal.progressType),
    progress: buildGoalProgressView(goal.progress),
    whyImportant: goal.whyImportant ?? 'Почему это важно пока не указано',
    whyNow: goal.whyNow ?? 'Почему сейчас пока не указано',
    achievementCriteria: goal.achievementCriteria ?? 'Критерий пока не задан',
    nextProgress: goal.nextProgress ?? 'Следующее продвижение пока не задано',
    createdAtLabel: formatGoalDate(goal.createdAt),
    updatedAtLabel: formatGoalDate(goal.updatedAt),
  };
}

function resolveRelation(
  goal: Goal,
  directionsById: ReadonlyMap<string, Direction>,
  spheresById: ReadonlyMap<string, Sphere>,
): { readonly directionLabel: string; readonly sphereLabel: string } {
  if (goal.directionId === null) {
    return {
      directionLabel: 'Без направления',
      sphereLabel:
        goal.sphereId === null
          ? 'Без сферы'
          : (spheresById.get(goal.sphereId.toString())?.name ?? 'Сфера недоступна'),
    };
  }
  const direction = directionsById.get(goal.directionId.toString());
  if (direction === undefined) {
    return { directionLabel: 'Направление недоступно', sphereLabel: 'Без сферы' };
  }
  const sphere =
    direction.sphereId === null ? undefined : spheresById.get(direction.sphereId.toString());
  return {
    directionLabel: direction.name,
    sphereLabel: sphere?.name ?? 'Без сферы',
  };
}

function intentionLabel(value: GoalIntentionLevel | null): string {
  switch (value) {
    case GOAL_INTENTION_LEVEL.want:
      return 'Хочу';
    case GOAL_INTENTION_LEVEL.plan:
      return 'Планирую';
    case GOAL_INTENTION_LEVEL.commit:
      return 'Обязуюсь';
    case null:
      return 'Не задан';
  }
}

function progressTypeLabel(value: Goal['progressType']): string {
  switch (value) {
    case GOAL_PROGRESS_TYPE.metric:
      return 'Измеримый';
    case GOAL_PROGRESS_TYPE.milestones:
      return 'Этапный';
    case GOAL_PROGRESS_TYPE.qualitative:
      return 'Качественный';
    case null:
      return 'Не задан';
  }
}

function formatGoalDate(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${value.getFullYear()}`;
}
