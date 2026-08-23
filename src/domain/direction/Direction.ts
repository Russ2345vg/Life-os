import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { DIRECTION_STATUS, isDirectionStatus, type DirectionStatus } from './DirectionStatus';

export const MAX_DIRECTION_NAME_LENGTH = 160;
export const MAX_DIRECTION_DESCRIPTION_LENGTH = 2_000;
export const MAX_DIRECTION_STRATEGIC_TEXT_LENGTH = 4_000;

export interface DirectionCreationData {
  readonly id: EntityId;
  readonly sphereId?: EntityId | null;
  readonly name: string;
  readonly description?: string | null;
  readonly strategicIntent?: string | null;
  readonly desiredState?: string | null;
  readonly inScope?: string | null;
  readonly outOfScope?: string | null;
  readonly isMain?: boolean;
  readonly now: Date;
}

export interface DirectionDetails {
  readonly sphereId?: EntityId | null;
  readonly name: string;
  readonly description?: string | null;
  readonly strategicIntent?: string | null;
  readonly desiredState?: string | null;
  readonly inScope?: string | null;
  readonly outOfScope?: string | null;
}

export interface DirectionRehydrationData {
  readonly id: EntityId;
  readonly sphereId: EntityId | null;
  readonly name: string;
  readonly description: string | null;
  readonly strategicIntent: string | null;
  readonly desiredState: string | null;
  readonly inScope: string | null;
  readonly outOfScope: string | null;
  readonly status: DirectionStatus;
  readonly isMain: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export class Direction extends Entity {
  public readonly sphereId: EntityId | null;
  public readonly name: string;
  public readonly description: string | null;
  public readonly strategicIntent: string | null;
  public readonly desiredState: string | null;
  public readonly inScope: string | null;
  public readonly outOfScope: string | null;
  public readonly status: DirectionStatus;
  public readonly isMain: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly version: number;

  private constructor(data: DirectionRehydrationData) {
    super(data.id);
    this.sphereId = data.sphereId;
    this.name = normalizeRequiredText(
      data.name,
      MAX_DIRECTION_NAME_LENGTH,
      'direction.name_required',
      'direction.name_too_long',
    );
    this.description = normalizeOptionalText(
      data.description,
      MAX_DIRECTION_DESCRIPTION_LENGTH,
      'direction.description_too_long',
    );
    this.strategicIntent = normalizeStrategicText(
      data.strategicIntent,
      'direction.strategic_intent_too_long',
    );
    this.desiredState = normalizeStrategicText(
      data.desiredState,
      'direction.desired_state_too_long',
    );
    this.inScope = normalizeStrategicText(data.inScope, 'direction.in_scope_too_long');
    this.outOfScope = normalizeStrategicText(data.outOfScope, 'direction.out_of_scope_too_long');
    if (!isDirectionStatus(data.status)) {
      throw new DomainError('direction.invalid_status', 'Указан неизвестный статус направления.');
    }
    if (typeof data.isMain !== 'boolean') {
      throw new DomainError(
        'direction.invalid_is_main',
        'Признак главного направления указан неверно.',
      );
    }
    if (data.status === DIRECTION_STATUS.archived && data.isMain) {
      throw new DomainError(
        'direction.archived_cannot_be_main',
        'Архивное направление не может быть главным.',
      );
    }
    assertLifecycle(data.createdAt, data.updatedAt, data.version, 'direction');
    this.status = data.status;
    this.isMain = data.isMain;
    this.createdAt = new Date(data.createdAt.getTime());
    this.updatedAt = new Date(data.updatedAt.getTime());
    this.version = data.version;
  }

  public static create(data: DirectionCreationData): Direction {
    return new Direction({
      id: data.id,
      sphereId: data.sphereId ?? null,
      name: data.name,
      description: data.description ?? null,
      strategicIntent: data.strategicIntent ?? null,
      desiredState: data.desiredState ?? null,
      inScope: data.inScope ?? null,
      outOfScope: data.outOfScope ?? null,
      status: DIRECTION_STATUS.active,
      isMain: data.isMain ?? false,
      createdAt: data.now,
      updatedAt: data.now,
      version: 1,
    });
  }

  public static rehydrate(data: DirectionRehydrationData): Direction {
    return new Direction(data);
  }

  public update(details: DirectionDetails, updatedAt: Date): Direction {
    return new Direction({
      ...this.toRehydrationData(),
      sphereId: details.sphereId === undefined ? this.sphereId : details.sphereId,
      name: details.name,
      description: details.description === undefined ? this.description : details.description,
      strategicIntent:
        details.strategicIntent === undefined ? this.strategicIntent : details.strategicIntent,
      desiredState: details.desiredState === undefined ? this.desiredState : details.desiredState,
      inScope: details.inScope === undefined ? this.inScope : details.inScope,
      outOfScope: details.outOfScope === undefined ? this.outOfScope : details.outOfScope,
      updatedAt,
      version: this.version + 1,
    });
  }

  public archive(updatedAt: Date): Direction {
    if (this.status === DIRECTION_STATUS.archived) return this;
    return new Direction({
      ...this.toRehydrationData(),
      status: DIRECTION_STATUS.archived,
      isMain: false,
      updatedAt,
      version: this.version + 1,
    });
  }

  public restore(updatedAt: Date): Direction {
    return this.withStatus(DIRECTION_STATUS.active, updatedAt);
  }

  public makeMain(updatedAt: Date): Direction {
    if (this.status !== DIRECTION_STATUS.active) {
      throw new DomainError(
        'direction.archived_cannot_be_main',
        'Архивное направление нельзя сделать главным.',
      );
    }
    return this.withMain(true, updatedAt);
  }

  public removeMain(updatedAt: Date): Direction {
    return this.withMain(false, updatedAt);
  }

  private withMain(isMain: boolean, updatedAt: Date): Direction {
    if (this.isMain === isMain) return this;
    return new Direction({
      ...this.toRehydrationData(),
      isMain,
      updatedAt,
      version: this.version + 1,
    });
  }

  private withStatus(status: DirectionStatus, updatedAt: Date): Direction {
    if (this.status === status) return this;
    return new Direction({
      ...this.toRehydrationData(),
      status,
      updatedAt,
      version: this.version + 1,
    });
  }

  private toRehydrationData(): DirectionRehydrationData {
    return {
      id: this.id,
      sphereId: this.sphereId,
      name: this.name,
      description: this.description,
      strategicIntent: this.strategicIntent,
      desiredState: this.desiredState,
      inScope: this.inScope,
      outOfScope: this.outOfScope,
      status: this.status,
      isMain: this.isMain,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    };
  }
}

function normalizeStrategicText(value: string | null, code: string): string | null {
  return normalizeOptionalText(value, MAX_DIRECTION_STRATEGIC_TEXT_LENGTH, code);
}

function normalizeRequiredText(
  value: string,
  maxLength: number,
  requiredCode: string,
  tooLongCode: string,
): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length === 0) throw new DomainError(requiredCode, 'Название обязательно.');
  if (normalized.length > maxLength) {
    throw new DomainError(tooLongCode, `Текст не должен превышать ${maxLength} символов.`);
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

function assertLifecycle(createdAt: Date, updatedAt: Date, version: number, prefix: string): void {
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) {
    throw new DomainError(`${prefix}.invalid_timestamp`, 'Дата и время указаны неверно.');
  }
  if (updatedAt.getTime() < createdAt.getTime()) {
    throw new DomainError(
      `${prefix}.updated_before_created`,
      'Обновление не может быть раньше создания.',
    );
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new DomainError(`${prefix}.invalid_version`, 'Версия указана неверно.');
  }
}
