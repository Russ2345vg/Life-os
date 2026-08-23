import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';
import { copyDate } from '../shared/dateCopy';

export const OPEN_LOOP_ENTITY_TYPE = {
  decision: 'DECISION',
  lifeAction: 'LIFE_ACTION',
  actionSession: 'ACTION_SESSION',
} as const;

export type OpenLoopEntityType = (typeof OPEN_LOOP_ENTITY_TYPE)[keyof typeof OPEN_LOOP_ENTITY_TYPE];

export const OPEN_LOOP_REQUIREMENT = {
  requiresResolution: 'REQUIRES_RESOLUTION',
  informational: 'INFORMATIONAL',
} as const;

export type OpenLoopRequirement =
  (typeof OPEN_LOOP_REQUIREMENT)[keyof typeof OPEN_LOOP_REQUIREMENT];

export const OPEN_LOOP_RESOLUTION = {
  complete: 'COMPLETE',
  carryForward: 'CARRY_FORWARD',
  revise: 'REVISE',
  drop: 'DROP',
} as const;

export type OpenLoopResolutionKind =
  (typeof OPEN_LOOP_RESOLUTION)[keyof typeof OPEN_LOOP_RESOLUTION];

export interface OpenLoopReferenceData {
  readonly entityType: OpenLoopEntityType;
  readonly entityId: EntityId;
  readonly requirement: OpenLoopRequirement;
  readonly sourceVersion?: number | null;
}

export class OpenLoopReference {
  readonly #entityType: OpenLoopEntityType;
  readonly #entityId: EntityId;
  readonly #requirement: OpenLoopRequirement;
  readonly #sourceVersion: number | null;

  private constructor(data: OpenLoopReferenceData) {
    this.#entityType = data.entityType;
    this.#entityId = data.entityId;
    this.#requirement = data.requirement;
    this.#sourceVersion = data.sourceVersion ?? null;
    Object.freeze(this);
  }

  public static create(data: OpenLoopReferenceData): OpenLoopReference {
    assertEntityType(data.entityType);
    assertEntityId(data.entityId);
    assertRequirement(data.requirement);
    assertOptionalVersion(data.sourceVersion);
    return new OpenLoopReference(data);
  }

  public get entityType(): OpenLoopEntityType {
    return this.#entityType;
  }

  public get entityId(): EntityId {
    return this.#entityId;
  }

  public get requirement(): OpenLoopRequirement {
    return this.#requirement;
  }

  public get sourceVersion(): number | null {
    return this.#sourceVersion;
  }

  public key(): string {
    return openLoopKey(this.#entityType, this.#entityId);
  }
}

export interface OpenLoopResolutionData {
  readonly entityType: OpenLoopEntityType;
  readonly entityId: EntityId;
  readonly resolution: OpenLoopResolutionKind;
  readonly resolvedAt: Date;
  readonly note?: string | null;
}

export class OpenLoopResolution {
  readonly #entityType: OpenLoopEntityType;
  readonly #entityId: EntityId;
  readonly #resolution: Exclude<OpenLoopResolutionKind, 'REVISE'>;
  readonly #resolvedAt: Date;
  readonly #note: string | null;

  private constructor(
    data: Omit<OpenLoopResolutionData, 'resolution'> & {
      readonly resolution: Exclude<OpenLoopResolutionKind, 'REVISE'>;
    },
  ) {
    this.#entityType = data.entityType;
    this.#entityId = data.entityId;
    this.#resolution = data.resolution;
    this.#resolvedAt = copyDate(data.resolvedAt);
    this.#note = normalizeOptionalNote(data.note);
    Object.freeze(this);
  }

  public static create(data: OpenLoopResolutionData): OpenLoopResolution {
    assertEntityType(data.entityType);
    assertEntityId(data.entityId);
    assertResolution(data.resolution);
    const resolution = data.resolution;
    if (resolution === OPEN_LOOP_RESOLUTION.revise) {
      throw new DomainError(
        'open_loop.revise_is_not_resolution',
        'Изменение само по себе не закрывает незавершённый элемент.',
      );
    }
    if (!(data.resolvedAt instanceof Date) || Number.isNaN(data.resolvedAt.getTime())) {
      throw new DomainError('open_loop.invalid_resolved_at', 'Время разбора некорректно.');
    }
    return new OpenLoopResolution({ ...data, resolution });
  }

  public get entityType(): OpenLoopEntityType {
    return this.#entityType;
  }

  public get entityId(): EntityId {
    return this.#entityId;
  }

  public get resolution(): Exclude<OpenLoopResolutionKind, 'REVISE'> {
    return this.#resolution;
  }

  public get resolvedAt(): Date {
    return copyDate(this.#resolvedAt);
  }

  public get note(): string | null {
    return this.#note;
  }

  public key(): string {
    return openLoopKey(this.#entityType, this.#entityId);
  }
}

export function openLoopKey(entityType: OpenLoopEntityType, entityId: EntityId): string {
  return `${entityType}:${entityId.toString()}`;
}

export function isOpenLoopEntityType(value: string): value is OpenLoopEntityType {
  return (Object.values(OPEN_LOOP_ENTITY_TYPE) as readonly string[]).includes(value);
}

export function isOpenLoopRequirement(value: string): value is OpenLoopRequirement {
  return (Object.values(OPEN_LOOP_REQUIREMENT) as readonly string[]).includes(value);
}

export function isOpenLoopResolutionKind(value: string): value is OpenLoopResolutionKind {
  return (Object.values(OPEN_LOOP_RESOLUTION) as readonly string[]).includes(value);
}

function assertEntityType(value: OpenLoopEntityType): void {
  if (!isOpenLoopEntityType(value)) {
    throw new DomainError(
      'open_loop.invalid_entity_type',
      'Тип незавершённого элемента неизвестен.',
    );
  }
}

function assertRequirement(value: OpenLoopRequirement): void {
  if (!isOpenLoopRequirement(value)) {
    throw new DomainError(
      'open_loop.invalid_requirement',
      'Критичность незавершённого элемента неизвестна.',
    );
  }
}

function assertResolution(value: OpenLoopResolutionKind): void {
  if (!isOpenLoopResolutionKind(value)) {
    throw new DomainError('open_loop.invalid_resolution', 'Исход разбора неизвестен.');
  }
}

function assertEntityId(value: EntityId): void {
  if (!(value instanceof EntityId)) {
    throw new DomainError(
      'open_loop.invalid_entity_id',
      'Идентификатор незавершённого элемента некорректен.',
    );
  }
}

function assertOptionalVersion(value: number | null | undefined): void {
  if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 1)) {
    throw new DomainError(
      'open_loop.invalid_source_version',
      'Версия исходного элемента некорректна.',
    );
  }
}

function normalizeOptionalNote(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > 2_000) {
    throw new DomainError(
      'open_loop.invalid_note',
      'Пояснение результата разбора слишком длинное.',
    );
  }
  return normalized;
}
