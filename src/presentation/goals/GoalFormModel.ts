import {
  DIRECTION_STATUS,
  EntityId,
  GOAL_HORIZON,
  GOAL_INTENTION_LEVEL,
  GOAL_PROGRESS_TYPE,
  GOAL_QUALITATIVE_STAGE,
  GOAL_STAGE,
  GOAL_STATUS,
  MAX_GOAL_ACHIEVEMENT_CRITERIA_LENGTH,
  MAX_GOAL_NEXT_PROGRESS_LENGTH,
  MAX_GOAL_TITLE_LENGTH,
  MAX_GOAL_WHY_LENGTH,
  type Direction,
  type Goal,
  type GoalCoverImage,
  type GoalCreationStatus,
  type GoalEditableStatus,
  type GoalHorizon,
  type GoalIntentionLevel,
  type GoalProgress,
  type GoalQualitativeStage,
  type GoalStage,
  type GoalStatus,
  type Sphere,
} from '../../domain';
import {
  buildGoalProgressView,
  goalHorizonLabel,
  goalStageLabel,
  goalStatusLabel,
  type GoalCardViewModel,
} from './goalAlbumPresentation';

const MAX_PROGRESS_UNIT_LENGTH = 40;

export type GoalFormMode = 'create' | 'edit';

export type GoalProgressDraft =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'metric';
      readonly current: string;
      readonly target: string;
      readonly unit: string;
    }
  | { readonly kind: 'milestones'; readonly completed: string; readonly total: string }
  | { readonly kind: 'qualitative'; readonly stage: GoalQualitativeStage };

export interface GoalFormDraft {
  readonly description?: string;
  readonly sphereId?: string | null;
  readonly preservesUnassignedActive?: boolean;
  readonly title: string;
  readonly whyImportant: string;
  readonly whyNow: string;
  readonly directionId: string | null;
  readonly stage: GoalStage;
  readonly intentionLevel: GoalIntentionLevel | null;
  readonly horizon: GoalHorizon | null;
  readonly progress: GoalProgressDraft;
  readonly achievementCriteria: string;
  readonly nextProgress: string;
  readonly coverImage: GoalCoverImage | null;
}

export interface GoalFormValues {
  readonly description?: string | null;
  readonly sphereId?: EntityId | null;
  readonly title: string;
  readonly whyImportant: string | null;
  readonly whyNow: string | null;
  readonly directionId: EntityId | null;
  readonly status: GoalCreationStatus | GoalEditableStatus;
  readonly stage: GoalStage;
  readonly intentionLevel: GoalIntentionLevel | null;
  readonly horizon: GoalHorizon | null;
  readonly progress: GoalProgress | null;
  readonly achievementCriteria: string | null;
  readonly nextProgress: string | null;
  readonly coverImage: GoalCoverImage | null;
}

export type GoalFormField =
  | 'description'
  | 'title'
  | 'whyImportant'
  | 'whyNow'
  | 'directionId'
  | 'stage'
  | 'progressCurrent'
  | 'progressTarget'
  | 'progressUnit'
  | 'progressCompleted'
  | 'progressTotal'
  | 'achievementCriteria'
  | 'nextProgress';

export type GoalFormErrors = Partial<Record<GoalFormField, string>>;

export type GoalFormValidation =
  | { readonly ok: true; readonly values: GoalFormValues }
  | {
      readonly ok: false;
      readonly errors: GoalFormErrors;
      readonly firstInvalidField: GoalFormField;
    };

export interface GoalDirectionOption {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

export interface GoalDirectionOptionGroup {
  readonly sphereId: string | null;
  readonly sphereName: string;
  readonly options: readonly GoalDirectionOption[];
}

export function createEmptyGoalFormDraft(): GoalFormDraft {
  return {
    title: '',
    description: '',
    sphereId: null,
    whyImportant: '',
    whyNow: '',
    directionId: null,
    stage: GOAL_STAGE.idea,
    intentionLevel: null,
    horizon: null,
    progress: { kind: 'metric', current: '0', target: '100', unit: '%' },
    achievementCriteria: '',
    nextProgress: '',
    coverImage: null,
  };
}

export function createGoalFormDraft(goal: Goal): GoalFormDraft {
  return {
    title: goal.title,
    description: goal.description ?? '',
    sphereId: goal.sphereId?.toString() ?? null,
    preservesUnassignedActive:
      (goal.status === 'active' || goal.status === 'paused') && goal.directionId === null,
    whyImportant: goal.whyImportant ?? '',
    whyNow: goal.whyNow ?? '',
    directionId: goal.directionId?.toString() ?? null,
    stage: goal.stage,
    intentionLevel: goal.intentionLevel,
    horizon: goal.horizon,
    progress: progressDraftFromGoal(goal.progress),
    achievementCriteria: goal.achievementCriteria ?? '',
    nextProgress: goal.nextProgress ?? '',
    coverImage: goal.coverImage,
  };
}

export function statusForStage(stage: GoalStage): Exclude<GoalStatus, typeof GOAL_STATUS.archived> {
  switch (stage) {
    case GOAL_STAGE.idea:
    case GOAL_STAGE.intention:
      return GOAL_STATUS.future;
    case GOAL_STAGE.activeGoal:
      return GOAL_STATUS.active;
    case GOAL_STAGE.achieved:
      return GOAL_STATUS.achieved;
  }
}

export function validateGoalForm(draft: GoalFormDraft, mode: GoalFormMode): GoalFormValidation {
  const errors: GoalFormErrors = {};
  const title = draft.title.trim().replace(/\s+/gu, ' ');
  if (title.length === 0) errors.title = 'Название цели обязательно.';
  else if (title.length > MAX_GOAL_TITLE_LENGTH) {
    errors.title = `Название цели не должно превышать ${MAX_GOAL_TITLE_LENGTH} символов.`;
  }

  validateOptionalLength(draft.description ?? '', 4000, 'description', errors);
  validateOptionalLength(draft.whyImportant, MAX_GOAL_WHY_LENGTH, 'whyImportant', errors);
  validateOptionalLength(draft.whyNow, MAX_GOAL_WHY_LENGTH, 'whyNow', errors);

  const status = statusForStage(draft.stage);
  const directionId =
    draft.directionId === null || draft.directionId.trim().length === 0
      ? null
      : draft.directionId.trim();
  if (mode === 'create' && draft.stage === GOAL_STAGE.achieved) {
    errors.stage = 'Стадия «Достигнута» доступна только при редактировании.';
  }
  if (
    status === GOAL_STATUS.active &&
    directionId === null &&
    !(mode === 'edit' && draft.preservesUnassignedActive)
  ) {
    errors.directionId = 'Активной цели необходимо направление.';
  }

  const progress = validateProgress(draft.progress, errors);
  validateOptionalLength(
    draft.achievementCriteria,
    MAX_GOAL_ACHIEVEMENT_CRITERIA_LENGTH,
    'achievementCriteria',
    errors,
  );
  validateOptionalLength(draft.nextProgress, MAX_GOAL_NEXT_PROGRESS_LENGTH, 'nextProgress', errors);

  const firstInvalidField = FIRST_FIELDS.find((field) => errors[field] !== undefined);
  if (firstInvalidField !== undefined) return { ok: false, errors, firstInvalidField };

  return {
    ok: true,
    values: {
      title,
      ...(draft.description === undefined
        ? {}
        : { description: normalizeOptionalText(draft.description) }),
      ...(draft.sphereId === undefined
        ? {}
        : { sphereId: draft.sphereId ? EntityId.create(draft.sphereId) : null }),
      whyImportant: normalizeOptionalText(draft.whyImportant),
      whyNow: normalizeOptionalText(draft.whyNow),
      directionId: directionId === null ? null : EntityId.create(directionId),
      status,
      stage: draft.stage,
      intentionLevel: draft.intentionLevel,
      horizon: draft.horizon,
      progress,
      achievementCriteria: normalizeOptionalText(draft.achievementCriteria),
      nextProgress: normalizeOptionalText(draft.nextProgress),
      coverImage: draft.coverImage,
    },
  };
}

export function buildGoalDirectionOptionGroups(
  directions: readonly Direction[],
  spheres: { readonly active: readonly Sphere[]; readonly archived: readonly Sphere[] },
  currentDirectionId: string | null = null,
): readonly GoalDirectionOptionGroup[] {
  const spheresById = new Map(
    [...spheres.active, ...spheres.archived].map(
      (sphere) => [sphere.id.toString(), sphere] as const,
    ),
  );
  const groups = new Map<
    string,
    {
      readonly sphereId: string | null;
      readonly sphereName: string;
      options: GoalDirectionOption[];
    }
  >();

  for (const direction of directions) {
    const id = direction.id.toString();
    const isCurrentArchived =
      direction.status === DIRECTION_STATUS.archived && id === currentDirectionId;
    if (direction.status !== DIRECTION_STATUS.active && id !== currentDirectionId) continue;
    const sphereId = direction.sphereId?.toString() ?? null;
    const sphere = sphereId === null ? undefined : spheresById.get(sphereId);
    const groupId = sphere?.id.toString() ?? '__without-sphere__';
    const group = groups.get(groupId) ?? {
      sphereId: sphere?.id.toString() ?? null,
      sphereName: sphere?.name ?? 'Без сферы',
      options: [],
    };
    group.options.push({ id, name: direction.name, archived: isCurrentArchived });
    groups.set(groupId, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      options: [...group.options].sort(
        (left, right) =>
          Number(left.archived) - Number(right.archived) ||
          left.name.localeCompare(right.name, 'ru-RU'),
      ),
    }))
    .sort((left, right) => {
      if (left.sphereId === null) return 1;
      if (right.sphereId === null) return -1;
      return left.sphereName.localeCompare(right.sphereName, 'ru-RU');
    });
}

export function buildGoalFormPreview(
  draft: GoalFormDraft,
  directionGroups: readonly GoalDirectionOptionGroup[],
): GoalCardViewModel {
  const selected = directionGroups
    .flatMap((group) =>
      group.options.map((option) => ({
        option,
        sphereId: group.sphereId,
        sphereName: group.sphereName,
      })),
    )
    .find(({ option }) => option.id === draft.directionId);
  const status = statusForStage(draft.stage);
  const progress = previewProgress(draft.progress);

  return {
    id: 'goal-form-preview',
    title: draft.title.trim().length === 0 ? 'Название вашей цели' : draft.title.trim(),
    coverImageUrl: draft.coverImage?.dataUrl ?? null,
    direction:
      selected === undefined
        ? { kind: 'unassigned', label: 'Без направления' }
        : {
            kind: 'assigned',
            id: selected.option.id,
            name: selected.option.name,
            sphere:
              selected.sphereId === null
                ? null
                : { id: selected.sphereId, name: selected.sphereName },
          },
    status,
    statusLabel: goalStatusLabel(status),
    stageLabel: goalStageLabel(draft.stage),
    horizonLabel: goalHorizonLabel(draft.horizon),
    progress: buildGoalProgressView(progress),
    nextProgress:
      draft.nextProgress.trim().length === 0
        ? 'Следующее продвижение пока не задано'
        : draft.nextProgress.trim(),
    updatedAtMs: 0,
  };
}

const FIRST_FIELDS: readonly GoalFormField[] = [
  'title',
  'description',
  'whyImportant',
  'whyNow',
  'directionId',
  'stage',
  'progressCurrent',
  'progressTarget',
  'progressUnit',
  'progressCompleted',
  'progressTotal',
  'achievementCriteria',
  'nextProgress',
];

function progressDraftFromGoal(progress: GoalProgress | null): GoalProgressDraft {
  if (progress === null) return { kind: 'none' };
  switch (progress.type) {
    case GOAL_PROGRESS_TYPE.metric:
      return {
        kind: 'metric',
        current: String(progress.current),
        target: String(progress.target),
        unit: progress.unit,
      };
    case GOAL_PROGRESS_TYPE.milestones:
      return {
        kind: 'milestones',
        completed: String(progress.completed),
        total: String(progress.total),
      };
    case GOAL_PROGRESS_TYPE.qualitative:
      return { kind: 'qualitative', stage: progress.stage };
  }
}

function validateProgress(draft: GoalProgressDraft, errors: GoalFormErrors): GoalProgress | null {
  switch (draft.kind) {
    case 'none':
      return null;
    case 'metric': {
      const current = Number(draft.current);
      const target = Number(draft.target);
      const unit = draft.unit.trim();
      if (!Number.isFinite(current) || current < 0 || draft.current.trim().length === 0) {
        errors.progressCurrent = 'Текущее значение должно быть числом не меньше нуля.';
      }
      if (!Number.isFinite(target) || target <= 0 || draft.target.trim().length === 0) {
        errors.progressTarget = 'Целевое значение должно быть больше нуля.';
      }
      if (unit.length === 0 || unit.length > MAX_PROGRESS_UNIT_LENGTH) {
        errors.progressUnit = `Единица измерения обязательна и не длиннее ${MAX_PROGRESS_UNIT_LENGTH} символов.`;
      }
      return { type: GOAL_PROGRESS_TYPE.metric, current, target, unit };
    }
    case 'milestones': {
      const completed = Number(draft.completed);
      const total = Number(draft.total);
      if (
        !Number.isInteger(completed) ||
        completed < 0 ||
        draft.completed.trim().length === 0 ||
        (Number.isInteger(total) && completed > total)
      ) {
        errors.progressCompleted = 'Завершённые этапы — целое число от 0 до общего количества.';
      }
      if (!Number.isInteger(total) || total < 1 || draft.total.trim().length === 0) {
        errors.progressTotal = 'Общее количество этапов — целое число не меньше 1.';
      }
      return { type: GOAL_PROGRESS_TYPE.milestones, completed, total };
    }
    case 'qualitative':
      return { type: GOAL_PROGRESS_TYPE.qualitative, stage: draft.stage };
  }
}

function previewProgress(draft: GoalProgressDraft): GoalProgress | null {
  const errors: GoalFormErrors = {};
  const progress = validateProgress(draft, errors);
  return Object.keys(errors).length === 0 ? progress : null;
}

function validateOptionalLength(
  value: string,
  maximum: number,
  field: GoalFormField,
  errors: GoalFormErrors,
): void {
  if (value.trim().length > maximum) {
    errors[field] = `Текст не должен превышать ${maximum} символов.`;
  }
}

function normalizeOptionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export const GOAL_FORM_STAGE_OPTIONS = [
  GOAL_STAGE.idea,
  GOAL_STAGE.intention,
  GOAL_STAGE.activeGoal,
  GOAL_STAGE.achieved,
] as const;

export const GOAL_FORM_INTENTION_OPTIONS = [
  GOAL_INTENTION_LEVEL.want,
  GOAL_INTENTION_LEVEL.plan,
  GOAL_INTENTION_LEVEL.commit,
] as const;

export const GOAL_FORM_HORIZON_OPTIONS = [
  GOAL_HORIZON.now,
  GOAL_HORIZON.withinYear,
  GOAL_HORIZON.oneToThreeYears,
  GOAL_HORIZON.threeToFiveYears,
  GOAL_HORIZON.someday,
] as const;

export const GOAL_FORM_QUALITATIVE_OPTIONS = [
  GOAL_QUALITATIVE_STAGE.start,
  GOAL_QUALITATIVE_STAGE.moving,
  GOAL_QUALITATIVE_STAGE.close,
  GOAL_QUALITATIVE_STAGE.done,
] as const;
