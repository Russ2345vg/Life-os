import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import {
  balanceImportance,
  balanceScore,
  type BalanceImportance,
  type SphereBalanceSettings,
} from '../balance/BalanceImportance';
import type { EntityId } from '../shared/EntityId';
import { isSphereStatus, SPHERE_STATUS, type SphereStatus } from './SphereStatus';

export const MAX_SPHERE_NAME_LENGTH = 120;
export const MAX_SPHERE_DESCRIPTION_LENGTH = 500;
export const MAX_SPHERE_ICON_LENGTH = 16;

export interface SphereCreationData extends SphereBalanceSettings {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string | null;
  readonly icon?: string | null;
  readonly color?: string | null;
  readonly now: Date;
}

export interface SphereDetails extends SphereBalanceSettings {
  readonly name: string;
  readonly description?: string | null;
  readonly icon?: string | null;
  readonly color?: string | null;
}

export interface SphereRehydrationData extends SphereBalanceSettings {
  readonly id: EntityId;
  readonly name: string;
  readonly description: string | null;
  readonly icon: string | null;
  readonly color: string | null;
  readonly status: SphereStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export class Sphere extends Entity {
  public readonly importance: BalanceImportance;
  public readonly manualScore: number | null;
  public readonly desiredLevel: number | null;
  public readonly includeInBalanceWheel: boolean;
  public readonly name: string;
  public readonly description: string | null;
  public readonly icon: string | null;
  public readonly color: string | null;
  public readonly status: SphereStatus;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly version: number;

  private constructor(data: SphereRehydrationData) {
    super(data.id);
    this.importance = balanceImportance(data.importance);
    this.manualScore = balanceScore(data.manualScore);
    this.desiredLevel = balanceScore(data.desiredLevel);
    this.includeInBalanceWheel = data.includeInBalanceWheel ?? false;
    if (typeof this.includeInBalanceWheel !== 'boolean')
      throw new DomainError('sphere.invalid_wheel_setting', 'Выберите участие в колесе.');
    this.name = normalizeSphereName(data.name);
    this.description = normalizeOptionalText(
      data.description,
      MAX_SPHERE_DESCRIPTION_LENGTH,
      'sphere.description_too_long',
      `Описание сферы не должно превышать ${MAX_SPHERE_DESCRIPTION_LENGTH} символов.`,
    );
    this.icon = normalizeOptionalText(
      data.icon,
      MAX_SPHERE_ICON_LENGTH,
      'sphere.icon_too_long',
      `Значок сферы не должен превышать ${MAX_SPHERE_ICON_LENGTH} символов.`,
    );
    this.color = normalizeColor(data.color);
    assertStatus(data.status);
    assertDate(data.createdAt, 'sphere.invalid_created_at');
    assertDate(data.updatedAt, 'sphere.invalid_updated_at');
    if (data.updatedAt.getTime() < data.createdAt.getTime()) {
      throw new DomainError(
        'sphere.updated_before_created',
        'Сфера не может быть обновлена до момента создания.',
      );
    }
    if (!Number.isInteger(data.version) || data.version < 1) {
      throw new DomainError('sphere.invalid_version', 'Версия сферы указана неверно.');
    }
    this.status = data.status;
    this.createdAt = new Date(data.createdAt.getTime());
    this.updatedAt = new Date(data.updatedAt.getTime());
    this.version = data.version;
  }

  public static create(data: SphereCreationData): Sphere {
    return new Sphere({
      ...data,
      id: data.id,
      name: data.name,
      description: data.description ?? null,
      icon: data.icon ?? null,
      color: data.color ?? null,
      status: SPHERE_STATUS.active,
      createdAt: data.now,
      updatedAt: data.now,
      version: 1,
    });
  }

  public static rehydrate(data: SphereRehydrationData): Sphere {
    return new Sphere(data);
  }

  public update(details: SphereDetails, updatedAt: Date): Sphere {
    return new Sphere({
      ...this.toRehydrationData(),
      importance: details.importance ?? this.importance,
      manualScore: details.manualScore === undefined ? this.manualScore : details.manualScore,
      desiredLevel: details.desiredLevel === undefined ? this.desiredLevel : details.desiredLevel,
      includeInBalanceWheel: details.includeInBalanceWheel ?? this.includeInBalanceWheel,
      name: details.name,
      description: details.description === undefined ? this.description : details.description,
      icon: details.icon === undefined ? this.icon : details.icon,
      color: details.color === undefined ? this.color : details.color,
      updatedAt,
      version: this.version + 1,
    });
  }

  public archive(updatedAt: Date): Sphere {
    if (this.status === SPHERE_STATUS.archived) return this;
    return new Sphere({
      ...this.toRehydrationData(),
      status: SPHERE_STATUS.archived,
      updatedAt,
      version: this.version + 1,
    });
  }

  public restore(updatedAt: Date): Sphere {
    if (this.status === SPHERE_STATUS.active) return this;
    return new Sphere({
      ...this.toRehydrationData(),
      status: SPHERE_STATUS.active,
      updatedAt,
      version: this.version + 1,
    });
  }

  private toRehydrationData(): SphereRehydrationData {
    return {
      importance: this.importance,
      manualScore: this.manualScore,
      desiredLevel: this.desiredLevel,
      includeInBalanceWheel: this.includeInBalanceWheel,
      id: this.id,
      name: this.name,
      description: this.description,
      icon: this.icon,
      color: this.color,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    };
  }
}

export function normalizeSphereName(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length === 0) {
    throw new DomainError('sphere.name_required', 'Название сферы обязательно.');
  }
  if (normalized.length > MAX_SPHERE_NAME_LENGTH) {
    throw new DomainError(
      'sphere.name_too_long',
      `Название сферы не должно превышать ${MAX_SPHERE_NAME_LENGTH} символов.`,
    );
  }
  return normalized;
}

export function sphereNameKey(value: string): string {
  return normalizeSphereName(value).toLocaleLowerCase('ru-RU');
}

function normalizeOptionalText(
  value: string | null,
  maxLength: number,
  code: string,
  message: string,
): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maxLength) throw new DomainError(code, message);
  return normalized;
}

function normalizeColor(value: string | null): string | null {
  if (value === null || value.trim().length === 0) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/u.test(normalized)) {
    throw new DomainError(
      'sphere.invalid_color',
      'Цвет сферы должен быть задан в формате #RRGGBB.',
    );
  }
  return normalized;
}

function assertStatus(value: unknown): asserts value is SphereStatus {
  if (!isSphereStatus(value)) {
    throw new DomainError('sphere.invalid_status', 'Состояние сферы указано неверно.');
  }
}

function assertDate(value: Date, code: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new DomainError(code, 'Дата и время сферы указаны неверно.');
  }
}
