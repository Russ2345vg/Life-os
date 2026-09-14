import { DayDate } from '../day/DayDate';
import { validateMeasurement, type GoalMeasurement } from '../planner/GoalMeasurement';
import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { MAX_GOAL_COVER_IMAGE_BYTES, type GoalCoverImage } from './GoalCoverImage';
import { isGoalHorizon, type GoalHorizon } from './GoalHorizon';
import { isGoalIntentionLevel, type GoalIntentionLevel } from './GoalIntentionLevel';
import {
  GOAL_PROGRESS_TYPE,
  isGoalProgressType,
  isGoalQualitativeStage,
  type GoalProgress,
  type GoalProgressType,
} from './GoalProgress';
import { GOAL_STAGE, isGoalStage, type GoalStage } from './GoalStage';
import { GOAL_STATUS, isGoalStatus, type GoalStatus } from './GoalStatus';

export const MAX_GOAL_TITLE_LENGTH = 200;
export const MAX_GOAL_DESCRIPTION_LENGTH = 4_000;
export const MAX_GOAL_WHY_LENGTH = 2_000;
export const MAX_GOAL_ACHIEVEMENT_CRITERIA_LENGTH = 2_000;
export const MAX_GOAL_NEXT_PROGRESS_LENGTH = 1_000;

export type GoalCreationStatus = typeof GOAL_STATUS.active | typeof GOAL_STATUS.future;
export type GoalEditableStatus = Exclude<GoalStatus, typeof GOAL_STATUS.archived>;

export interface GoalCreationData {
  readonly measurement?: GoalMeasurement | null;
  readonly dueDate?: string | null;
  readonly sphereId?: EntityId | null;
  readonly id: EntityId;
  readonly directionId?: EntityId | null;
  readonly title: string;
  readonly description?: string | null;
  readonly whyImportant?: string | null;
  readonly whyNow?: string | null;
  readonly status?: GoalCreationStatus;
  readonly stage?: GoalStage;
  readonly intentionLevel?: GoalIntentionLevel | null;
  readonly horizon?: GoalHorizon | null;
  readonly progress?: GoalProgress | null;
  readonly achievementCriteria?: string | null;
  readonly nextProgress?: string | null;
  readonly coverImage?: GoalCoverImage | null;
  readonly now: Date;
}

export interface GoalDetails {
  readonly measurement?: GoalMeasurement | null;
  readonly dueDate?: string | null;
  readonly sphereId?: EntityId | null;
  readonly directionId?: EntityId | null;
  readonly title: string;
  readonly description?: string | null;
  readonly whyImportant?: string | null;
  readonly whyNow?: string | null;
  readonly status?: GoalEditableStatus;
  readonly stage?: GoalStage;
  readonly intentionLevel?: GoalIntentionLevel | null;
  readonly horizon?: GoalHorizon | null;
  readonly progress?: GoalProgress | null;
  readonly achievementCriteria?: string | null;
  readonly nextProgress?: string | null;
  readonly coverImage?: GoalCoverImage | null;
}

export interface GoalRehydrationData {
  readonly measurement?: GoalMeasurement | null;
  readonly dueDate?: string | null;
  readonly sphereId?: EntityId | null;
  readonly isMain?: boolean;
  readonly legacyProjectId?: string | null;
  readonly nextActionId?: EntityId | null;
  readonly id: EntityId;
  readonly directionId: EntityId | null;
  readonly title: string;
  readonly description: string | null;
  readonly whyImportant: string | null;
  readonly whyNow: string | null;
  readonly status: GoalStatus;
  readonly stage: GoalStage;
  readonly intentionLevel: GoalIntentionLevel | null;
  readonly horizon: GoalHorizon | null;
  readonly progress: GoalProgress | null;
  readonly achievementCriteria: string | null;
  readonly nextProgress: string | null;
  readonly coverImage: GoalCoverImage | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly version: number;
}

export class Goal extends Entity {
  public readonly measurement: GoalMeasurement | null;
  public readonly dueDate: string | null;
  public readonly sphereId: EntityId | null;
  public readonly isMain: boolean;
  public readonly legacyProjectId: string | null;
  public readonly nextActionId: EntityId | null;
  public readonly directionId: EntityId | null;
  public readonly title: string;
  public readonly description: string | null;
  public readonly whyImportant: string | null;
  public readonly whyNow: string | null;
  public readonly status: GoalStatus;
  public readonly stage: GoalStage;
  public readonly intentionLevel: GoalIntentionLevel | null;
  public readonly horizon: GoalHorizon | null;
  public readonly progressType: GoalProgressType | null;
  public readonly progress: GoalProgress | null;
  public readonly achievementCriteria: string | null;
  public readonly nextProgress: string | null;
  public readonly coverImage: GoalCoverImage | null;
  public readonly version: number;
  readonly #createdAt: Date;
  readonly #updatedAt: Date;
  readonly #archivedAt: Date | null;

  private constructor(data: GoalRehydrationData) {
    super(data.id);
    this.measurement = validateMeasurement(data.measurement ?? null);
    this.dueDate = data.dueDate ?? null;
    if (this.dueDate !== null) DayDate.create(this.dueDate);
    this.sphereId = data.sphereId ?? null;
    this.isMain = data.isMain ?? false;
    this.legacyProjectId = data.legacyProjectId ?? null;
    this.nextActionId = data.nextActionId ?? null;
    if (typeof this.isMain !== 'boolean' || (this.isMain && data.status !== GOAL_STATUS.active)) {
      throw new DomainError('goal.invalid_main', 'Главной может быть только активная цель.');
    }
    this.directionId = data.directionId;
    this.title = normalizeGoalTitle(data.title);
    this.description = normalizeOptionalText(
      data.description,
      MAX_GOAL_DESCRIPTION_LENGTH,
      'goal.description_too_long',
    );
    this.whyImportant = normalizeOptionalText(
      data.whyImportant,
      MAX_GOAL_WHY_LENGTH,
      'goal.why_important_too_long',
    );
    this.whyNow = normalizeOptionalText(data.whyNow, MAX_GOAL_WHY_LENGTH, 'goal.why_now_too_long');
    assertStatus(data.status);
    assertStage(data.stage);
    assertOptionalIntentionLevel(data.intentionLevel);
    assertOptionalHorizon(data.horizon);
    this.progress = normalizeProgress(data.progress);
    this.progressType = this.progress?.type ?? null;
    this.achievementCriteria = normalizeOptionalText(
      data.achievementCriteria,
      MAX_GOAL_ACHIEVEMENT_CRITERIA_LENGTH,
      'goal.achievement_criteria_too_long',
    );
    this.nextProgress = normalizeOptionalText(
      data.nextProgress,
      MAX_GOAL_NEXT_PROGRESS_LENGTH,
      'goal.next_progress_too_long',
    );
    this.coverImage = normalizeCoverImage(data.coverImage);
    assertLifecycle(data);
    this.status = data.status;
    this.stage = data.stage;
    this.intentionLevel = data.intentionLevel;
    this.horizon = data.horizon;
    this.#createdAt = new Date(data.createdAt.getTime());
    this.#updatedAt = new Date(data.updatedAt.getTime());
    this.#archivedAt = copyOptionalDate(data.archivedAt);
    this.version = data.version;
  }

  public static create(data: GoalCreationData): Goal {
    const status: unknown = data.status === undefined ? GOAL_STATUS.future : data.status;
    if (status !== GOAL_STATUS.active && status !== GOAL_STATUS.future) {
      throw new DomainError('goal.invalid_initial_status', 'Новая цель имеет неверное состояние.');
    }
    const stage: unknown = data.stage === undefined ? GOAL_STAGE.idea : data.stage;
    assertStage(stage);
    return new Goal({
      measurement: data.measurement ?? null,
      dueDate: data.dueDate ?? null,
      id: data.id,
      sphereId: data.sphereId ?? null,
      directionId: data.directionId ?? null,
      title: data.title,
      description: data.description === undefined ? null : data.description,
      whyImportant: data.whyImportant === undefined ? null : data.whyImportant,
      whyNow: data.whyNow === undefined ? null : data.whyNow,
      status,
      stage,
      intentionLevel: data.intentionLevel === undefined ? null : data.intentionLevel,
      horizon: data.horizon === undefined ? null : data.horizon,
      progress: data.progress === undefined ? null : data.progress,
      achievementCriteria: data.achievementCriteria === undefined ? null : data.achievementCriteria,
      nextProgress: data.nextProgress === undefined ? null : data.nextProgress,
      coverImage: data.coverImage === undefined ? null : data.coverImage,
      createdAt: data.now,
      updatedAt: data.now,
      archivedAt: null,
      version: 1,
    });
  }

  public static rehydrate(data: GoalRehydrationData): Goal {
    return new Goal(data);
  }

  public update(details: GoalDetails, updatedAt: Date): Goal {
    if (this.status === GOAL_STATUS.archived) {
      throw new DomainError('goal.archived_is_immutable', 'Архивную цель нельзя изменить.');
    }
    return new Goal({
      ...this.toRehydrationData(),
      sphereId: details.sphereId === undefined ? this.sphereId : details.sphereId,
      directionId: details.directionId === undefined ? this.directionId : details.directionId,
      isMain:
        (details.status === undefined || details.status === GOAL_STATUS.active) &&
        (details.directionId === undefined ||
          details.directionId?.toString() === this.directionId?.toString())
          ? this.isMain
          : false,
      measurement: details.measurement === undefined ? this.measurement : details.measurement,
      dueDate: details.dueDate === undefined ? this.dueDate : details.dueDate,
      title: details.title,
      description: details.description === undefined ? this.description : details.description,
      whyImportant: details.whyImportant === undefined ? this.whyImportant : details.whyImportant,
      whyNow: details.whyNow === undefined ? this.whyNow : details.whyNow,
      status: details.status === undefined ? this.status : details.status,
      stage: details.stage === undefined ? this.stage : details.stage,
      intentionLevel:
        details.intentionLevel === undefined ? this.intentionLevel : details.intentionLevel,
      horizon: details.horizon === undefined ? this.horizon : details.horizon,
      progress: details.progress === undefined ? this.progress : details.progress,
      achievementCriteria:
        details.achievementCriteria === undefined
          ? this.achievementCriteria
          : details.achievementCriteria,
      nextProgress: details.nextProgress === undefined ? this.nextProgress : details.nextProgress,
      coverImage: details.coverImage === undefined ? this.coverImage : details.coverImage,
      updatedAt,
      version: this.version + 1,
    });
  }

  public archive(archivedAt: Date): Goal {
    if (this.status === GOAL_STATUS.archived) return this;
    return new Goal({
      ...this.toRehydrationData(),
      status: GOAL_STATUS.archived,
      isMain: false,
      updatedAt: archivedAt,
      archivedAt,
      version: this.version + 1,
    });
  }

  public selectNextAction(actionId: EntityId, updatedAt: Date): Goal {
    if (this.status === GOAL_STATUS.archived) {
      throw new DomainError('goal.archived_is_immutable', 'Архивную цель нельзя изменить.');
    }
    if (this.nextActionId?.equals(actionId)) return this;
    return new Goal({
      ...this.toRehydrationData(),
      nextActionId: actionId,
      updatedAt,
      version: this.version + 1,
    });
  }

  public get createdAt(): Date {
    return new Date(this.#createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this.#updatedAt.getTime());
  }

  public get archivedAt(): Date | null {
    return copyOptionalDate(this.#archivedAt);
  }

  private toRehydrationData(): GoalRehydrationData {
    return {
      measurement: this.measurement,
      dueDate: this.dueDate,
      sphereId: this.sphereId,
      isMain: this.isMain,
      legacyProjectId: this.legacyProjectId,
      nextActionId: this.nextActionId,
      id: this.id,
      directionId: this.directionId,
      title: this.title,
      description: this.description,
      whyImportant: this.whyImportant,
      whyNow: this.whyNow,
      status: this.status,
      stage: this.stage,
      intentionLevel: this.intentionLevel,
      horizon: this.horizon,
      progress: this.progress,
      achievementCriteria: this.achievementCriteria,
      nextProgress: this.nextProgress,
      coverImage: this.coverImage,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      archivedAt: this.archivedAt,
      version: this.version,
    };
  }
}

export function normalizeGoalTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new DomainError('goal.invalid_title', 'Название цели указано неверно.');
  }
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length === 0) {
    throw new DomainError('goal.title_required', 'Название цели обязательно.');
  }
  if (normalized.length > MAX_GOAL_TITLE_LENGTH) {
    throw new DomainError(
      'goal.title_too_long',
      `Название цели не должно превышать ${MAX_GOAL_TITLE_LENGTH} символов.`,
    );
  }
  return normalized;
}

function normalizeOptionalText(
  value: unknown,
  maximumLength: number,
  errorCode: string,
): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new DomainError('goal.invalid_text', 'Текстовое поле цели указано неверно.');
  }
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maximumLength) {
    throw new DomainError(errorCode, `Текст не должен превышать ${maximumLength} символов.`);
  }
  return normalized;
}

function normalizeProgress(progress: unknown): GoalProgress | null {
  if (progress === null) return null;
  if (typeof progress !== 'object' || Array.isArray(progress)) {
    throw new DomainError('goal.invalid_progress_type', 'Тип прогресса цели указан неверно.');
  }
  const value = progress as Readonly<Record<string, unknown>>;
  if (!isGoalProgressType(value.type)) {
    throw new DomainError('goal.invalid_progress_type', 'Тип прогресса цели указан неверно.');
  }
  if (value.type === GOAL_PROGRESS_TYPE.metric) {
    const { current, target, unit: rawUnit } = value;
    if (
      typeof current !== 'number' ||
      typeof target !== 'number' ||
      typeof rawUnit !== 'string' ||
      !Number.isFinite(current) ||
      !Number.isFinite(target) ||
      current < 0 ||
      target <= 0
    ) {
      throw new DomainError('goal.invalid_metric_progress', 'Измеримый прогресс указан неверно.');
    }
    const unit = rawUnit.trim();
    if (unit.length === 0 || unit.length > 40) {
      throw new DomainError('goal.invalid_metric_progress', 'Измеримый прогресс указан неверно.');
    }
    return Object.freeze({ type: value.type, current, target, unit });
  }
  if (value.type === GOAL_PROGRESS_TYPE.milestones) {
    const { completed, total } = value;
    if (
      typeof completed !== 'number' ||
      typeof total !== 'number' ||
      !Number.isInteger(completed) ||
      !Number.isInteger(total) ||
      completed < 0 ||
      total < 1 ||
      completed > total
    ) {
      throw new DomainError('goal.invalid_milestones_progress', 'Этапный прогресс указан неверно.');
    }
    return Object.freeze({ type: value.type, completed, total });
  }
  if (!isGoalQualitativeStage(value.stage)) {
    throw new DomainError(
      'goal.invalid_qualitative_progress',
      'Качественный прогресс указан неверно.',
    );
  }
  return Object.freeze({ type: value.type, stage: value.stage });
}

function normalizeCoverImage(coverImage: unknown): GoalCoverImage | null {
  if (coverImage === null) return null;
  if (typeof coverImage !== 'object' || Array.isArray(coverImage)) {
    throw new DomainError('goal.invalid_cover_image_type', 'Обложка должна быть изображением.');
  }
  const value = coverImage as Readonly<Record<string, unknown>>;
  const { dataUrl, mimeType, sizeBytes } = value;
  if (typeof dataUrl !== 'string' || typeof mimeType !== 'string') {
    throw new DomainError('goal.invalid_cover_image_type', 'Обложка должна быть изображением.');
  }
  const prefix = `data:${mimeType};base64,`;
  if (!mimeType.startsWith('image/') || !dataUrl.startsWith(prefix)) {
    throw new DomainError('goal.invalid_cover_image_type', 'Обложка должна быть изображением.');
  }
  const encoded = dataUrl.slice(prefix.length);
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedSize = (encoded.length * 3) / 4 - padding;
  if (
    typeof sizeBytes !== 'number' ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > MAX_GOAL_COVER_IMAGE_BYTES ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
    encoded.length % 4 !== 0 ||
    decodedSize !== sizeBytes
  ) {
    throw new DomainError(
      'goal.invalid_cover_image_size',
      `Размер обложки не должен превышать ${MAX_GOAL_COVER_IMAGE_BYTES / 1024 / 1024} МБ.`,
    );
  }
  return Object.freeze({ dataUrl, mimeType, sizeBytes });
}

function assertStatus(value: unknown): asserts value is GoalStatus {
  if (!isGoalStatus(value)) {
    throw new DomainError('goal.invalid_status', 'Состояние цели указано неверно.');
  }
}

function assertStage(value: unknown): asserts value is GoalStage {
  if (!isGoalStage(value)) {
    throw new DomainError('goal.invalid_stage', 'Стадия цели указана неверно.');
  }
}

function assertOptionalIntentionLevel(value: GoalIntentionLevel | null): void {
  if (value !== null && !isGoalIntentionLevel(value)) {
    throw new DomainError('goal.invalid_intention_level', 'Уровень намерения указан неверно.');
  }
}

function assertOptionalHorizon(value: GoalHorizon | null): void {
  if (value !== null && !isGoalHorizon(value)) {
    throw new DomainError('goal.invalid_horizon', 'Горизонт цели указан неверно.');
  }
}

function assertLifecycle(data: GoalRehydrationData): void {
  if (!isValidDate(data.createdAt) || !isValidDate(data.updatedAt)) {
    throw new DomainError('goal.invalid_timestamp', 'Дата и время цели указаны неверно.');
  }
  if (data.updatedAt.getTime() < data.createdAt.getTime()) {
    throw new DomainError(
      'goal.updated_before_created',
      'Обновление не может быть раньше создания.',
    );
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    throw new DomainError('goal.invalid_version', 'Версия цели указана неверно.');
  }
  if (data.status === GOAL_STATUS.archived) {
    if (!isValidDate(data.archivedAt)) {
      throw new DomainError('goal.archived_at_required', 'Архивной цели нужна дата архивации.');
    }
    if (data.archivedAt.getTime() < data.createdAt.getTime()) {
      throw new DomainError(
        'goal.archived_before_created',
        'Архивация не может быть раньше создания.',
      );
    }
  } else if (data.archivedAt !== null) {
    throw new DomainError(
      'goal.unarchived_has_archive_date',
      'Неархивная цель не может иметь дату архивации.',
    );
  }
  if (data.status === GOAL_STATUS.achieved && data.stage !== GOAL_STAGE.achieved) {
    throw new DomainError(
      'goal.achieved_stage_required',
      'Достигнутая цель должна иметь стадию «Достигнута».',
    );
  }
  if (
    data.stage === GOAL_STAGE.achieved &&
    data.status !== GOAL_STATUS.achieved &&
    data.status !== GOAL_STATUS.archived
  ) {
    throw new DomainError(
      'goal.achieved_status_required',
      'Стадия «Достигнута» требует достигнутого состояния цели.',
    );
  }
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function copyOptionalDate(value: Date | null): Date | null {
  return value === null ? null : new Date(value.getTime());
}
