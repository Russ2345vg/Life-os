import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import type { DomainEvent } from '../shared/DomainEvent';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import { ActualResultSummary } from './ActualResultSummary';
import { DecisionCancelReason } from './DecisionCancelReason';
import { DECISION_KIND, type DecisionKind } from './DecisionKind';
import { DECISION_STATUS, type DecisionStatus } from './DecisionStatus';
import { DecisionTitle } from './DecisionTitle';
import { ExpectedResult } from './ExpectedResult';
import {
  DecisionArchived,
  DecisionCancelled,
  DecisionConfirmed,
  DecisionDetailsUpdated,
  DecisionDraftCreated,
  DecisionPlanned,
  DecisionRescheduled,
  DecisionRestored,
  DecisionStarted,
} from './events';

export interface DecisionDraftInput {
  readonly id: EntityId;
  readonly title: DecisionTitle;
  readonly kind: DecisionKind;
  readonly reason?: string;
  readonly expectedResult?: ExpectedResult;
  readonly occurredAt: Date;
  readonly eventId: EntityId;
}

export interface DecisionPlanInput {
  readonly plannedDate: DayDate;
  readonly kind: DecisionKind;
  readonly order?: number | null;
  readonly expectedResult?: ExpectedResult;
  readonly occurredAt: Date;
  readonly eventId: EntityId;
}

export interface DecisionRestoreInput {
  readonly plannedDate: DayDate;
  readonly order?: number | null;
  readonly expectedResult?: ExpectedResult;
  readonly occurredAt: Date;
  readonly eventId: EntityId;
}

export interface DecisionDetailsUpdateInput {
  readonly title: DecisionTitle;
  readonly expectedResult: ExpectedResult | null;
  readonly occurredAt: Date;
  readonly eventId: EntityId;
}

export interface DecisionRehydrationData {
  readonly id: EntityId;
  readonly title: DecisionTitle;
  readonly reason: string | null;
  readonly expectedResult: ExpectedResult | null;
  readonly actualResultSummary: ActualResultSummary | null;
  readonly status: DecisionStatus;
  readonly kind: DecisionKind;
  readonly plannedDate: DayDate | null;
  readonly order: number | null;
  readonly createdAt: Date;
  readonly plannedAt: Date | null;
  readonly startedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: DecisionCancelReason | null;
  readonly archivedAt: Date | null;
  readonly evidenceIds: readonly EntityId[];
  readonly rescheduleCount: number;
  readonly version: number;
}

export class Decision extends Entity {
  #title: DecisionTitle;
  readonly #createdAt: Date;
  readonly #domainEvents: DomainEvent[];
  #reason: string | null;
  #expectedResult: ExpectedResult | null;
  #actualResultSummary: ActualResultSummary | null;
  #status: DecisionStatus;
  #kind: DecisionKind;
  #plannedDate: DayDate | null;
  #order: number | null;
  #plannedAt: Date | null;
  #startedAt: Date | null;
  #confirmedAt: Date | null;
  #cancelledAt: Date | null;
  #cancelReason: DecisionCancelReason | null;
  #archivedAt: Date | null;
  #evidenceIds: readonly EntityId[];
  #rescheduleCount: number;
  #version: number;

  private constructor(data: DecisionRehydrationData, domainEvents: DomainEvent[]) {
    super(data.id);
    this.#title = data.title;
    this.#reason = normalizeOptionalReason(data.reason);
    this.#expectedResult = data.expectedResult;
    this.#actualResultSummary = data.actualResultSummary;
    this.#status = data.status;
    this.#kind = data.kind;
    this.#plannedDate = data.plannedDate;
    this.#order = data.order;
    this.#createdAt = copyDate(data.createdAt);
    this.#plannedAt = copyOptionalDate(data.plannedAt);
    this.#startedAt = copyOptionalDate(data.startedAt);
    this.#confirmedAt = copyOptionalDate(data.confirmedAt);
    this.#cancelledAt = copyOptionalDate(data.cancelledAt);
    this.#cancelReason = data.cancelReason;
    this.#archivedAt = copyOptionalDate(data.archivedAt);
    this.#evidenceIds = [...data.evidenceIds];
    this.#rescheduleCount = data.rescheduleCount;
    this.#version = data.version;
    this.#domainEvents = domainEvents;
  }

  public static createDraft(input: DecisionDraftInput): Decision {
    assertDecisionKind(input.kind);
    assertDecisionTitle(input.title);
    assertValidDate(input.occurredAt, 'Время создания решения');

    const decision = new Decision(
      {
        id: input.id,
        title: input.title,
        reason: input.reason ?? null,
        expectedResult: input.expectedResult ?? null,
        actualResultSummary: null,
        status: DECISION_STATUS.draft,
        kind: input.kind,
        plannedDate: null,
        order: null,
        createdAt: input.occurredAt,
        plannedAt: null,
        startedAt: null,
        confirmedAt: null,
        cancelledAt: null,
        cancelReason: null,
        archivedAt: null,
        evidenceIds: [],
        rescheduleCount: 0,
        version: 1,
      },
      [],
    );

    decision.#domainEvents.push(
      new DecisionDraftCreated(
        input.eventId,
        decision.id,
        decision.#title,
        decision.#kind,
        input.occurredAt,
      ),
    );

    return decision;
  }

  public static rehydrate(data: DecisionRehydrationData): Decision {
    assertRehydrationInvariants(data);

    return new Decision(
      {
        ...data,
        evidenceIds: uniqueEntityIds(data.evidenceIds),
      },
      [],
    );
  }

  public get title(): DecisionTitle {
    return this.#title;
  }

  public get reason(): string | null {
    return this.#reason;
  }

  public get expectedResult(): ExpectedResult | null {
    return this.#expectedResult;
  }

  public get actualResultSummary(): ActualResultSummary | null {
    return this.#actualResultSummary;
  }

  public get status(): DecisionStatus {
    return this.#status;
  }

  public get kind(): DecisionKind {
    return this.#kind;
  }

  public get plannedDate(): DayDate | null {
    return this.#plannedDate;
  }

  public get order(): number | null {
    return this.#order;
  }

  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  public get plannedAt(): Date | null {
    return copyOptionalDate(this.#plannedAt);
  }

  public get startedAt(): Date | null {
    return copyOptionalDate(this.#startedAt);
  }

  public get confirmedAt(): Date | null {
    return copyOptionalDate(this.#confirmedAt);
  }

  public get cancelledAt(): Date | null {
    return copyOptionalDate(this.#cancelledAt);
  }

  public get cancelReason(): DecisionCancelReason | null {
    return this.#cancelReason;
  }

  public get archivedAt(): Date | null {
    return copyOptionalDate(this.#archivedAt);
  }

  public get evidenceIds(): readonly EntityId[] {
    return [...this.#evidenceIds];
  }

  public get rescheduleCount(): number {
    return this.#rescheduleCount;
  }

  public get version(): number {
    return this.#version;
  }

  public plan(input: DecisionPlanInput): void {
    this.assertNotArchived();

    if (this.#status !== DECISION_STATUS.draft) {
      throw new DomainError('decision.plan_requires_draft', 'Планировать можно только черновик.');
    }

    assertDecisionKind(input.kind);
    assertValidDate(input.occurredAt, 'Время планирования решения');
    const expectedResult = input.expectedResult ?? this.#expectedResult;
    const order = input.order ?? null;
    assertDayDate(input.plannedDate);
    assertPlanningDetails(input.kind, expectedResult, order);

    this.#kind = input.kind;
    this.#expectedResult = expectedResult;
    this.#plannedDate = input.plannedDate;
    this.#order = order;
    this.#status = DECISION_STATUS.planned;
    this.#plannedAt = copyDate(input.occurredAt);
    this.#version += 1;
    this.#domainEvents.push(
      new DecisionPlanned(
        input.eventId,
        this.id,
        input.plannedDate,
        input.kind,
        order,
        expectedResult,
        input.occurredAt,
      ),
    );
  }

  public markInProgress(occurredAt: Date, eventId: EntityId): void {
    this.assertNotArchived();

    if (this.#status === DECISION_STATUS.inProgress) {
      return;
    }

    if (this.#status !== DECISION_STATUS.planned || this.#plannedDate === null) {
      throw new DomainError(
        'decision.start_requires_planned',
        'Начать реализацию можно только для запланированного решения.',
      );
    }

    assertValidDate(occurredAt, 'Время начала реализации решения');
    this.#status = DECISION_STATUS.inProgress;
    this.#startedAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new DecisionStarted(eventId, this.id, this.#plannedDate, occurredAt));
  }

  public updateDetails(input: DecisionDetailsUpdateInput): boolean {
    this.assertNotArchived();

    if (this.#status !== DECISION_STATUS.planned) {
      throw new DomainError(
        'decision.cannot_edit',
        'Редактировать можно только запланированное решение.',
      );
    }

    assertDecisionTitle(input.title);
    assertPlanningDetails(this.#kind, input.expectedResult, this.#order);

    const hasSameExpectedResult =
      this.#expectedResult === null
        ? input.expectedResult === null
        : input.expectedResult !== null && this.#expectedResult.equals(input.expectedResult);

    if (this.#title.equals(input.title) && hasSameExpectedResult) {
      return false;
    }

    assertValidDate(input.occurredAt, 'Время изменения решения');
    this.#title = input.title;
    this.#expectedResult = input.expectedResult;
    this.#version += 1;
    this.#domainEvents.push(
      new DecisionDetailsUpdated(
        input.eventId,
        this.id,
        input.title,
        input.expectedResult,
        input.occurredAt,
      ),
    );
    return true;
  }

  public reschedule(
    newDate: DayDate,
    occurredAt: Date,
    eventId: EntityId,
    newOrder?: number | null,
  ): boolean {
    this.assertNotArchived();
    assertDayDate(newDate);

    if (
      (this.#status !== DECISION_STATUS.planned && this.#status !== DECISION_STATUS.inProgress) ||
      this.#plannedDate === null
    ) {
      throw new DomainError(
        'decision.reschedule_not_allowed',
        'Перенести можно только запланированное или выполняемое решение.',
      );
    }

    if (this.#plannedDate.equals(newDate)) {
      return false;
    }

    assertValidDate(occurredAt, 'Время переноса решения');
    const previousDate = this.#plannedDate;
    const previousOrder = this.#order;
    const resolvedOrder = this.#kind === DECISION_KIND.main ? (newOrder ?? this.#order) : null;
    assertPlanningDetails(this.#kind, this.#expectedResult, resolvedOrder);
    this.#plannedDate = newDate;
    this.#order = resolvedOrder;
    this.#rescheduleCount += 1;
    this.#version += 1;
    this.#domainEvents.push(
      new DecisionRescheduled(
        eventId,
        this.id,
        previousDate,
        newDate,
        previousOrder,
        resolvedOrder,
        this.#rescheduleCount,
        occurredAt,
      ),
    );
    return true;
  }

  public confirm(
    actualResultSummary: ActualResultSummary,
    evidenceIds: readonly EntityId[],
    occurredAt: Date,
    eventId: EntityId,
  ): void {
    this.assertNotArchived();

    if (this.#status !== DECISION_STATUS.planned && this.#status !== DECISION_STATUS.inProgress) {
      throw new DomainError(
        'decision.confirm_not_allowed',
        'Подтвердить можно только запланированное или выполняемое решение.',
      );
    }

    if (!(actualResultSummary instanceof ActualResultSummary)) {
      throw new DomainError(
        'decision.confirm_requires_actual_result',
        'Для подтверждения обязателен фактический результат.',
      );
    }

    const uniqueEvidenceIds = uniqueEntityIds(evidenceIds);

    if (uniqueEvidenceIds.length === 0) {
      throw new DomainError(
        'decision.confirm_requires_evidence',
        'Для подтверждения нужен хотя бы один источник результата.',
      );
    }

    assertValidDate(occurredAt, 'Время подтверждения решения');
    this.#startedAt ??= copyDate(occurredAt);
    this.#status = DECISION_STATUS.confirmed;
    this.#actualResultSummary = actualResultSummary;
    this.#evidenceIds = uniqueEvidenceIds;
    this.#confirmedAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(
      new DecisionConfirmed(eventId, this.id, actualResultSummary, uniqueEvidenceIds, occurredAt),
    );
  }

  public cancel(occurredAt: Date, eventId: EntityId, cancelReason?: DecisionCancelReason): void {
    this.assertNotArchived();

    if (
      this.#status !== DECISION_STATUS.draft &&
      this.#status !== DECISION_STATUS.planned &&
      this.#status !== DECISION_STATUS.inProgress
    ) {
      throw new DomainError(
        'decision.cancel_not_allowed',
        'Отменить можно только черновик, запланированное или выполняемое решение.',
      );
    }

    const reasonIsRequired =
      this.#kind === DECISION_KIND.main || this.#status === DECISION_STATUS.inProgress;

    if (reasonIsRequired && cancelReason === undefined) {
      throw new DomainError(
        'decision.cancel_reason_required',
        'Для отмены этого решения обязательна причина.',
      );
    }

    assertValidDate(occurredAt, 'Время отмены решения');
    const previousStatus = this.#status;
    this.#status = DECISION_STATUS.cancelled;
    this.#cancelledAt = copyDate(occurredAt);
    this.#cancelReason = cancelReason ?? null;
    this.#version += 1;
    this.#domainEvents.push(
      new DecisionCancelled(eventId, this.id, previousStatus, this.#cancelReason, occurredAt),
    );
  }

  public restore(input: DecisionRestoreInput): void {
    this.assertNotArchived();

    if (this.#status !== DECISION_STATUS.cancelled) {
      throw new DomainError(
        'decision.restore_requires_cancelled',
        'Восстановить можно только отменённое решение.',
      );
    }

    assertValidDate(input.occurredAt, 'Время восстановления решения');
    assertDayDate(input.plannedDate);
    const expectedResult = input.expectedResult ?? this.#expectedResult;
    const order = input.order === undefined ? this.#order : input.order;
    assertPlanningDetails(this.#kind, expectedResult, order);

    this.#expectedResult = expectedResult;
    this.#plannedDate = input.plannedDate;
    this.#order = order;
    this.#status = DECISION_STATUS.planned;
    this.#plannedAt = copyDate(input.occurredAt);
    this.#startedAt = null;
    this.#cancelledAt = null;
    this.#cancelReason = null;
    this.#version += 1;
    this.#domainEvents.push(
      new DecisionRestored(
        input.eventId,
        this.id,
        input.plannedDate,
        order,
        expectedResult,
        input.occurredAt,
      ),
    );
  }

  public archive(occurredAt: Date, eventId: EntityId): void {
    if (this.#archivedAt !== null) {
      return;
    }

    if (this.#status !== DECISION_STATUS.confirmed && this.#status !== DECISION_STATUS.cancelled) {
      throw new DomainError(
        'decision.archive_requires_final_status',
        'Архивировать можно только подтверждённое или отменённое решение.',
      );
    }

    assertValidDate(occurredAt, 'Время архивирования решения');
    this.#archivedAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new DecisionArchived(eventId, this.id, this.#status, occurredAt));
  }

  public isScheduledFor(date: DayDate): boolean {
    return this.#plannedDate?.equals(date) ?? false;
  }

  public isOverdue(currentDate: DayDate): boolean {
    return (
      this.#archivedAt === null &&
      this.#plannedDate !== null &&
      this.#plannedDate.isBefore(currentDate) &&
      (this.#status === DECISION_STATUS.planned || this.#status === DECISION_STATUS.inProgress)
    );
  }

  public requiresAttention(currentDate: DayDate): boolean {
    return this.isOverdue(currentDate);
  }

  public isArchived(): boolean {
    return this.#archivedAt !== null;
  }

  public getUncommittedEvents(): readonly DomainEvent[] {
    return [...this.#domainEvents];
  }

  public clearUncommittedEvents(): void {
    this.#domainEvents.length = 0;
  }

  private assertNotArchived(): void {
    if (this.#archivedAt !== null) {
      throw new DomainError(
        'decision.archived_is_immutable',
        'Архивированное решение нельзя изменять.',
      );
    }
  }
}

function assertPlanningDetails(
  kind: DecisionKind,
  expectedResult: ExpectedResult | null,
  order: number | null,
): void {
  if (kind === DECISION_KIND.main) {
    if (expectedResult === null) {
      throw new DomainError(
        'decision.main_requires_expected_result',
        'Главное решение должно иметь ожидаемый результат.',
      );
    }

    if (!Number.isInteger(order) || order === null || order < 1 || order > 3) {
      throw new DomainError(
        'decision.main_invalid_order',
        'Порядок главного решения должен быть целым числом от 1 до 3.',
      );
    }

    return;
  }

  if (order !== null && (!Number.isInteger(order) || order < 1)) {
    throw new DomainError(
      'decision.additional_invalid_order',
      'Порядок дополнительного решения должен быть положительным целым числом.',
    );
  }
}

function assertRehydrationInvariants(data: DecisionRehydrationData): void {
  assertDecisionStatus(data.status);
  assertDecisionKind(data.kind);
  assertDecisionTitle(data.title);
  assertValidDate(data.createdAt, 'Время создания решения');

  if (!Number.isInteger(data.version) || data.version < 1) {
    throw new DomainError('decision.invalid_version', 'Версия решения должна быть не меньше 1.');
  }

  if (!Number.isInteger(data.rescheduleCount) || data.rescheduleCount < 0) {
    throw new DomainError(
      'decision.invalid_reschedule_count',
      'Количество переносов не может быть отрицательным.',
    );
  }

  const isScheduledStatus =
    data.status === DECISION_STATUS.planned ||
    data.status === DECISION_STATUS.inProgress ||
    data.status === DECISION_STATUS.confirmed;

  if (isScheduledStatus && (data.plannedDate === null || data.plannedAt === null)) {
    throw new DomainError(
      'decision.scheduled_fields_required',
      'Запланированное решение должно иметь дату и время планирования.',
    );
  }

  if (data.plannedDate !== null) {
    assertDayDate(data.plannedDate);
  }

  if (isScheduledStatus) {
    assertPlanningDetails(data.kind, data.expectedResult, data.order);
  }

  if (
    (data.status === DECISION_STATUS.inProgress || data.status === DECISION_STATUS.confirmed) &&
    data.startedAt === null
  ) {
    throw new DomainError(
      'decision.started_at_required',
      'Выполняемое или подтверждённое решение должно иметь время начала.',
    );
  }

  if (
    data.status === DECISION_STATUS.confirmed &&
    (data.actualResultSummary === null ||
      data.confirmedAt === null ||
      uniqueEntityIds(data.evidenceIds).length === 0)
  ) {
    throw new DomainError(
      'decision.confirmed_fields_required',
      'Подтверждённое решение должно иметь результат, время и подтверждения.',
    );
  }

  if (data.status === DECISION_STATUS.cancelled && data.cancelledAt === null) {
    throw new DomainError(
      'decision.cancelled_at_required',
      'Отменённое решение должно иметь время отмены.',
    );
  }

  if (
    data.status === DECISION_STATUS.cancelled &&
    (data.kind === DECISION_KIND.main || data.startedAt !== null) &&
    data.cancelReason === null
  ) {
    throw new DomainError(
      'decision.cancel_reason_required',
      'Отменённое главное или ранее выполнявшееся решение должно иметь причину.',
    );
  }

  if (
    data.status !== DECISION_STATUS.confirmed &&
    (data.actualResultSummary !== null ||
      data.confirmedAt !== null ||
      uniqueEntityIds(data.evidenceIds).length > 0)
  ) {
    throw new DomainError(
      'decision.unconfirmed_has_result',
      'Неподтверждённое решение не может иметь подтверждённый результат.',
    );
  }

  if (
    data.archivedAt !== null &&
    data.status !== DECISION_STATUS.confirmed &&
    data.status !== DECISION_STATUS.cancelled
  ) {
    throw new DomainError(
      'decision.invalid_archive_status',
      'Архивировано может быть только подтверждённое или отменённое решение.',
    );
  }

  for (const date of [
    data.plannedAt,
    data.startedAt,
    data.confirmedAt,
    data.cancelledAt,
    data.archivedAt,
  ]) {
    if (date !== null) {
      assertValidDate(date, 'Временное поле решения');
    }
  }
}

function assertDecisionStatus(status: DecisionStatus): void {
  const allowedStatuses: readonly string[] = Object.values(DECISION_STATUS);

  if (!allowedStatuses.includes(status)) {
    throw new DomainError('decision.invalid_status', 'Неизвестное состояние решения.');
  }
}

function assertDecisionKind(kind: DecisionKind): void {
  const allowedKinds: readonly string[] = Object.values(DECISION_KIND);

  if (!allowedKinds.includes(kind)) {
    throw new DomainError('decision.invalid_kind', 'Неизвестный вид решения.');
  }
}

function assertDecisionTitle(title: DecisionTitle): void {
  if (!(title instanceof DecisionTitle)) {
    throw new DomainError('decision.title_required', 'Решение должно иметь название.');
  }
}

function assertDayDate(date: DayDate): void {
  if (!(date instanceof DayDate)) {
    throw new DomainError('decision.planned_date_required', 'Решению необходима календарная дата.');
  }
}

function assertValidDate(value: Date, fieldName: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new DomainError('decision.invalid_time', `${fieldName} содержит некорректное время.`);
  }
}

function uniqueEntityIds(values: readonly EntityId[]): readonly EntityId[] {
  const uniqueValues = new Map<string, EntityId>();

  for (const value of values) {
    if (!uniqueValues.has(value.toString())) {
      uniqueValues.set(value.toString(), value);
    }
  }

  return [...uniqueValues.values()];
}

function normalizeOptionalReason(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length === 0 ? null : normalizedValue;
}
