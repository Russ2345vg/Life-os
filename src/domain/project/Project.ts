import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { PROJECT_STATUS, isProjectStatus, type ProjectStatus } from './ProjectStatus';

export const MAX_PROJECT_TITLE_LENGTH = 200;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 4_000;
export const MAX_PROJECT_DESIRED_RESULT_LENGTH = 2_000;

export interface ProjectCreationData {
  readonly id: EntityId;
  readonly sphereId?: EntityId | null;
  readonly directionId?: EntityId | null;
  readonly title: string;
  readonly description?: string | null;
  readonly desiredResult?: string | null;
  readonly isMain?: boolean;
  readonly now: Date;
}

export interface ProjectDetails {
  readonly sphereId?: EntityId | null;
  readonly directionId?: EntityId | null;
  readonly title: string;
  readonly description?: string | null;
  readonly desiredResult?: string | null;
}

export interface ProjectRehydrationData {
  readonly id: EntityId;
  readonly sphereId: EntityId | null;
  readonly directionId: EntityId | null;
  readonly title: string;
  readonly description: string | null;
  readonly desiredResult: string | null;
  readonly status: ProjectStatus;
  readonly isMain: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export class Project extends Entity {
  public readonly sphereId: EntityId | null;
  public readonly directionId: EntityId | null;
  public readonly title: string;
  public readonly description: string | null;
  public readonly desiredResult: string | null;
  public readonly status: ProjectStatus;
  public readonly isMain: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly version: number;

  private constructor(data: ProjectRehydrationData) {
    super(data.id);
    this.sphereId = data.sphereId;
    this.directionId = data.directionId;
    this.title = normalizeRequiredText(data.title, MAX_PROJECT_TITLE_LENGTH);
    this.description = normalizeOptionalText(
      data.description,
      MAX_PROJECT_DESCRIPTION_LENGTH,
      'project.description_too_long',
    );
    this.desiredResult = normalizeOptionalText(
      data.desiredResult,
      MAX_PROJECT_DESIRED_RESULT_LENGTH,
      'project.desired_result_too_long',
    );
    if (!isProjectStatus(data.status)) {
      throw new DomainError('project.invalid_status', 'Указан неизвестный статус проекта.');
    }
    if (typeof data.isMain !== 'boolean') {
      throw new DomainError('project.invalid_is_main', 'Признак главного проекта указан неверно.');
    }
    if (data.status !== PROJECT_STATUS.active && data.isMain) {
      throw new DomainError(
        'project.inactive_cannot_be_main',
        'Только активный проект может быть главным.',
      );
    }
    assertLifecycle(data.createdAt, data.updatedAt, data.version);
    this.status = data.status;
    this.isMain = data.isMain;
    this.createdAt = new Date(data.createdAt.getTime());
    this.updatedAt = new Date(data.updatedAt.getTime());
    this.version = data.version;
  }

  public static create(data: ProjectCreationData): Project {
    return new Project({
      id: data.id,
      sphereId: data.sphereId ?? null,
      directionId: data.directionId ?? null,
      title: data.title,
      description: data.description ?? null,
      desiredResult: data.desiredResult ?? null,
      status: PROJECT_STATUS.active,
      isMain: data.isMain ?? false,
      createdAt: data.now,
      updatedAt: data.now,
      version: 1,
    });
  }

  public static rehydrate(data: ProjectRehydrationData): Project {
    return new Project(data);
  }

  public update(details: ProjectDetails, updatedAt: Date): Project {
    const directionId = details.directionId === undefined ? this.directionId : details.directionId;
    const keepsDirection = sameOptionalEntityId(this.directionId, directionId);
    return new Project({
      ...this.toRehydrationData(),
      sphereId: details.sphereId === undefined ? this.sphereId : details.sphereId,
      directionId,
      title: details.title,
      description: details.description === undefined ? this.description : details.description,
      desiredResult:
        details.desiredResult === undefined ? this.desiredResult : details.desiredResult,
      isMain: keepsDirection ? this.isMain : false,
      updatedAt,
      version: this.version + 1,
    });
  }

  public pause(updatedAt: Date): Project {
    if (this.status === PROJECT_STATUS.paused) return this;
    this.assertStatus(PROJECT_STATUS.active, 'project.cannot_pause');
    return this.withStatus(PROJECT_STATUS.paused, updatedAt, false);
  }

  public resume(updatedAt: Date): Project {
    if (this.status === PROJECT_STATUS.active) return this;
    this.assertStatus(PROJECT_STATUS.paused, 'project.cannot_resume');
    return this.withStatus(PROJECT_STATUS.active, updatedAt, false);
  }

  public complete(updatedAt: Date): Project {
    if (this.status === PROJECT_STATUS.completed) return this;
    if (this.status !== PROJECT_STATUS.active && this.status !== PROJECT_STATUS.paused) {
      throw new DomainError('project.cannot_complete', 'Архивный проект нельзя завершить.');
    }
    return this.withStatus(PROJECT_STATUS.completed, updatedAt, false);
  }

  public archive(updatedAt: Date): Project {
    if (this.status === PROJECT_STATUS.archived) return this;
    return this.withStatus(PROJECT_STATUS.archived, updatedAt, false);
  }

  public restore(updatedAt: Date): Project {
    this.assertStatus(PROJECT_STATUS.archived, 'project.cannot_restore');
    return this.withStatus(PROJECT_STATUS.active, updatedAt, false);
  }

  public makeMain(updatedAt: Date): Project {
    if (this.status !== PROJECT_STATUS.active) {
      throw new DomainError(
        'project.inactive_cannot_be_main',
        'Только активный проект можно сделать главным.',
      );
    }
    return this.withMain(true, updatedAt);
  }

  public removeMain(updatedAt: Date): Project {
    return this.withMain(false, updatedAt);
  }

  private assertStatus(expected: ProjectStatus, code: string): void {
    if (this.status !== expected) {
      throw new DomainError(code, 'Переход проекта в запрошенный статус недоступен.');
    }
  }

  private withStatus(status: ProjectStatus, updatedAt: Date, isMain = this.isMain): Project {
    if (this.status === status && this.isMain === isMain) return this;
    return new Project({
      ...this.toRehydrationData(),
      status,
      isMain,
      updatedAt,
      version: this.version + 1,
    });
  }

  private withMain(isMain: boolean, updatedAt: Date): Project {
    if (this.isMain === isMain) return this;
    return new Project({
      ...this.toRehydrationData(),
      isMain,
      updatedAt,
      version: this.version + 1,
    });
  }

  private toRehydrationData(): ProjectRehydrationData {
    return {
      id: this.id,
      sphereId: this.sphereId,
      directionId: this.directionId,
      title: this.title,
      description: this.description,
      desiredResult: this.desiredResult,
      status: this.status,
      isMain: this.isMain,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    };
  }
}

function sameOptionalEntityId(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}

function normalizeRequiredText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length === 0) {
    throw new DomainError('project.title_required', 'Название проекта обязательно.');
  }
  if (normalized.length > maxLength) {
    throw new DomainError(
      'project.title_too_long',
      `Название не должно превышать ${maxLength} символов.`,
    );
  }
  return normalized;
}

function normalizeOptionalText(
  value: string | null,
  maxLength: number,
  code: string,
): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maxLength) {
    throw new DomainError(code, `Текст не должен превышать ${maxLength} символов.`);
  }
  return normalized;
}

function assertLifecycle(createdAt: Date, updatedAt: Date, version: number): void {
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) {
    throw new DomainError('project.invalid_timestamp', 'Дата и время указаны неверно.');
  }
  if (updatedAt.getTime() < createdAt.getTime()) {
    throw new DomainError(
      'project.updated_before_created',
      'Обновление не может быть раньше создания.',
    );
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new DomainError('project.invalid_version', 'Версия проекта указана неверно.');
  }
}
