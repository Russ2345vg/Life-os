import { DomainError } from '../../shared/errors/DomainError';
import type { DayDate } from '../day/DayDate';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { isWalkMode, WALK_MODE, type WalkMode } from './WalkMode';
import { MAX_WALK_PHOTO_BYTES, type WalkPhoto } from './WalkPhoto';
import { isWalkStatus, WALK_STATUS, type WalkStatus } from './WalkStatus';
import { isWalkType, type WalkType } from './WalkType';

export const MAX_WALK_RESULT_LENGTH = 1000;

export interface WalkCreationData {
  readonly id: EntityId;
  readonly date: DayDate;
  readonly type: WalkType;
  readonly sphereId?: EntityId | null;
  readonly now: Date;
}

export interface WalkRehydrationData {
  readonly id: EntityId;
  readonly date: DayDate;
  readonly type: WalkType;
  readonly sphereId?: EntityId | null;
  readonly status: WalkStatus;
  readonly mode: WalkMode | null;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  readonly timerTargetMinutes: number | null;
  readonly reflectionQuestion: string | null;
  readonly result: string | null;
  readonly photo: WalkPhoto | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface WalkStartData {
  readonly mode: WalkMode;
  readonly startedAt: Date;
  readonly timerTargetMinutes?: number;
  readonly reflectionQuestion: string;
}

export interface WalkCompletionData {
  readonly endedAt: Date;
  readonly result?: string;
  readonly photo?: WalkPhoto;
}

export interface WalkPhotoUpdateData {
  readonly photo: WalkPhoto | null;
  readonly updatedAt: Date;
}

export class Walk extends Entity {
  public readonly date: DayDate;
  public readonly type: WalkType;
  public readonly sphereId: EntityId | null;
  public readonly status: WalkStatus;
  public readonly mode: WalkMode | null;
  public readonly startedAt: Date | null;
  public readonly endedAt: Date | null;
  public readonly timerTargetMinutes: number | null;
  public readonly reflectionQuestion: string | null;
  public readonly result: string | null;
  public readonly photo: WalkPhoto | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly version: number;

  private constructor(data: WalkRehydrationData) {
    super(data.id);
    assertWalkInvariants(data);
    this.date = data.date;
    this.type = data.type;
    this.sphereId = data.sphereId ?? null;
    this.status = data.status;
    this.mode = data.mode;
    this.startedAt = copyOptionalDate(data.startedAt);
    this.endedAt = copyOptionalDate(data.endedAt);
    this.timerTargetMinutes = data.timerTargetMinutes;
    this.reflectionQuestion = data.reflectionQuestion;
    this.result = data.result;
    this.photo = copyOptionalPhoto(data.photo);
    this.createdAt = new Date(data.createdAt.getTime());
    this.updatedAt = new Date(data.updatedAt.getTime());
    this.version = data.version;
  }

  public static create(data: WalkCreationData): Walk {
    assertWalkType(data.type);
    assertValidDate(data.now, 'walk.invalid_created_at');
    return new Walk({
      id: data.id,
      date: data.date,
      type: data.type,
      sphereId: data.sphereId ?? null,
      status: WALK_STATUS.planned,
      mode: null,
      startedAt: null,
      endedAt: null,
      timerTargetMinutes: null,
      reflectionQuestion: null,
      result: null,
      photo: null,
      createdAt: data.now,
      updatedAt: data.now,
      version: 1,
    });
  }

  public static rehydrate(data: WalkRehydrationData): Walk {
    assertWalkType(data.type);
    assertValidDate(data.createdAt, 'walk.invalid_created_at');
    assertValidDate(data.updatedAt, 'walk.invalid_updated_at');
    if (!Number.isInteger(data.version) || data.version < 1) {
      throw new DomainError('walk.invalid_version', 'Версия прогулки указана неверно.');
    }
    return new Walk(data);
  }

  public start(data: WalkStartData): Walk {
    if (this.status === WALK_STATUS.running) return this;
    if (this.status !== WALK_STATUS.planned) {
      throw new DomainError(
        'walk.cannot_start_finished',
        'Завершённую прогулку нельзя начать повторно.',
      );
    }
    return new Walk({
      ...this.toRehydrationData(),
      status: WALK_STATUS.running,
      mode: data.mode,
      startedAt: data.startedAt,
      timerTargetMinutes: data.timerTargetMinutes ?? null,
      reflectionQuestion: data.reflectionQuestion,
      updatedAt: data.startedAt,
      version: this.version + 1,
    });
  }

  public complete(data: WalkCompletionData): Walk {
    this.assertRunning('walk.cannot_complete');
    return this.finish(WALK_STATUS.completed, data.endedAt, data.result, data.photo ?? null);
  }

  public abandon(endedAt: Date): Walk {
    this.assertRunning('walk.cannot_abandon');
    return this.finish(WALK_STATUS.abandoned, endedAt, null, null);
  }

  public updatePhoto(data: WalkPhotoUpdateData): Walk {
    if (this.status !== WALK_STATUS.completed) {
      throw new DomainError(
        'walk.photo_requires_completed',
        'Фото можно прикрепить только к завершённой прогулке.',
      );
    }
    assertValidDate(data.updatedAt, 'walk.invalid_updated_at');
    if (data.updatedAt.getTime() < this.endedAt!.getTime()) {
      throw new DomainError(
        'walk.update_before_end',
        'Фото не может быть изменено до завершения прогулки.',
      );
    }
    assertOptionalPhoto(data.photo);
    return new Walk({
      ...this.toRehydrationData(),
      photo: data.photo,
      updatedAt: data.updatedAt,
      version: this.version + 1,
    });
  }

  public changeSphere(sphereId: EntityId | null, updatedAt: Date): Walk {
    if (sameOptionalEntityId(this.sphereId, sphereId)) return this;
    assertValidDate(updatedAt, 'walk.invalid_updated_at');
    return new Walk({
      ...this.toRehydrationData(),
      sphereId,
      updatedAt,
      version: this.version + 1,
    });
  }

  public get actualDurationMilliseconds(): number | null {
    if (this.startedAt === null || this.endedAt === null) return null;
    return this.endedAt.getTime() - this.startedAt.getTime();
  }

  private finish(
    status: typeof WALK_STATUS.completed | typeof WALK_STATUS.abandoned,
    endedAt: Date,
    result: string | undefined | null,
    photo: WalkPhoto | null,
  ): Walk {
    assertValidDate(endedAt, 'walk.invalid_ended_at');
    if (endedAt.getTime() < this.startedAt!.getTime()) {
      throw new DomainError('walk.end_before_start', 'Прогулка не может завершиться до начала.');
    }
    return new Walk({
      ...this.toRehydrationData(),
      status,
      endedAt,
      result: normalizeResult(result),
      photo,
      updatedAt: endedAt,
      version: this.version + 1,
    });
  }

  private assertRunning(code: string): void {
    if (this.status !== WALK_STATUS.running) {
      throw new DomainError(code, 'Только идущую прогулку можно завершить или прервать.');
    }
  }

  private toRehydrationData(): WalkRehydrationData {
    return {
      id: this.id,
      date: this.date,
      type: this.type,
      sphereId: this.sphereId,
      status: this.status,
      mode: this.mode,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      timerTargetMinutes: this.timerTargetMinutes,
      reflectionQuestion: this.reflectionQuestion,
      result: this.result,
      photo: this.photo,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    };
  }
}

function assertWalkInvariants(data: WalkRehydrationData): void {
  if (!isWalkStatus(data.status)) {
    throw new DomainError('walk.invalid_status', 'Состояние прогулки указано неверно.');
  }
  if (data.status === WALK_STATUS.planned) {
    if (
      data.mode !== null ||
      data.startedAt !== null ||
      data.endedAt !== null ||
      data.timerTargetMinutes !== null ||
      data.reflectionQuestion !== null ||
      data.result !== null ||
      data.photo !== null
    ) {
      throw new DomainError(
        'walk.invalid_planned_state',
        'Запланированная прогулка не должна содержать данные запуска или завершения.',
      );
    }
    return;
  }

  if (!isWalkMode(data.mode) || data.startedAt === null) {
    throw new DomainError('walk.invalid_running_state', 'Данные запуска прогулки неполны.');
  }
  assertValidDate(data.startedAt, 'walk.invalid_started_at');
  if (data.startedAt.getTime() < data.createdAt.getTime()) {
    throw new DomainError('walk.start_before_creation', 'Прогулка не может начаться до создания.');
  }
  const question = data.reflectionQuestion?.trim() ?? '';
  if (question.length === 0 || question.length > 500) {
    throw new DomainError(
      'walk.invalid_reflection_question',
      'Вопрос для прогулки указан неверно.',
    );
  }
  if (data.mode === WALK_MODE.stopwatch && data.timerTargetMinutes !== null) {
    throw new DomainError('walk.stopwatch_has_target', 'Для секундомера длительность не задаётся.');
  }
  if (
    data.mode === WALK_MODE.timer &&
    (!Number.isInteger(data.timerTargetMinutes) ||
      data.timerTargetMinutes === null ||
      data.timerTargetMinutes < 1 ||
      data.timerTargetMinutes > 1440)
  ) {
    throw new DomainError(
      'walk.invalid_timer_target',
      'Длительность прогулки должна быть целым числом от 1 до 1440 минут.',
    );
  }

  if (data.status === WALK_STATUS.running) {
    if (data.endedAt !== null || data.result !== null || data.photo !== null) {
      throw new DomainError(
        'walk.invalid_running_result',
        'Идущая прогулка не должна содержать итог завершения.',
      );
    }
    return;
  }

  if (data.endedAt === null) {
    throw new DomainError(
      'walk.missing_ended_at',
      'У завершённой прогулки должно быть время завершения.',
    );
  }
  assertValidDate(data.endedAt, 'walk.invalid_ended_at');
  if (data.endedAt.getTime() < data.startedAt.getTime()) {
    throw new DomainError('walk.end_before_start', 'Прогулка не может завершиться до начала.');
  }
  if (data.status === WALK_STATUS.abandoned && (data.result !== null || data.photo !== null)) {
    throw new DomainError(
      'walk.abandoned_has_result',
      'Прерванная прогулка не должна содержать итог.',
    );
  }
  normalizeResult(data.result);
  assertOptionalPhoto(data.photo);
}

function sameOptionalEntityId(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}

function normalizeResult(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > MAX_WALK_RESULT_LENGTH) {
    throw new DomainError(
      'walk.result_too_long',
      `Итог прогулки не должен превышать ${MAX_WALK_RESULT_LENGTH} символов.`,
    );
  }
  return normalized;
}

function assertOptionalPhoto(photo: WalkPhoto | null): void {
  if (photo === null) return;
  const prefix = `data:${photo.mimeType};base64,`;
  if (!photo.mimeType.startsWith('image/') || !photo.dataUrl.startsWith(prefix)) {
    throw new DomainError('walk.invalid_photo_type', 'Можно прикрепить только изображение.');
  }
  const encoded = photo.dataUrl.slice(prefix.length);
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedSize = (encoded.length * 3) / 4 - padding;
  if (
    !Number.isInteger(photo.sizeBytes) ||
    photo.sizeBytes < 1 ||
    photo.sizeBytes > MAX_WALK_PHOTO_BYTES ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
    encoded.length % 4 !== 0 ||
    decodedSize !== photo.sizeBytes
  ) {
    throw new DomainError(
      'walk.invalid_photo_size',
      `Размер фото не должен превышать ${MAX_WALK_PHOTO_BYTES / 1024 / 1024} МБ.`,
    );
  }
}

function assertWalkType(value: unknown): asserts value is WalkType {
  if (!isWalkType(value)) {
    throw new DomainError('walk.invalid_type', 'Тип прогулки указан неверно.');
  }
}

function assertValidDate(value: Date, code: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new DomainError(code, 'Дата и время прогулки указаны неверно.');
  }
}

function copyOptionalDate(value: Date | null): Date | null {
  return value === null ? null : new Date(value.getTime());
}

function copyOptionalPhoto(photo: WalkPhoto | null): WalkPhoto | null {
  return photo === null ? null : { ...photo };
}
