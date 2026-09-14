import { DomainError } from '../../shared/errors/DomainError';
import type { DomainEvent } from '../shared/DomainEvent';
import { Entity } from '../shared/Entity';
import { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import { DayDate } from './DayDate';
import { DAY_STATUS, type DayStatus } from './DayStatus';
import { DayCompleted, DayCreated, DayFirstActivityRecorded, DayOpened } from './events';

interface PlanDayInput {
  readonly id: EntityId;
  readonly date: DayDate;
  readonly currentDate: DayDate;
  readonly occurredAt: Date;
  readonly createdEventId: EntityId;
}

interface CreateCurrentPlannedDayInput {
  readonly id: EntityId;
  readonly currentDate: DayDate;
  readonly occurredAt: Date;
  readonly createdEventId: EntityId;
}

interface CreateCurrentDayInput {
  readonly id: EntityId;
  readonly currentDate: DayDate;
  readonly occurredAt: Date;
  readonly createdEventId: EntityId;
  readonly openedEventId: EntityId;
}

export interface DayRehydrationData {
  readonly id: EntityId;
  readonly date: DayDate;
  readonly status: DayStatus;
  readonly createdAt: Date;
  readonly plannedAt: Date | null;
  readonly openedAt: Date | null;
  readonly firstActivityAt: Date | null;
  readonly completedAt: Date | null;
  readonly summary: string | null;
  readonly sphereId?: EntityId | null;
  readonly mainDirectionId?: EntityId | null;
  readonly version: number;
}

export class Day extends Entity {
  readonly #date: DayDate;
  readonly #createdAt: Date;
  readonly #plannedAt: Date | null;
  readonly #domainEvents: DomainEvent[];
  #status: DayStatus;
  #openedAt: Date | null;
  #firstActivityAt: Date | null;
  #completedAt: Date | null;
  #summary: string | null;
  #sphereId: EntityId | null;
  #mainDirectionId: EntityId | null;
  #version: number;

  private constructor(
    id: EntityId,
    date: DayDate,
    status: DayStatus,
    createdAt: Date,
    plannedAt: Date | null,
    openedAt: Date | null,
    domainEvents: DomainEvent[],
  ) {
    super(id);
    this.#date = date;
    this.#status = status;
    this.#createdAt = copyDate(createdAt);
    this.#plannedAt = copyOptionalDate(plannedAt);
    this.#openedAt = copyOptionalDate(openedAt);
    this.#firstActivityAt = null;
    this.#completedAt = null;
    this.#summary = null;
    this.#sphereId = null;
    this.#mainDirectionId = null;
    this.#version = 1;
    this.#domainEvents = domainEvents;
  }

  public static plan(input: PlanDayInput): Day {
    if (!input.date.isAfter(input.currentDate)) {
      throw new DomainError(
        'day.planning_requires_future_date',
        'Запланировать можно только будущий день.',
      );
    }

    const createdEvent = new DayCreated(
      input.createdEventId,
      input.id,
      input.date,
      DAY_STATUS.planned,
      input.occurredAt,
    );

    return new Day(
      input.id,
      input.date,
      DAY_STATUS.planned,
      input.occurredAt,
      input.occurredAt,
      null,
      [createdEvent],
    );
  }

  public static createCurrentPlanned(input: CreateCurrentPlannedDayInput): Day {
    const createdEvent = new DayCreated(
      input.createdEventId,
      input.id,
      input.currentDate,
      DAY_STATUS.planned,
      input.occurredAt,
    );

    return new Day(
      input.id,
      input.currentDate,
      DAY_STATUS.planned,
      input.occurredAt,
      input.occurredAt,
      null,
      [createdEvent],
    );
  }

  public static openCurrent(input: CreateCurrentDayInput): Day {
    const createdEvent = new DayCreated(
      input.createdEventId,
      input.id,
      input.currentDate,
      DAY_STATUS.open,
      input.occurredAt,
    );
    const openedEvent = new DayOpened(
      input.openedEventId,
      input.id,
      input.currentDate,
      input.occurredAt,
    );

    return new Day(
      input.id,
      input.currentDate,
      DAY_STATUS.open,
      input.occurredAt,
      null,
      input.occurredAt,
      [createdEvent, openedEvent],
    );
  }

  public static rehydrate(data: DayRehydrationData): Day {
    assertRehydrationInvariants(data);

    const day = new Day(
      data.id,
      data.date,
      data.status,
      data.createdAt,
      data.plannedAt,
      data.openedAt,
      [],
    );
    day.#firstActivityAt = copyOptionalDate(data.firstActivityAt);
    day.#completedAt = copyOptionalDate(data.completedAt);
    day.#summary = data.summary;
    day.#sphereId = data.sphereId ?? null;
    day.#mainDirectionId = data.mainDirectionId ?? null;
    day.#version = data.version;
    return day;
  }

  public get date(): DayDate {
    return this.#date;
  }

  public get status(): DayStatus {
    return this.#status;
  }

  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  public get plannedAt(): Date | null {
    return copyOptionalDate(this.#plannedAt);
  }

  public get openedAt(): Date | null {
    return copyOptionalDate(this.#openedAt);
  }

  public get firstActivityAt(): Date | null {
    return copyOptionalDate(this.#firstActivityAt);
  }

  public get completedAt(): Date | null {
    return copyOptionalDate(this.#completedAt);
  }

  public get summary(): string | null {
    return this.#summary;
  }

  public get sphereId(): EntityId | null {
    return this.#sphereId;
  }

  public get mainDirectionId(): EntityId | null {
    return this.#mainDirectionId;
  }

  public setMainDirection(directionId: EntityId | null): void {
    if (this.#status === DAY_STATUS.completed)
      throw new DomainError(
        'day.completed_main_direction',
        'Главное направление завершённого дня нельзя менять.',
      );
    if (sameOptionalEntityId(this.#mainDirectionId, directionId)) return;
    this.#mainDirectionId = directionId;
    this.#version += 1;
  }

  public get version(): number {
    return this.#version;
  }

  public open(currentDate: DayDate, occurredAt: Date, eventId: EntityId): void {
    if (this.#status === DAY_STATUS.open) {
      return;
    }

    if (this.#status === DAY_STATUS.completed) {
      throw new DomainError('day.already_completed', 'Завершённый день нельзя открыть повторно.');
    }

    if (this.#date.isAfter(currentDate)) {
      throw new DomainError('day.open_too_early', 'Будущий день нельзя открыть раньше его даты.');
    }

    this.#status = DAY_STATUS.open;
    this.#openedAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new DayOpened(eventId, this.id, this.#date, occurredAt));
  }

  public recordFirstActivity(occurredAt: Date, eventId: EntityId): void {
    if (this.#status !== DAY_STATUS.open) {
      throw new DomainError(
        'day.first_activity_requires_open_day',
        'Первую активность можно записать только для открытого дня.',
      );
    }

    if (this.#firstActivityAt !== null) {
      return;
    }

    this.#firstActivityAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new DayFirstActivityRecorded(eventId, this.id, this.#date, occurredAt));
  }

  public complete(
    occurredAt: Date,
    eventId: EntityId,
    summary?: string,
    sphereId: EntityId | null = null,
  ): void {
    if (this.#status !== DAY_STATUS.open) {
      throw new DomainError(
        'day.completion_requires_open_day',
        'Завершить можно только открытый день.',
      );
    }

    this.#status = DAY_STATUS.completed;
    this.#completedAt = copyDate(occurredAt);
    this.#summary = summary ?? null;
    this.#sphereId = sphereId;
    this.#version += 1;
    this.#domainEvents.push(
      new DayCompleted(eventId, this.id, this.#date, this.#summary, this.#sphereId, occurredAt),
    );
  }

  public changeResultSphere(sphereId: EntityId | null): void {
    if (this.#status !== DAY_STATUS.completed) {
      throw new DomainError(
        'day.result_sphere_requires_completed_day',
        'Сферу результата можно изменить только после завершения дня.',
      );
    }
    if (sameOptionalEntityId(this.#sphereId, sphereId)) return;
    this.#sphereId = sphereId;
    this.#version += 1;
  }

  public isCurrent(currentDate: DayDate): boolean {
    return this.#date.equals(currentDate);
  }

  public isPastUnfinished(currentDate: DayDate): boolean {
    return this.#date.isBefore(currentDate) && this.#status !== DAY_STATUS.completed;
  }

  public requiresAttention(currentDate: DayDate): boolean {
    return this.isPastUnfinished(currentDate);
  }

  public getUncommittedEvents(): readonly DomainEvent[] {
    return [...this.#domainEvents];
  }

  public clearUncommittedEvents(): void {
    this.#domainEvents.length = 0;
  }
}

function sameOptionalEntityId(left: EntityId | null, right: EntityId | null): boolean {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

function assertRehydrationInvariants(data: DayRehydrationData): void {
  if (!(data.id instanceof EntityId)) {
    throw new DomainError('day.invalid_entity_id', 'Идентификатор дня должен быть корректным.');
  }

  if (!(data.date instanceof DayDate)) {
    throw new DomainError('day.invalid_date', 'Календарная дата дня должна быть корректной.');
  }

  const allowedStatuses: readonly string[] = Object.values(DAY_STATUS);
  if (!allowedStatuses.includes(data.status)) {
    throw new DomainError('day.invalid_status', 'Неизвестное состояние дня.');
  }

  assertValidDate(data.createdAt, 'Время создания дня');
  assertOptionalDate(data.plannedAt, 'Время планирования дня');
  assertOptionalDate(data.openedAt, 'Время открытия дня');
  assertOptionalDate(data.firstActivityAt, 'Время первой активности дня');
  assertOptionalDate(data.completedAt, 'Время завершения дня');

  if (!Number.isInteger(data.version) || data.version < 1) {
    throw new DomainError('day.invalid_version', 'Версия дня должна быть не меньше 1.');
  }

  if (data.summary !== null && typeof data.summary !== 'string') {
    throw new DomainError('day.invalid_summary', 'Итог дня должен быть строкой или null.');
  }

  if (
    data.status === DAY_STATUS.planned &&
    (data.plannedAt === null ||
      data.openedAt !== null ||
      data.firstActivityAt !== null ||
      data.completedAt !== null ||
      data.summary !== null)
  ) {
    throw new DomainError(
      'day.planned_fields_invalid',
      'Запланированный день содержит несовместимые поля состояния.',
    );
  }

  if (
    data.status === DAY_STATUS.open &&
    (data.openedAt === null || data.completedAt !== null || data.summary !== null)
  ) {
    throw new DomainError(
      'day.open_fields_invalid',
      'Открытый день содержит несовместимые поля состояния.',
    );
  }

  if (
    data.status === DAY_STATUS.completed &&
    (data.openedAt === null || data.completedAt === null)
  ) {
    throw new DomainError(
      'day.completed_fields_invalid',
      'Завершённый день должен содержать время открытия и завершения.',
    );
  }
}

function assertOptionalDate(value: Date | null, fieldName: string): void {
  if (value !== null) {
    assertValidDate(value, fieldName);
  }
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError('day.invalid_time', `${fieldName} содержит некорректное время.`);
  }
}
