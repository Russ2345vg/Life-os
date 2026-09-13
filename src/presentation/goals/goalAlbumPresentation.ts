import type { GoalAlbumSource } from './GoalAlbumLoader';
import {
  GOAL_HORIZON,
  GOAL_PROGRESS_TYPE,
  GOAL_QUALITATIVE_STAGE,
  GOAL_STAGE,
  GOAL_STATUS,
  type Direction,
  type Goal,
  type GoalHorizon,
  type GoalProgress,
  type GoalQualitativeStage,
  type GoalStage,
  type GoalStatus,
  type Sphere,
} from '../../domain';

export type { GoalAlbumSource } from './GoalAlbumLoader';

export type GoalAlbumFilter = 'all' | GoalStatus;
export type GoalAlbumViewMode = 'grid' | 'by-direction';

export interface GoalAlbumCounts {
  readonly active: number;
  readonly future: number;
  readonly achieved: number;
  readonly total: number;
}

export type GoalAlbumProgressView =
  | { readonly kind: 'none'; readonly label: 'Прогресс не задан' }
  | {
      readonly kind: 'metric';
      readonly label: string;
      readonly percent: number;
      readonly current: number;
      readonly target: number;
      readonly unit: string;
    }
  | {
      readonly kind: 'milestones';
      readonly label: string;
      readonly percent: number;
      readonly completed: number;
      readonly total: number;
    }
  | {
      readonly kind: 'qualitative';
      readonly label: 'Начало' | 'В движении' | 'Близко' | 'Готово';
    };

export type GoalCardDirectionView =
  | {
      readonly kind: 'assigned';
      readonly id: string;
      readonly name: string;
      readonly sphere: { readonly id: string; readonly name: string } | null;
    }
  | { readonly kind: 'unassigned'; readonly label: 'Без направления' }
  | { readonly kind: 'missing'; readonly label: 'Направление недоступно' };

export interface GoalCardViewModel {
  readonly id: string;
  readonly title: string;
  readonly coverImageUrl: string | null;
  readonly direction: GoalCardDirectionView;
  readonly status: GoalStatus;
  readonly statusLabel: string;
  readonly stageLabel: string;
  readonly horizonLabel: string;
  readonly progress: GoalAlbumProgressView;
  readonly nextProgress: string;
  readonly updatedAtMs: number;
}

export interface GoalAlbumModel {
  readonly counts: GoalAlbumCounts;
  readonly cards: readonly GoalCardViewModel[];
}

export interface GoalAlbumDirectionGroup {
  readonly id: string;
  readonly name: string;
  readonly goals: readonly GoalCardViewModel[];
}

export interface GoalAlbumSphereGroup {
  readonly id: string;
  readonly name: string;
  readonly directions: readonly GoalAlbumDirectionGroup[];
}

export interface GoalAlbumGroups {
  readonly spheres: readonly GoalAlbumSphereGroup[];
  readonly withoutSphere: readonly GoalAlbumDirectionGroup[];
  readonly withoutDirection: readonly GoalCardViewModel[];
  readonly missingDirection: readonly GoalCardViewModel[];
}

export function buildGoalAlbumModel(source: GoalAlbumSource): GoalAlbumModel {
  const directionsById = new Map<string, Direction>(
    source.directions.map((direction) => [direction.id.toString(), direction]),
  );
  const spheresById = new Map<string, Sphere>(
    [...source.spheres.active, ...source.spheres.archived].map((sphere) => [
      sphere.id.toString(),
      sphere,
    ]),
  );

  return {
    counts: countGoals(source.goals),
    cards: [...source.goals]
      .map((goal) => buildGoalCardViewModel(goal, directionsById, spheresById))
      .sort(compareCards),
  };
}

export function selectGoalAlbumCards(
  cards: readonly GoalCardViewModel[],
  filter: GoalAlbumFilter,
): readonly GoalCardViewModel[] {
  return cards.filter((card) =>
    filter === 'all' ? card.status !== GOAL_STATUS.archived : card.status === filter,
  );
}

export function groupGoalAlbumCards(cards: readonly GoalCardViewModel[]): GoalAlbumGroups {
  const spheres = new Map<string, SphereBucket>();
  const withoutSphere = new Map<string, DirectionBucket>();
  const withoutDirection: GoalCardViewModel[] = [];
  const missingDirection: GoalCardViewModel[] = [];

  for (const card of cards) {
    if (card.direction.kind === 'unassigned') {
      withoutDirection.push(card);
      continue;
    }
    if (card.direction.kind === 'missing') {
      missingDirection.push(card);
      continue;
    }

    const { direction } = card;
    if (direction.sphere === null) {
      addToDirectionBucket(withoutSphere, direction, card);
      continue;
    }
    const sphere = getOrCreateSphereBucket(spheres, direction.sphere);
    addToDirectionBucket(sphere.directions, direction, card);
  }

  return {
    spheres: [...spheres.values()].sort(compareNamed).map((sphere) => ({
      id: sphere.id,
      name: sphere.name,
      directions: toSortedDirectionGroups(sphere.directions),
    })),
    withoutSphere: toSortedDirectionGroups(withoutSphere),
    withoutDirection: [...withoutDirection].sort(compareCards),
    missingDirection: [...missingDirection].sort(compareCards),
  };
}

interface DirectionBucket {
  readonly id: string;
  readonly name: string;
  readonly goals: GoalCardViewModel[];
}

interface SphereBucket {
  readonly id: string;
  readonly name: string;
  readonly directions: Map<string, DirectionBucket>;
}

function countGoals(goals: readonly Goal[]): GoalAlbumCounts {
  let active = 0;
  let future = 0;
  let achieved = 0;
  let paused = 0;

  for (const goal of goals) {
    switch (goal.status) {
      case GOAL_STATUS.active:
        active += 1;
        break;
      case GOAL_STATUS.future:
        future += 1;
        break;
      case GOAL_STATUS.achieved:
        achieved += 1;
        break;
      case GOAL_STATUS.paused:
        paused += 1;
        break;
      case GOAL_STATUS.archived:
        break;
      default:
        assertNever(goal.status);
    }
  }

  return { active, future, achieved, total: active + future + achieved + paused };
}

export function buildGoalCardViewModel(
  goal: Goal,
  directionsById: ReadonlyMap<string, Direction>,
  spheresById: ReadonlyMap<string, Sphere>,
): GoalCardViewModel {
  return {
    id: goal.id.toString(),
    title: goal.title,
    coverImageUrl: goal.coverImage?.dataUrl ?? null,
    direction: toDirectionView(goal, directionsById, spheresById),
    status: goal.status,
    statusLabel: goalStatusLabel(goal.status),
    stageLabel: goalStageLabel(goal.stage),
    horizonLabel: goalHorizonLabel(goal.horizon),
    progress: buildGoalProgressView(goal.progress),
    nextProgress: goal.nextProgress ?? 'Следующий шаг не задан',
    updatedAtMs: goal.updatedAt.getTime(),
  };
}

function toDirectionView(
  goal: Goal,
  directionsById: ReadonlyMap<string, Direction>,
  spheresById: ReadonlyMap<string, Sphere>,
): GoalCardDirectionView {
  if (goal.directionId === null) {
    return { kind: 'unassigned', label: 'Без направления' };
  }
  const direction = directionsById.get(goal.directionId.toString());
  if (direction === undefined) {
    return { kind: 'missing', label: 'Направление недоступно' };
  }
  const sphere =
    direction.sphereId === null ? null : spheresById.get(direction.sphereId.toString());

  return {
    kind: 'assigned',
    id: direction.id.toString(),
    name: direction.name,
    sphere:
      sphere === undefined || sphere === null
        ? null
        : { id: sphere.id.toString(), name: sphere.name },
  };
}

export function buildGoalProgressView(progress: GoalProgress | null): GoalAlbumProgressView {
  if (progress === null) return { kind: 'none', label: 'Прогресс не задан' };

  switch (progress.type) {
    case GOAL_PROGRESS_TYPE.metric:
      return {
        kind: 'metric',
        label: `${progress.current} из ${progress.target} ${progress.unit}`,
        percent: cappedPercent(progress.current, progress.target),
        current: progress.current,
        target: progress.target,
        unit: progress.unit,
      };
    case GOAL_PROGRESS_TYPE.milestones:
      return {
        kind: 'milestones',
        label: `${progress.completed} из ${progress.total}`,
        percent: cappedPercent(progress.completed, progress.total),
        completed: progress.completed,
        total: progress.total,
      };
    case GOAL_PROGRESS_TYPE.qualitative:
      return { kind: 'qualitative', label: qualitativeProgressLabel(progress.stage) };
    default:
      return assertNever(progress);
  }
}

function cappedPercent(current: number, target: number): number {
  return Math.min(100, Math.max(0, (current / target) * 100));
}

export function goalStatusLabel(status: GoalStatus): string {
  switch (status) {
    case GOAL_STATUS.paused:
      return 'На паузе';
    case GOAL_STATUS.active:
      return 'Активная';
    case GOAL_STATUS.future:
      return 'Будущая';
    case GOAL_STATUS.achieved:
      return 'Достигнута';
    case GOAL_STATUS.archived:
      return 'Архивная';
    default:
      return assertNever(status);
  }
}

export function goalStageLabel(stage: GoalStage): string {
  switch (stage) {
    case GOAL_STAGE.idea:
      return 'Идея';
    case GOAL_STAGE.intention:
      return 'Намерение';
    case GOAL_STAGE.activeGoal:
      return 'Активная цель';
    case GOAL_STAGE.achieved:
      return 'Достигнута';
    default:
      return assertNever(stage);
  }
}

export function goalHorizonLabel(horizon: GoalHorizon | null): string {
  if (horizon === null) return 'Горизонт не задан';
  switch (horizon) {
    case GOAL_HORIZON.now:
      return 'Сейчас';
    case GOAL_HORIZON.withinYear:
      return 'В течение года';
    case GOAL_HORIZON.oneToThreeYears:
      return '1–3 года';
    case GOAL_HORIZON.threeToFiveYears:
      return '3–5 лет';
    case GOAL_HORIZON.someday:
      return 'Когда-нибудь';
    default:
      return assertNever(horizon);
  }
}

export function qualitativeProgressLabel(
  stage: GoalQualitativeStage,
): Extract<GoalAlbumProgressView, { readonly kind: 'qualitative' }>['label'] {
  switch (stage) {
    case GOAL_QUALITATIVE_STAGE.start:
      return 'Начало';
    case GOAL_QUALITATIVE_STAGE.moving:
      return 'В движении';
    case GOAL_QUALITATIVE_STAGE.close:
      return 'Близко';
    case GOAL_QUALITATIVE_STAGE.done:
      return 'Готово';
    default:
      return assertNever(stage);
  }
}

function addToDirectionBucket(
  buckets: Map<string, DirectionBucket>,
  direction: Extract<GoalCardDirectionView, { readonly kind: 'assigned' }>,
  card: GoalCardViewModel,
): void {
  const existing = buckets.get(direction.id);
  if (existing !== undefined) {
    existing.goals.push(card);
    return;
  }
  buckets.set(direction.id, { id: direction.id, name: direction.name, goals: [card] });
}

function getOrCreateSphereBucket(
  buckets: Map<string, SphereBucket>,
  sphere: { readonly id: string; readonly name: string },
): SphereBucket {
  const existing = buckets.get(sphere.id);
  if (existing !== undefined) return existing;
  const bucket = {
    id: sphere.id,
    name: sphere.name,
    directions: new Map<string, DirectionBucket>(),
  };
  buckets.set(sphere.id, bucket);
  return bucket;
}

function toSortedDirectionGroups(
  buckets: ReadonlyMap<string, DirectionBucket>,
): readonly GoalAlbumDirectionGroup[] {
  return [...buckets.values()].sort(compareNamed).map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    goals: [...bucket.goals].sort(compareCards),
  }));
}

function compareCards(left: GoalCardViewModel, right: GoalCardViewModel): number {
  return (
    right.updatedAtMs - left.updatedAtMs ||
    left.title.localeCompare(right.title, 'ru') ||
    left.id.localeCompare(right.id, 'ru')
  );
}

function compareNamed(left: { readonly name: string }, right: { readonly name: string }): number {
  return left.name.localeCompare(right.name, 'ru');
}

function assertNever(value: never): never {
  throw new Error(`Unexpected goal album value: ${String(value)}`);
}
