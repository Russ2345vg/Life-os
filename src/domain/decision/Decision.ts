import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import type { DomainEvent } from '../shared/DomainEvent';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import { ActualResultSummary } from './ActualResultSummary';
import { DecisionCancelReason } from './DecisionCancelReason';
import { DECISION_KIND, type DecisionKind } from './DecisionKind';
import {
  DECISION_PRIORITY,
  assertDecisionPriority,
  type DecisionPriority,
} from './DecisionPriority';
import { DECISION_STATUS, type DecisionStatus } from './DecisionStatus';
import { DecisionTitle } from './DecisionTitle';
import { ExpectedResult } from './ExpectedResult';
import {
  DecisionArchived,
  DecisionCancelled,
  DecisionConfirmed,
  DecisionDetailsUpdated,
  DecisionSoftDeleted,
  DecisionSoftDeleteRestored,
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
  readonly sphereId?: EntityId | null;
  readonly price?: string;
  readonly sacrifices?: string;
  readonly priority?: DecisionPriority;
  readonly projectReference?: string;
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
  readonly title?: DecisionTitle;
  readonly reason?: string | null;
  readonly expectedResult?: ExpectedResult | null;
  readonly sphereId?: EntityId | null;
  readonly price?: string | null;
  readonly sacrifices?: string | null;
  readonly priority?: DecisionPriority;
  readonly projectReference?: string | null;
  readonly kind?: DecisionKind;
  readonly order?: number | null;
  readonly occurredAt: Date;
  readonly eventId: EntityId;
}

export interface DecisionRescheduleHistoryEntry {
  readonly previousPlannedDate: DayDate;
  readonly newPlannedDate: DayDate;
  readonly reason: string;
  readonly occurredAt: Date;
  readonly sequence: number;
}

export interface DecisionRehydrationData {
  readonly id: EntityId;
  readonly title: DecisionTitle;
  readonly reason: string | null;
  readonly sphereId?: EntityId | null;
  readonly price?: string | null;
  readonly sacrifices?: string | null;
  readonly priority?: DecisionPriority;
  readonly projectReference?: string | null;
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
  readonly deletedAt?: Date | null;
  readonly lastDeletedAt?: Date | null;
  readonly restoredFromTrashAt?: Date | null;
  readonly evidenceIds: readonly EntityId[];
  readonly rescheduleCount: number;
  readonly rescheduleHistory?: readonly DecisionRescheduleHistoryEntry[];
  readonly version: number;
}

export class Decision extends Entity {
  #title: DecisionTitle;
  readonly #createdAt: Date;
  readonly #domainEvents: DomainEvent[];
  #reason: string | null;
  #sphereId: EntityId | null;
  #price: string | null;
  #sacrifices: string | null;
  #priority: DecisionPriority;
  #projectReference: string | null;
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
  #deletedAt: Date | null;
  #lastDeletedAt: Date | null;
  #restoredFromTrashAt: Date | null;
  #evidenceIds: readonly EntityId[];
  #rescheduleCount: number;
  #rescheduleHistory: readonly DecisionRescheduleHistoryEntry[];
  #version: number;

  private constructor(data: DecisionRehydrationData, domainEvents: DomainEvent[]) {
    super(data.id);
    this.#title = data.title;
    this.#reason = normalizeOptionalDecisionField(
      data.reason,
      'Причина решения',
      1_000,
      'decision.invalid_reason',
    );
    this.#sphereId = data.sphereId ?? null;
    this.#price = normalizeOptionalDecisionField(
      data.price ?? null,
      'Цена решения',
      500,
      'decision.invalid_price',
    );
    this.#sacrifices = normalizeOptionalDecisionField(
      data.sacrifices ?? null,
      'Жертвы решения',
      1_000,
      'decision.invalid_sacrifices',
    );
    this.#priority = data.priority ?? DECISION_PRIORITY.normal;
    assertDecisionPriority(this.#priority);
    this.#projectReference = normalizeOptionalDecisionField(
      data.projectReference ?? null,
      'Связь с проектом',
      200,
      'decision.invalid_project_reference',
    );
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
    this.#deletedAt = copyOptionalDate(data.deletedAt ?? null);
    this.#lastDeletedAt = copyOptionalDate(data.lastDeletedAt ?? data.deletedAt ?? null);
    this.#restoredFromTrashAt = copyOptionalDate(data.restoredFromTrashAt ?? null);
    this.#evidenceIds = [...data.evidenceIds];
    this.#rescheduleCount = data.rescheduleCount;
    this.#rescheduleHistory = normalizeRescheduleHistory(data.rescheduleHistory ?? []);
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
        sphereId: input.sphereId ?? null,
        price: input.price ?? null,
        sacrifices: input.sacrifices ?? null,
        priority: input.priority ?? DECISION_PRIORITY.normal,
        projectReference: input.projectReference ?? null,
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
        deletedAt: null,
        lastDeletedAt: null,
        restoredFromTrashAt: null,
        evidenceIds: [],
        rescheduleCount: 0,
        rescheduleHistory: [],
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
        decision.#reason,
        decision.#sphereId,
        decision.#price,
        decision.#sacrifices,
        decision.#priority,
        decision.#projectReference,
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

  public get sphereId(): EntityId | null {
    return this.#sphereId;
  }

  public get price(): string | null {
    return this.#price;
  }

  public get sacrifices(): string | null {
    return this.#sacrifices;
  }

  public get priority(): DecisionPriority {
    return this.#priority;
  }

  public get projectReference(): string | null {
    return this.#projectReference;
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

  public get deletedAt(): Date | null {
    return copyOptionalDate(this.#deletedAt);
  }

  public get lastDeletedAt(): Date | null {
    return copyOptionalDate(this.#lastDeletedAt);
  }

  public get restoredFromTrashAt(): Date | null {
    return copyOptionalDate(this.#restoredFromTrashAt);
  }

  public get evidenceIds(): readonly EntityId[] {
    return [...this.#evidenceIds];
  }

  public get rescheduleCount(): number {
    return this.#rescheduleCount;
  }

  public get rescheduleHistory(): readonly DecisionRescheduleHistoryEntry[] {
    return this.#rescheduleHistory.map((entry) => ({
      previousPlannedDate: entry.previousPlannedDate,
      newPlannedDate: entry.newPlannedDate,
      reason: entry.reason,
      occurredAt: copyDate(entry.occurredAt),
      sequence: entry.sequence,
    }));
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

    if (this.#status !== DECISION_STATUS.planned && this.#status !== DECISION_STATUS.inProgress) {
      throw new DomainError(
        'decision.cannot_edit',
        'Редактировать можно только запланированное или выполняемое решение.',
      );
    }

    const title = input.title ?? this.#title;
    const reason = normalizeOptionalDecisionField(
      input.reason === undefined ? this.#reason : input.reason,
      'Причина решения',
      1_000,
      'decision.invalid_reason',
    );
    const expectedResult =
      input.expectedResult === undefined ? this.#expectedResult : input.expectedResult;
    const sphereId = input.sphereId === undefined ? this.#sphereId : input.sphereId;
    const price = normalizeOptionalDecisionField(
      input.price === undefined ? this.#price : input.price,
      'Цена решения',
      500,
      'decision.invalid_price',
    );
    const sacrifices = normalizeOptionalDecisionField(
      input.sacrifices === undefined ? this.#sacrifices : input.sacrifices,
      'Жертвы решения',
      1_000,
      'decision.invalid_sacrifices',
    );
    const priority = input.priority ?? this.#priority;
    const projectReference = normalizeOptionalDecisionField(
      input.projectReference === undefined ? this.#projectReference : input.projectReference,
      'Связь с проектом',
      200,
      'decision.invalid_project_reference',
    );
    const kind = input.kind ?? this.#kind;
    const order = input.order === undefined ? this.#order : input.order;

    assertDecisionTitle(title);
    assertDecisionKind(kind);
    assertDecisionPriority(priority);
    assertPlanningDetails(kind, expectedResult, order);

    if (this.#status === DECISION_STATUS.inProgress) {
      const changedLockedField =
        !this.#title.equals(title) ||
        this.#kind !== kind ||
        this.#order !== order ||
        !sameOptionalEntityId(this.#sphereId, sphereId) ||
        this.#priority !== priority ||
        this.#projectReference !== projectReference;

      if (changedLockedField) {
        throw new DomainError(
          'decision.started_fields_locked',
          'После начала дня можно уточнять только причину, ожидаемый результат, цену и жертвы.',
        );
      }
    }

    const hasSameExpectedResult = sameExpectedResult(this.#expectedResult, expectedResult);
    const unchanged =
      this.#title.equals(title) &&
      this.#reason === reason &&
      hasSameExpectedResult &&
      sameOptionalEntityId(this.#sphereId, sphereId) &&
      this.#price === price &&
      this.#sacrifices === sacrifices &&
      this.#priority === priority &&
      this.#projectReference === projectReference &&
      this.#kind === kind &&
      this.#order === order;

    if (unchanged) {
      return false;
    }

    assertValidDate(input.occurredAt, 'Время изменения решения');
    this.#title = title;
    this.#reason = reason;
    this.#expectedResult = expectedResult;
    this.#sphereId = sphereId;
    this.#price = price;
    this.#sacrifices = sacrifices;
    this.#priority = priority;
    this.#projectReference = projectReference;
    this.#kind = kind;
    this.#order = order;
    this.#version += 1;
    this.#domainEvents.push(
      new DecisionDetailsUpdated(input.eventId, this.id, title, expectedResult, input.occurredAt),
    );
    return true;
  }

  public reschedule(
    newDate: DayDate,
    reason: string,
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

    const normalizedReason = normalizeRescheduleReason(reason);
    assertValidDate(occurredAt, 'Время переноса решения');
    const previousDate = this.#plannedDate;
    const previousOrder = this.#order;
    const resolvedOrder = this.#kind === DECISION_KIND.main ? (newOrder ?? this.#order) : null;
    assertPlanningDetails(this.#kind, this.#expectedResult, resolvedOrder);
    this.#plannedDate = newDate;
    this.#order = resolvedOrder;
    this.#rescheduleCount += 1;
    this.#rescheduleHistory = [
      ...this.#rescheduleHistory,
      {
        previousPlannedDate: previousDate,
        newPlannedDate: newDate,
        reason: normalizedReason,
        occurredAt: copyDate(occurredAt),
        sequence: this.#rescheduleCount,
      },
    ];
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
        normalizedReason,
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

  public softDelete(occurredAt: Date, eventId: EntityId): void {
    if (this.#deletedAt !== null) {
      throw new DomainError('decision.already_deleted', 'Решение уже находится в корзине.');
    }

    if (this.#archivedAt !== null) {
      throw new DomainError(
        'decision.archived_cannot_be_deleted',
        'Архивированное решение нельзя переместить в корзину.',
      );
    }

    assertValidDate(occurredAt, 'Время удаления решения');
    this.#deletedAt = copyDate(occurredAt);
    this.#lastDeletedAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new DecisionSoftDeleted(eventId, this.id, occurredAt));
  }

  public restoreFromTrash(occurredAt: Date, eventId: EntityId): void {
    if (this.#deletedAt === null) {
      throw new DomainError(
        'decision.restore_requires_deleted',
        'Восстановить можно только решение из корзины.',
      );
    }

    assertValidDate(occurredAt, 'Время восстановления решения из корзины');
    this.#deletedAt = null;
    this.#restoredFromTrashAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new DecisionSoftDeleteRestored(eventId, this.id, occurredAt));
  }

  public isDeleted(): boolean {
    return this.#deletedAt !== null;
  }

  public isScheduledFor(date: DayDate): boolean {
    return this.#plannedDate?.equals(date) ?? false;
  }

  public isOverdue(currentDate: DayDate): boolean {
    return (
      this.#archivedAt === null &&
      this.#deletedAt === null &&
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
    if (this.#deletedAt !== null) {
      throw new DomainError(
        'decision.deleted_is_immutable',
        'Решение в корзине нельзя изменять. Сначала восстановите его.',
      );
    }

    if (this.#archivedAt !== null) {
      throw new DomainError(
        'decision.archived_is_immutable',
        'Архивированное решение нельзя изменять.',
      );
    }
  }
}

function normalizeRescheduleReason(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new DomainError('decision.reschedule_reason_required', 'Укажите причину переноса.');
  }

  if (normalized.length > 500) {
    throw new DomainError(
      'decision.reschedule_reason_too_long',
      'Причина переноса не должна превышать 500 символов.',
    );
  }

  return normalized;
}

function normalizeRescheduleHistory(
  entries: readonly DecisionRescheduleHistoryEntry[],
): readonly DecisionRescheduleHistoryEntry[] {
  return entries.map((entry, index) => {
    assertDayDate(entry.previousPlannedDate);
    assertDayDate(entry.newPlannedDate);
    assertValidDate(entry.occurredAt, 'Время переноса решения');
    const reason = normalizeRescheduleReason(entry.reason);
    const sequence = entry.sequence;
    if (!Number.isInteger(sequence) || sequence < 1 || sequence <= index) {
      throw new DomainError(
        'decision.invalid_reschedule_history',
        'История переносов решения содержит неверную последовательность.',
      );
    }
    return {
      previousPlannedDate: entry.previousPlannedDate,
      newPlannedDate: entry.newPlannedDate,
      reason,
      occurredAt: copyDate(entry.occurredAt),
      sequence,
    };
  });
}

function sameExpectedResult(left: ExpectedResult | null, right: ExpectedResult | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}

function sameOptionalEntityId(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
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

  const history = normalizeRescheduleHistory(data.rescheduleHistory ?? []);
  if (history.some((entry) => entry.sequence > data.rescheduleCount)) {
    throw new DomainError(
      'decision.invalid_reschedule_history',
      'История переносов не может превышать количество переносов.',
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
    data.deletedAt ?? null,
    data.lastDeletedAt ?? data.deletedAt ?? null,
    data.restoredFromTrashAt ?? null,
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

function normalizeOptionalDecisionField(
  value: string | null,
  fieldName: string,
  maximumLength: number,
  errorCode: string,
): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return null;
  }

  if (normalizedValue.length > maximumLength) {
    throw new DomainError(
      errorCode,
      `${fieldName} не может быть длиннее ${maximumLength} символов.`,
    );
  }

  return normalizedValue;
}
