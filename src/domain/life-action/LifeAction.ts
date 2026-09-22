import type { ActionPriority, ActionOccurrence } from '../planner/RecurrenceRule';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import type { DomainEvent } from '../shared/DomainEvent';
import { Entity } from '../shared/Entity';
import { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import { ActionActualResult } from './ActionActualResult';
import { ActionCancelReason } from './ActionCancelReason';
import { ActionExpectedResult } from './ActionExpectedResult';
import { LIFE_ACTION_STATUS, type LifeActionStatus } from './LifeActionStatus';
import { LifeActionTitle } from './LifeActionTitle';
import {
  LifeActionArchived,
  LifeActionCancelled,
  LifeActionCompleted,
  LifeActionDetailsUpdated,
  LifeActionDraftCreated,
  LifeActionReady,
  LifeActionRescheduled,
  LifeActionStarted,
} from './events';

export interface LifeActionDraftInput {
  readonly id: EntityId;
  readonly title: LifeActionTitle;
  readonly description?: string;
  readonly decisionId?: EntityId;
  readonly sphereId?: EntityId | null;
  readonly goalId?: EntityId | null;
  readonly directionId?: EntityId | null;
  readonly parentActionId?: EntityId | null;
  readonly plannedDate?: DayDate | null;
  readonly isNext?: boolean;
  readonly createdAt: Date;
  readonly eventId: EntityId;
}

export interface LifeActionReadyInput {
  readonly expectedResult: ActionExpectedResult;
  readonly sphereId?: EntityId | null;
  readonly plannedDate: DayDate;
  readonly occurredAt: Date;
  readonly eventId: EntityId;
}

export interface LifeActionDetailsUpdateInput {
  readonly title: LifeActionTitle;
  readonly description: string | null;
  readonly expectedResult: ActionExpectedResult;
  readonly sphereId?: EntityId | null;
  readonly occurredAt: Date;
  readonly eventId: EntityId;
}

export interface LifeActionRehydrationData {
  readonly priority?: ActionPriority | null;
  readonly occurrence?: ActionOccurrence | null;
  readonly completionGeneration?: number;
  readonly expectedContributions?: readonly { id: string; goalId: string }[] | null;
  readonly completedOn?: string | null;
  readonly id: EntityId;
  readonly title: LifeActionTitle;
  readonly description: string | null;
  readonly expectedResult: ActionExpectedResult | null;
  readonly actualResult: ActionActualResult | null;
  readonly status: LifeActionStatus;
  readonly decisionId: EntityId | null;
  readonly sphereId?: EntityId | null;
  readonly goalId?: EntityId | null;
  readonly directionId?: EntityId | null;
  readonly parentActionId?: EntityId | null;
  readonly isNext?: boolean;
  readonly plannedDate: DayDate | null;
  readonly createdAt: Date;
  readonly readyAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: ActionCancelReason | null;
  readonly archivedAt: Date | null;
  readonly rescheduleCount: number;
  readonly version: number;
}

export class LifeAction extends Entity {
  #priority: ActionPriority | null;
  #occurrence: ActionOccurrence | null;
  #completionGeneration: number;
  #expectedContributions: readonly { id: string; goalId: string }[] | null;
  #completedOn: string | null;
  #title: LifeActionTitle;
  #description: string | null;
  readonly #decisionId: EntityId | null;
  #sphereId: EntityId | null;
  #goalId: EntityId | null;
  readonly #directionId: EntityId | null;
  #parentActionId: EntityId | null;
  #isNext: boolean;
  readonly #createdAt: Date;
  readonly #domainEvents: DomainEvent[];
  #expectedResult: ActionExpectedResult | null;
  #actualResult: ActionActualResult | null;
  #status: LifeActionStatus;
  #plannedDate: DayDate | null;
  #readyAt: Date | null;
  #startedAt: Date | null;
  #completedAt: Date | null;
  #cancelledAt: Date | null;
  #cancelReason: ActionCancelReason | null;
  #archivedAt: Date | null;
  #rescheduleCount: number;
  #version: number;

  private constructor(data: LifeActionRehydrationData, domainEvents: DomainEvent[]) {
    super(data.id);
    this.#expectedContributions = data.expectedContributions ?? null;
    if (
      this.#expectedContributions !== null &&
      (!Array.isArray(this.#expectedContributions) ||
        this.#expectedContributions.some(
          (v) =>
            !v || typeof v.id !== 'string' || !v.id || typeof v.goalId !== 'string' || !v.goalId,
        ))
    )
      throw new DomainError('progress.invalid_manifest', 'Неверный список ожидаемых вкладов.');
    this.#completedOn = data.completedOn ?? data.completedAt?.toISOString().slice(0, 10) ?? null;
    if (this.#completedOn !== null) DayDate.create(this.#completedOn);
    this.#priority = null;
    this.#occurrence = null;
    this.#completionGeneration = data.completionGeneration ?? 0;
    if (!Number.isInteger(this.#completionGeneration) || this.#completionGeneration < 0)
      throw new DomainError('life_action.invalid_generation', 'Неверное поколение выполнения.');
    this.validatePlanningMetadata(data.priority ?? null, data.occurrence ?? null);
    this.#priority = data.priority ?? null;
    this.#occurrence = data.occurrence ? Object.freeze({ ...data.occurrence }) : null;
    this.#title = data.title;
    this.#description = normalizeOptionalDescription(data.description);
    this.#expectedResult = data.expectedResult;
    this.#actualResult = data.actualResult;
    this.#status = data.status;
    this.#decisionId = data.decisionId;
    this.#sphereId = data.sphereId ?? null;
    this.#goalId = data.goalId ?? null;
    this.#directionId = data.directionId ?? null;
    this.#parentActionId = data.parentActionId ?? null;
    if (this.#parentActionId?.equals(data.id))
      throw new DomainError(
        'life_action.self_parent',
        'Действие не может быть собственным поддействием.',
      );
    this.#isNext = data.isNext ?? false;
    this.#plannedDate = data.plannedDate;
    this.#createdAt = copyDate(data.createdAt);
    this.#readyAt = copyOptionalDate(data.readyAt);
    this.#startedAt = copyOptionalDate(data.startedAt);
    this.#completedAt = copyOptionalDate(data.completedAt);
    this.#cancelledAt = copyOptionalDate(data.cancelledAt);
    this.#cancelReason = data.cancelReason;
    this.#archivedAt = copyOptionalDate(data.archivedAt);
    this.#rescheduleCount = data.rescheduleCount;
    this.#version = data.version;
    this.#domainEvents = domainEvents;
  }

  public get expectedContributions() {
    return this.#expectedContributions;
  }
  public recordContributionManifest(values: readonly { id: string; goalId: string }[]): void {
    if (
      this.#status !== 'completed' ||
      (values.length === 0 && this.#expectedContributions === null)
    )
      return;
    const entries = new Map(
      [...(this.#expectedContributions ?? []), ...values].map((v) => [v.id, v]),
    );
    const next = [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
    if (JSON.stringify(next) === JSON.stringify(this.#expectedContributions)) return;
    this.#expectedContributions = Object.freeze(next.map((v) => Object.freeze({ ...v })));
    this.#version++;
  }
  public reviseRecurrence(
    title: LifeActionTitle,
    goalId: EntityId | null,
    priority: ActionPriority | null,
    date: DayDate,
    revision: number,
  ): void {
    if (!this.#occurrence || this.#status !== LIFE_ACTION_STATUS.draft) return;
    assertLifeActionTitle(title);
    assertDayDate(date);
    this.#title = title;
    this.setGoal(goalId);
    if (!this.#occurrence.manualDate) this.setPlan(date, this.#isNext);
    this.setPlanningMetadata({
      priority,
      occurrence: { ...this.#occurrence, ruleRevision: revision },
    });
    this.#version++;
  }
  public get completedOn(): string | null {
    return this.#completedOn;
  }
  public get priority(): ActionPriority | null {
    return this.#priority;
  }
  public get occurrence(): ActionOccurrence | null {
    return this.#occurrence;
  }
  public get completionGeneration(): number {
    return this.#completionGeneration;
  }
  public get completionKey(): string {
    return `${this.id.toString()}:completion:${this.#completionGeneration}`;
  }
  public setPlanningMetadata(input: {
    priority?: ActionPriority | null;
    occurrence?: ActionOccurrence | null;
  }): void {
    this.assertNotArchived();
    const priority = input.priority === undefined ? this.#priority : input.priority;
    const occurrence = input.occurrence === undefined ? this.#occurrence : input.occurrence;
    this.validatePlanningMetadata(priority, occurrence);
    if (
      priority === this.#priority &&
      JSON.stringify(occurrence) === JSON.stringify(this.#occurrence)
    )
      return;
    this.#priority = priority;
    this.#occurrence = occurrence ? Object.freeze({ ...occurrence }) : null;
    this.#version += 1;
  }
  private validatePlanningMetadata(
    priority: ActionPriority | null,
    occurrence: ActionOccurrence | null,
  ): void {
    if (priority !== null && !['high', 'normal', 'low'].includes(priority))
      throw new DomainError('life_action.invalid_priority', 'Неверный приоритет.');
    if (occurrence !== null) {
      if (
        !occurrence.ruleId ||
        !occurrence.slot ||
        !Number.isInteger(occurrence.ruleRevision) ||
        occurrence.ruleRevision < 1
      )
        throw new DomainError('life_action.invalid_occurrence', 'Неверное повторение.');
      DayDate.create(occurrence.originalDate);
    }
  }
  public restoreScheduledOccurrence(): void {
    if (
      !this.#occurrence ||
      this.#status !== 'cancelled' ||
      this.#cancelReason?.toString() !== 'Расписание временно недоступно'
    )
      return;
    this.#status = LIFE_ACTION_STATUS.draft;
    this.#cancelledAt = null;
    this.#cancelReason = null;
    this.#readyAt = null;
    this.#expectedResult = null;
    this.#startedAt = null;
    this.#version++;
  }
  public reopen(occurredAt: Date): void {
    this.assertNotArchived();
    assertValidDate(occurredAt, 'Время повторного открытия');
    if (this.#status !== LIFE_ACTION_STATUS.completed) return;
    this.#status = LIFE_ACTION_STATUS.draft;
    this.#actualResult = null;
    this.#completedAt = null;
    this.#completedOn = null;
    this.#startedAt = null;
    this.#readyAt = null;
    this.#completionGeneration += 1;
    this.#expectedContributions = null;
    this.#version += 1;
  }

  public static createDraft(input: LifeActionDraftInput): LifeAction {
    assertLifeActionTitle(input.title);
    assertValidDate(input.createdAt, 'Время создания действия');
    assertOptionalDecisionId(input.decisionId ?? null);
    if (input.plannedDate != null) assertDayDate(input.plannedDate);
    if (input.isNext && input.plannedDate == null) {
      throw new DomainError('life_action.main_requires_date', 'Выберите дату главного действия.');
    }

    const lifeAction = new LifeAction(
      {
        id: input.id,
        title: input.title,
        description: input.description ?? null,
        expectedResult: null,
        actualResult: null,
        status: LIFE_ACTION_STATUS.draft,
        decisionId: input.decisionId ?? null,
        sphereId: input.sphereId ?? null,
        goalId: input.goalId ?? null,
        directionId: input.directionId ?? null,
        parentActionId: input.parentActionId ?? null,
        isNext: input.isNext ?? false,
        plannedDate: input.plannedDate ?? null,
        createdAt: input.createdAt,
        readyAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelReason: null,
        archivedAt: null,
        rescheduleCount: 0,
        version: 1,
      },
      [],
    );

    lifeAction.#domainEvents.push(
      new LifeActionDraftCreated(
        input.eventId,
        lifeAction.id,
        lifeAction.#title,
        lifeAction.#decisionId,
        input.createdAt,
      ),
    );

    return lifeAction;
  }

  public static rehydrate(data: LifeActionRehydrationData): LifeAction {
    assertRehydrationInvariants(data);
    return new LifeAction(data, []);
  }

  public get title(): LifeActionTitle {
    return this.#title;
  }

  public get description(): string | null {
    return this.#description;
  }

  public get expectedResult(): ActionExpectedResult | null {
    return this.#expectedResult;
  }

  public get actualResult(): ActionActualResult | null {
    return this.#actualResult;
  }

  public get status(): LifeActionStatus {
    return this.#status;
  }

  public get decisionId(): EntityId | null {
    return this.#decisionId;
  }

  public get directionId(): EntityId | null {
    return this.#directionId;
  }

  public get sphereId(): EntityId | null {
    return this.#sphereId;
  }

  public get goalId(): EntityId | null {
    return this.#goalId;
  }

  public get parentActionId(): EntityId | null {
    return this.#parentActionId;
  }

  public setParentAction(parentActionId: EntityId | null): boolean {
    this.assertNotArchived();
    if (parentActionId?.equals(this.id))
      throw new DomainError(
        'life_action.self_parent',
        'Действие не может быть собственным поддействием.',
      );
    if (sameOptionalEntityId(this.#parentActionId, parentActionId)) return false;
    this.#parentActionId = parentActionId;
    this.#version += 1;
    return true;
  }

  public updateDraftDetails(title: LifeActionTitle, description: string | null): boolean {
    this.assertNotArchived();
    if (this.#status !== LIFE_ACTION_STATUS.draft)
      throw new DomainError(
        'action.cannot_edit',
        'Редактировать можно только открытый черновик действия.',
      );
    assertLifeActionTitle(title);
    const normalized = normalizeOptionalDescription(description);
    if (this.#title.equals(title) && this.#description === normalized) return false;
    this.#title = title;
    this.#description = normalized;
    this.#version += 1;
    return true;
  }

  public get isNext(): boolean {
    return this.#isNext;
  }

  public get plannedDate(): DayDate | null {
    return this.#plannedDate;
  }

  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  public get readyAt(): Date | null {
    return copyOptionalDate(this.#readyAt);
  }

  public get startedAt(): Date | null {
    return copyOptionalDate(this.#startedAt);
  }

  public get completedAt(): Date | null {
    return copyOptionalDate(this.#completedAt);
  }

  public get cancelledAt(): Date | null {
    return copyOptionalDate(this.#cancelledAt);
  }

  public get cancelReason(): ActionCancelReason | null {
    return this.#cancelReason;
  }

  public get archivedAt(): Date | null {
    return copyOptionalDate(this.#archivedAt);
  }

  public get rescheduleCount(): number {
    return this.#rescheduleCount;
  }

  public get version(): number {
    return this.#version;
  }

  public setGoal(goalId: EntityId | null): boolean {
    this.assertNotArchived();
    if (sameOptionalEntityId(this.#goalId, goalId)) return false;
    this.#goalId = goalId;
    this.#version += 1;
    return true;
  }

  public setPlan(plannedDate: DayDate | null, isNext: boolean): boolean {
    this.assertNotArchived();
    if (this.#status === LIFE_ACTION_STATUS.cancelled) {
      throw new DomainError(
        'life_action.plan_requires_open',
        'Планировать можно только открытое действие.',
      );
    }
    if (
      plannedDate === null &&
      (this.#expectedResult !== null || this.#readyAt !== null || this.#startedAt !== null)
    ) {
      throw new DomainError(
        'life_action.legacy_date_required',
        'У подготовленного действия можно изменить дату, но нельзя убрать её.',
      );
    }
    if (plannedDate !== null) assertDayDate(plannedDate);
    if (isNext && plannedDate === null) {
      throw new DomainError('life_action.main_requires_date', 'Выберите дату главного действия.');
    }
    const sameDate =
      this.#plannedDate === null
        ? plannedDate === null
        : plannedDate !== null && this.#plannedDate.equals(plannedDate);
    if (
      this.#status !== LIFE_ACTION_STATUS.draft &&
      this.#status !== LIFE_ACTION_STATUS.completed &&
      !sameDate
    ) {
      throw new DomainError(
        'life_action.plan_requires_reschedule',
        'Измените дату подготовленного действия через перенос.',
      );
    }
    if (sameDate && this.#isNext === isNext) return false;
    this.#plannedDate = plannedDate;
    this.#isNext = isNext;
    this.#version += 1;
    return true;
  }

  public makeReady(input: LifeActionReadyInput): void {
    this.assertNotArchived();

    if (this.#status !== LIFE_ACTION_STATUS.draft) {
      throw new DomainError(
        'life_action.make_ready_requires_draft',
        'Подготовить к выполнению можно только черновик действия.',
      );
    }

    assertExpectedResult(input.expectedResult);
    assertDayDate(input.plannedDate);
    assertValidDate(input.occurredAt, 'Время подготовки действия');

    this.#expectedResult = input.expectedResult;
    this.#plannedDate = input.plannedDate;
    this.#status = LIFE_ACTION_STATUS.ready;
    this.#readyAt = copyDate(input.occurredAt);
    this.#version += 1;
    this.#domainEvents.push(
      new LifeActionReady(
        input.eventId,
        this.id,
        input.expectedResult,
        input.plannedDate,
        input.occurredAt,
      ),
    );
  }

  public markInProgress(occurredAt: Date, eventId: EntityId): void {
    this.assertNotArchived();

    if (this.#status === LIFE_ACTION_STATUS.inProgress) {
      return;
    }

    if (this.#status !== LIFE_ACTION_STATUS.ready || this.#plannedDate === null) {
      throw new DomainError(
        'life_action.start_requires_ready',
        'Начать выполнение можно только для готового действия.',
      );
    }

    assertValidDate(occurredAt, 'Время начала выполнения действия');
    this.#status = LIFE_ACTION_STATUS.inProgress;
    this.#startedAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new LifeActionStarted(eventId, this.id, this.#plannedDate, occurredAt));
  }

  public updateDetails(input: LifeActionDetailsUpdateInput): boolean {
    this.assertNotArchived();

    if (this.#status !== LIFE_ACTION_STATUS.ready) {
      throw new DomainError('action.cannot_edit', 'Редактировать можно только готовое действие.');
    }

    assertLifeActionTitle(input.title);
    assertExpectedResult(input.expectedResult);
    const description = normalizeOptionalDescription(input.description);
    const sphereId = input.sphereId === undefined ? this.#sphereId : input.sphereId;

    if (
      this.#title.equals(input.title) &&
      this.#description === description &&
      this.#expectedResult?.equals(input.expectedResult) &&
      sameOptionalEntityId(this.#sphereId, sphereId)
    ) {
      return false;
    }

    assertValidDate(input.occurredAt, 'Время изменения действия');
    this.#title = input.title;
    this.#description = description;
    this.#expectedResult = input.expectedResult;
    this.#sphereId = sphereId;
    this.#version += 1;
    this.#domainEvents.push(
      new LifeActionDetailsUpdated(
        input.eventId,
        this.id,
        input.title,
        description,
        input.expectedResult,
        input.occurredAt,
      ),
    );
    return true;
  }

  public reschedule(newDate: DayDate, occurredAt: Date, eventId: EntityId): void {
    this.assertNotArchived();
    assertDayDate(newDate);

    if (
      (this.#status !== LIFE_ACTION_STATUS.ready &&
        this.#status !== LIFE_ACTION_STATUS.inProgress) ||
      this.#plannedDate === null
    ) {
      throw new DomainError(
        'life_action.reschedule_not_allowed',
        'Перенести можно только готовое или выполняемое действие.',
      );
    }

    if (this.#plannedDate.equals(newDate)) {
      throw new DomainError(
        'life_action.reschedule_same_date',
        'Новая дата действия должна отличаться от текущей.',
      );
    }

    assertValidDate(occurredAt, 'Время переноса действия');
    const previousDate = this.#plannedDate;
    this.#plannedDate = newDate;
    this.#rescheduleCount += 1;
    this.#version += 1;
    this.#domainEvents.push(
      new LifeActionRescheduled(
        eventId,
        this.id,
        previousDate,
        newDate,
        this.#rescheduleCount,
        occurredAt,
      ),
    );
  }

  public complete(
    actualResult: ActionActualResult | null,
    occurredAt: Date,
    eventId: EntityId,
  ): void {
    this.assertNotArchived();

    if (this.#status === LIFE_ACTION_STATUS.completed) return;

    if (this.#status === LIFE_ACTION_STATUS.cancelled) {
      throw new DomainError(
        'life_action.complete_requires_open',
        'Завершить можно только открытое действие.',
      );
    }

    if (actualResult !== null) assertActualResult(actualResult);
    assertValidDate(occurredAt, 'Время завершения действия');
    this.#status = LIFE_ACTION_STATUS.completed;
    this.#actualResult = actualResult;
    this.#completedAt = copyDate(occurredAt);
    this.#completedOn = DayDate.fromParts(
      occurredAt.getFullYear(),
      occurredAt.getMonth() + 1,
      occurredAt.getDate(),
    ).toString();
    this.#version += 1;
    this.#domainEvents.push(new LifeActionCompleted(eventId, this.id, actualResult, occurredAt));
  }

  public cancel(occurredAt: Date, eventId: EntityId, cancelReason: ActionCancelReason): void {
    this.assertNotArchived();

    if (
      this.#status !== LIFE_ACTION_STATUS.draft &&
      this.#status !== LIFE_ACTION_STATUS.ready &&
      this.#status !== LIFE_ACTION_STATUS.inProgress
    ) {
      throw new DomainError(
        'life_action.cancel_not_allowed',
        'Отменить можно только черновик, готовое или выполняемое действие.',
      );
    }

    assertCancelReason(cancelReason);
    assertValidDate(occurredAt, 'Время отмены действия');
    const previousStatus = this.#status;
    this.#status = LIFE_ACTION_STATUS.cancelled;
    this.#cancelledAt = copyDate(occurredAt);
    this.#cancelReason = cancelReason;
    this.#version += 1;
    this.#domainEvents.push(
      new LifeActionCancelled(eventId, this.id, previousStatus, cancelReason, occurredAt),
    );
  }

  public correctActualResult(actualResult: ActionActualResult): boolean {
    if (this.#status !== LIFE_ACTION_STATUS.completed) {
      throw new DomainError(
        'life_action.actual_result_correction_requires_completed',
        'Исправить фактический результат можно только у завершённого действия.',
      );
    }
    assertActualResult(actualResult);
    if (this.#actualResult?.equals(actualResult) ?? false) return false;

    this.#actualResult = actualResult;
    this.#version += 1;
    return true;
  }

  public correctCancellationReason(cancelReason: ActionCancelReason): boolean {
    if (this.#status !== LIFE_ACTION_STATUS.cancelled) {
      throw new DomainError(
        'life_action.cancel_reason_correction_requires_cancelled',
        'Исправить причину отмены можно только у отменённого действия.',
      );
    }
    assertCancelReason(cancelReason);
    if (this.#cancelReason?.equals(cancelReason) ?? false) return false;

    this.#cancelReason = cancelReason;
    this.#version += 1;
    return true;
  }

  public archive(occurredAt: Date, eventId: EntityId): void {
    if (this.#archivedAt !== null) {
      return;
    }

    if (
      this.#status !== LIFE_ACTION_STATUS.completed &&
      this.#status !== LIFE_ACTION_STATUS.cancelled
    ) {
      throw new DomainError(
        'life_action.archive_requires_final_status',
        'Архивировать можно только завершённое или отменённое действие.',
      );
    }

    assertValidDate(occurredAt, 'Время архивирования действия');
    this.#archivedAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new LifeActionArchived(eventId, this.id, this.#status, occurredAt));
  }

  public isScheduledFor(date: DayDate): boolean {
    return this.#plannedDate?.equals(date) ?? false;
  }

  public isOverdue(currentDate: DayDate): boolean {
    return (
      this.#archivedAt === null &&
      this.#plannedDate !== null &&
      this.#plannedDate.isBefore(currentDate) &&
      (this.#status === LIFE_ACTION_STATUS.ready || this.#status === LIFE_ACTION_STATUS.inProgress)
    );
  }

  public requiresAttention(currentDate: DayDate): boolean {
    return this.isOverdue(currentDate);
  }

  public isArchived(): boolean {
    return this.#archivedAt !== null;
  }

  public isLinkedToDecision(): boolean {
    return this.#decisionId !== null;
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
        'life_action.archived_is_immutable',
        'Архивированное действие нельзя изменять.',
      );
    }
  }
}

function assertRehydrationInvariants(data: LifeActionRehydrationData): void {
  assertLifeActionStatus(data.status);
  assertLifeActionTitle(data.title);
  assertOptionalDecisionId(data.decisionId);
  assertValidDate(data.createdAt, 'Время создания действия');

  if (!Number.isInteger(data.version) || data.version < 1) {
    throw new DomainError(
      'life_action.invalid_version',
      'Версия действия должна быть не меньше 1.',
    );
  }

  if (!Number.isInteger(data.rescheduleCount) || data.rescheduleCount < 0) {
    throw new DomainError(
      'life_action.invalid_reschedule_count',
      'Количество переносов действия не может быть отрицательным.',
    );
  }

  assertOptionalValueTypes(data);

  const hasAnyReadyField = data.expectedResult !== null || data.readyAt !== null;
  const hasAllReadyFields =
    data.expectedResult !== null && data.plannedDate !== null && data.readyAt !== null;

  if (hasAnyReadyField && !hasAllReadyFields) {
    throw new DomainError(
      'life_action.ready_fields_incomplete',
      'Подготовленные данные действия должны содержать результат, дату и время подготовки.',
    );
  }

  if (
    (data.status === LIFE_ACTION_STATUS.ready || data.status === LIFE_ACTION_STATUS.inProgress) &&
    !hasAllReadyFields
  ) {
    throw new DomainError(
      'life_action.ready_fields_required',
      'Готовое или выполняемое действие должно иметь данные подготовки.',
    );
  }

  if (data.status === LIFE_ACTION_STATUS.inProgress && data.startedAt === null) {
    throw new DomainError(
      'life_action.started_at_required',
      'Выполняемое действие должно иметь время начала.',
    );
  }

  if (data.status === LIFE_ACTION_STATUS.completed && data.completedAt === null) {
    throw new DomainError(
      'life_action.completed_fields_required',
      'Завершённое действие должно иметь время завершения.',
    );
  }

  if (
    data.status !== LIFE_ACTION_STATUS.completed &&
    (data.actualResult !== null || data.completedAt !== null)
  ) {
    throw new DomainError(
      'life_action.uncompleted_has_result',
      'Незавершённое действие не может иметь фактический результат завершения.',
    );
  }

  if (
    data.status === LIFE_ACTION_STATUS.cancelled &&
    (data.cancelledAt === null || data.cancelReason === null)
  ) {
    throw new DomainError(
      'life_action.cancelled_fields_required',
      'Отменённое действие должно иметь время и причину отмены.',
    );
  }

  if (
    data.status !== LIFE_ACTION_STATUS.cancelled &&
    (data.cancelledAt !== null || data.cancelReason !== null)
  ) {
    throw new DomainError(
      'life_action.uncancelled_has_cancellation',
      'Неотменённое действие не может иметь данные отмены.',
    );
  }

  if (data.status === LIFE_ACTION_STATUS.draft && (hasAnyReadyField || data.startedAt !== null)) {
    throw new DomainError(
      'life_action.draft_has_progress',
      'Черновик не может иметь данные подготовки или начала выполнения.',
    );
  }

  if (data.status === LIFE_ACTION_STATUS.ready && data.startedAt !== null) {
    throw new DomainError(
      'life_action.ready_has_started_at',
      'Готовое действие не может иметь время начала выполнения.',
    );
  }

  if (data.startedAt !== null && !hasAllReadyFields) {
    throw new DomainError(
      'life_action.started_without_ready_fields',
      'Начатое действие должно иметь полные данные подготовки.',
    );
  }

  if (
    data.archivedAt !== null &&
    data.status !== LIFE_ACTION_STATUS.completed &&
    data.status !== LIFE_ACTION_STATUS.cancelled
  ) {
    throw new DomainError(
      'life_action.invalid_archive_status',
      'Архивировано может быть только завершённое или отменённое действие.',
    );
  }

  for (const date of [
    data.readyAt,
    data.startedAt,
    data.completedAt,
    data.cancelledAt,
    data.archivedAt,
  ]) {
    if (date !== null) {
      assertValidDate(date, 'Временное поле действия');
    }
  }
}

function assertOptionalValueTypes(data: LifeActionRehydrationData): void {
  if (data.expectedResult !== null) {
    assertExpectedResult(data.expectedResult);
  }

  if (data.actualResult !== null) {
    assertActualResult(data.actualResult);
  }

  if (data.cancelReason !== null) {
    assertCancelReason(data.cancelReason);
  }

  if (data.plannedDate !== null) {
    assertDayDate(data.plannedDate);
  }
}

function assertLifeActionStatus(status: LifeActionStatus): void {
  const allowedStatuses: readonly string[] = Object.values(LIFE_ACTION_STATUS);

  if (!allowedStatuses.includes(status)) {
    throw new DomainError('life_action.invalid_status', 'Неизвестное состояние действия.');
  }
}

function assertLifeActionTitle(title: LifeActionTitle): void {
  if (!(title instanceof LifeActionTitle)) {
    throw new DomainError('life_action.title_required', 'Действие должно иметь название.');
  }
}

function assertExpectedResult(result: ActionExpectedResult): void {
  if (!(result instanceof ActionExpectedResult)) {
    throw new DomainError(
      'life_action.expected_result_required',
      'Для готового действия обязателен ожидаемый результат.',
    );
  }
}

function assertActualResult(result: ActionActualResult): void {
  if (!(result instanceof ActionActualResult)) {
    throw new DomainError(
      'life_action.actual_result_required',
      'Для завершения действия обязателен фактический результат.',
    );
  }
}

function assertCancelReason(reason: ActionCancelReason): void {
  if (!(reason instanceof ActionCancelReason)) {
    throw new DomainError(
      'life_action.cancel_reason_required',
      'Для отмены действия обязательна причина.',
    );
  }
}

function assertDayDate(date: DayDate): void {
  if (!(date instanceof DayDate)) {
    throw new DomainError(
      'life_action.planned_date_required',
      'Действию необходима календарная дата.',
    );
  }
}

function assertOptionalDecisionId(decisionId: EntityId | null): void {
  if (decisionId !== null && !(decisionId instanceof EntityId)) {
    throw new DomainError(
      'life_action.invalid_decision_id',
      'Связь с решением должна содержать корректный идентификатор.',
    );
  }
}

function sameOptionalEntityId(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError('life_action.invalid_time', `${fieldName} содержит некорректное время.`);
  }
}

function normalizeOptionalDescription(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length === 0 ? null : normalizedValue;
}
