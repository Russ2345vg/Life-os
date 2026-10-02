import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';

export const MAX_WALK_CAPTURE_LENGTH = 500;
export type WalkCaptureStatus = 'pending' | 'processed';

export interface WalkCaptureCreationData {
  readonly id: EntityId;
  readonly walkId: EntityId;
  readonly content: string;
  readonly capturedAt: Date;
  readonly walkElapsedMs: number;
}

export interface WalkCaptureData extends WalkCaptureCreationData {
  readonly resultActionId?: EntityId | null;
  readonly type: 'text';
  readonly status: WalkCaptureStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export class WalkCapture extends Entity {
  public readonly resultActionId: EntityId | null;
  public readonly walkId: EntityId;
  public readonly type = 'text' as const;
  public readonly content: string;
  readonly #capturedAt: Date;
  public readonly walkElapsedMs: number;
  public readonly status: WalkCaptureStatus;
  readonly #createdAt: Date;
  readonly #updatedAt: Date;
  public readonly version: number;

  private constructor(data: WalkCaptureData) {
    super(data.id);
    this.resultActionId = data.resultActionId ?? null;
    if (this.resultActionId !== null && data.status !== 'processed') throw invalidData();
    if (normalizeContent(data.content) !== data.content) throw invalidData();
    for (const date of [data.capturedAt, data.createdAt, data.updatedAt]) {
      if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw invalidData();
    }
    if (
      data.type !== 'text' ||
      (data.status !== 'pending' && data.status !== 'processed') ||
      !Number.isSafeInteger(data.walkElapsedMs) ||
      data.walkElapsedMs < 0 ||
      !Number.isSafeInteger(data.version) ||
      data.version < 1 ||
      data.createdAt.getTime() !== data.capturedAt.getTime() ||
      data.updatedAt.getTime() < data.createdAt.getTime()
    )
      throw invalidData();
    this.walkId = data.walkId;
    this.content = data.content;
    this.#capturedAt = new Date(data.capturedAt.getTime());
    this.walkElapsedMs = data.walkElapsedMs;
    this.status = data.status;
    this.#createdAt = new Date(data.createdAt.getTime());
    this.#updatedAt = new Date(data.updatedAt.getTime());
    this.version = data.version;
  }

  public get capturedAt(): Date {
    return new Date(this.#capturedAt);
  }
  public get createdAt(): Date {
    return new Date(this.#createdAt);
  }
  public get updatedAt(): Date {
    return new Date(this.#updatedAt);
  }

  public static create(data: WalkCaptureCreationData): WalkCapture {
    return new WalkCapture({
      ...data,
      content: normalizeContent(data.content),
      type: 'text',
      status: 'pending',
      createdAt: data.capturedAt,
      updatedAt: data.capturedAt,
      version: 1,
    });
  }

  public static rehydrate(data: WalkCaptureData): WalkCapture {
    return new WalkCapture(data);
  }

  public updateContent(content: string, updatedAt: Date): WalkCapture {
    this.assertUpdateTime(updatedAt);
    return new WalkCapture({
      ...this.data(),
      content: normalizeContent(content),
      updatedAt,
      version: this.version + 1,
    });
  }

  public process(updatedAt: Date): WalkCapture {
    if (this.status === 'processed') return this;
    this.assertUpdateTime(updatedAt);
    return new WalkCapture({
      ...this.data(),
      status: 'processed',
      updatedAt,
      version: this.version + 1,
    });
  }

  public processAsAction(actionId: EntityId, updatedAt: Date): WalkCapture {
    if (this.resultActionId !== null) {
      if (!this.resultActionId.equals(actionId)) throw invalidData();
      return this;
    }
    this.assertUpdateTime(updatedAt);
    return new WalkCapture({
      ...this.data(),
      resultActionId: actionId,
      status: 'processed',
      updatedAt,
      version: this.version + 1,
    });
  }

  private assertUpdateTime(updatedAt: Date): void {
    if (
      !(updatedAt instanceof Date) ||
      !Number.isFinite(updatedAt.getTime()) ||
      updatedAt.getTime() < this.updatedAt.getTime()
    ) {
      throw invalidData();
    }
  }

  private data(): WalkCaptureData {
    return {
      resultActionId: this.resultActionId,
      id: this.id,
      walkId: this.walkId,
      type: this.type,
      content: this.content,
      capturedAt: this.capturedAt,
      walkElapsedMs: this.walkElapsedMs,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    };
  }
}

function normalizeContent(value: string): string {
  const content = value.trim();
  if (!content || content.length > MAX_WALK_CAPTURE_LENGTH) {
    throw new DomainError('walk_capture.invalid_content', 'Введите мысль от 1 до 500 символов.');
  }
  return content;
}

function invalidData(): DomainError {
  return new DomainError('walk_capture.invalid_data', 'Данные сохранённой мысли указаны неверно.');
}
