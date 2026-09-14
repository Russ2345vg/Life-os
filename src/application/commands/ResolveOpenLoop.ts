import {
  ACTION_SESSION_STATUS,
  ActionActualResult,
  ActionCancelReason,
  ActionSession,
  ActualResultSummary,
  DECISION_KIND,
  DECISION_STATUS,
  Decision,
  DecisionCancelReason,
  DayDate,
  EVENING_CYCLE_STATE,
  LIFE_ACTION_STATUS,
  LifeAction,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_RESOLUTION,
  SESSION_COMPLETION_KIND,
  type EntityId,
  type EveningCycle,
  type OpenLoopEntityType,
  type OpenLoopResolutionKind,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import { cloneEveningCycle } from '../evening-cycle';
import {
  createDecisionJournalEntries,
  createLifeActionJournalEntries,
  createWorkSessionJournalEntries,
} from '../journal/createJournalEntries';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type {
  OpenLoopDecisionChange,
  OpenLoopLifeActionChange,
  OpenLoopResolutionUnitOfWork,
  OpenLoopSessionChange,
} from '../ports/OpenLoopResolutionUnitOfWork';
import type { GetOpenLoopsForDay } from '../queries/GetOpenLoopsForDay';

export interface ResolveOpenLoopInput {
  readonly dateKey: DayDate;
  readonly entityType: OpenLoopEntityType;
  readonly entityId: EntityId;
  readonly resolution: OpenLoopResolutionKind;
  readonly actualResult?: string;
  readonly reason?: string;
}

export interface ResolveOpenLoopResult {
  readonly cycle: EveningCycle;
  readonly resolved: boolean;
  readonly requiresRevision: boolean;
}

export const OPEN_LOOP_BLOCKING_REASON = {
  decisionHasOpenActions: 'DECISION_HAS_OPEN_ACTIONS',
} as const;

export class DecisionHasOpenActionsError extends DomainError {
  public readonly reason = OPEN_LOOP_BLOCKING_REASON.decisionHasOpenActions;
  public readonly openActionIds: readonly string[];
  public readonly resolution:
    typeof OPEN_LOOP_RESOLUTION.complete | typeof OPEN_LOOP_RESOLUTION.drop;

  public constructor(
    openActionIds: readonly EntityId[],
    resolution: typeof OPEN_LOOP_RESOLUTION.complete | typeof OPEN_LOOP_RESOLUTION.drop,
  ) {
    super(
      OPEN_LOOP_BLOCKING_REASON.decisionHasOpenActions,
      'Сначала разберите действия этого Решения',
    );
    this.name = 'DecisionHasOpenActionsError';
    this.openActionIds = Object.freeze(openActionIds.map((id) => id.toString()));
    this.resolution = resolution;
  }
}

export function isDecisionHasOpenActionsError(
  error: DomainError,
): error is DecisionHasOpenActionsError {
  return (
    error instanceof DecisionHasOpenActionsError &&
    error.code === OPEN_LOOP_BLOCKING_REASON.decisionHasOpenActions
  );
}

export class ResolveOpenLoop {
  readonly #getOpenLoops: Pick<GetOpenLoopsForDay, 'execute'>;
  readonly #decisions: DecisionRepository;
  readonly #lifeActions: LifeActionRepository;
  readonly #sessions: ActionSessionRepository;
  readonly #unitOfWork: OpenLoopResolutionUnitOfWork;
  readonly #currentDate: CurrentDateProvider;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;

  public constructor(
    getOpenLoops: Pick<GetOpenLoopsForDay, 'execute'>,
    decisions: DecisionRepository,
    lifeActions: LifeActionRepository,
    sessions: ActionSessionRepository,
    unitOfWork: OpenLoopResolutionUnitOfWork,
    currentDate: CurrentDateProvider,
    clock: Clock,
    ids: IdGenerator,
  ) {
    this.#getOpenLoops = getOpenLoops;
    this.#decisions = decisions;
    this.#lifeActions = lifeActions;
    this.#sessions = sessions;
    this.#unitOfWork = unitOfWork;
    this.#currentDate = currentDate;
    this.#clock = clock;
    this.#ids = ids;
  }

  public async execute(
    input: ResolveOpenLoopInput,
  ): Promise<Result<ResolveOpenLoopResult, DomainError>> {
    try {
      const snapshot = await this.#getOpenLoops.execute(input.dateKey);
      const existing = snapshot.cycle.openLoopResolutions.find(
        (item) => item.entityType === input.entityType && item.entityId.equals(input.entityId),
      );
      if (existing !== undefined) {
        if (existing.resolution !== input.resolution) {
          return failure(
            new DomainError('open_loop.already_resolved', 'Элемент уже разобран с другим исходом.'),
          );
        }
        return success({ cycle: snapshot.cycle, resolved: true, requiresRevision: false });
      }
      if (input.resolution === OPEN_LOOP_RESOLUTION.revise) {
        return success({ cycle: snapshot.cycle, resolved: false, requiresRevision: true });
      }
      if (snapshot.cycle.state !== EVENING_CYCLE_STATE.resolving) {
        return failure(
          new DomainError('open_loop.resolving_finished', 'Этап разбора уже завершён.'),
        );
      }

      const occurredAt = this.#clock.now();
      const cycle = cloneEveningCycle(snapshot.cycle);
      const expectedEveningCycleVersion = cycle.version;
      const changes = await this.resolveEntity(input, cycle, occurredAt);
      cycle.recordOpenLoopResolution(
        input.entityType,
        input.entityId,
        input.resolution,
        occurredAt,
        input.reason ?? input.actualResult ?? null,
      );
      if (cycle.openLoopProgress.remaining === 0) cycle.completeResolving(occurredAt);
      await this.#unitOfWork.commit({
        eveningCycle: cycle,
        expectedEveningCycleVersion,
        ...changes,
      });
      return success({ cycle, resolved: true, requiresRevision: false });
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }

  private async resolveEntity(
    input: ResolveOpenLoopInput,
    cycle: EveningCycle,
    occurredAt: Date,
  ): Promise<ResolutionChanges> {
    if (input.entityType === OPEN_LOOP_ENTITY_TYPE.decision) {
      return this.resolveDecision(input, cycle, occurredAt);
    }
    if (input.entityType === OPEN_LOOP_ENTITY_TYPE.lifeAction) {
      return this.resolveLifeAction(input, occurredAt);
    }
    return this.resolveSession(input, occurredAt);
  }

  private async resolveDecision(
    input: ResolveOpenLoopInput,
    cycle: EveningCycle,
    occurredAt: Date,
  ): Promise<ResolutionChanges> {
    const stored = await this.#decisions.findById(input.entityId);
    if (stored === null) throw new DomainError('decision.not_found', 'Решение не найдено.');
    const decision = cloneDecision(stored);
    const expectedVersion = decision.version;
    const linked = await this.#lifeActions.findByDecisionId(decision.id);
    const unfinished = linked.filter(isUnfinishedAction);
    const actionChanges: OpenLoopLifeActionChange[] = [];

    if (input.resolution === OPEN_LOOP_RESOLUTION.complete) {
      if (unfinished.length > 0) {
        throw new DecisionHasOpenActionsError(
          unfinished.map((item) => item.id),
          OPEN_LOOP_RESOLUTION.complete,
        );
      }
      const evidence = linked.filter((item) => item.status === LIFE_ACTION_STATUS.completed);
      if (evidence.length === 0) {
        throw new DomainError(
          'decision.confirm_requires_evidence',
          'Для завершения решения нужно хотя бы одно завершённое действие.',
        );
      }
      decision.confirm(
        ActualResultSummary.create(requiredText(input.actualResult, 'Укажите итог решения.')),
        evidence.map((item) => item.id),
        occurredAt,
        this.#ids.generate(),
      );
    } else if (input.resolution === OPEN_LOOP_RESOLUTION.carryForward) {
      const sourceActions = unfinished.filter(
        (item) => item.plannedDate?.equals(input.dateKey) ?? false,
      );
      await this.assertNoUnfinishedSession(sourceActions.map((item) => item.id));
      const target = carryDate(input.dateKey, this.#currentDate.getCurrentDate());
      const newOrder = await this.nextDecisionOrder(decision, target);
      for (const storedAction of sourceActions) {
        const action = cloneLifeAction(storedAction);
        const actionExpectedVersion = action.version;
        action.reschedule(target, occurredAt, this.#ids.generate());
        actionChanges.push({ lifeAction: action, expectedVersion: actionExpectedVersion });
        if (hasRequiredReference(cycle, OPEN_LOOP_ENTITY_TYPE.lifeAction, action.id)) {
          cycle.recordOpenLoopResolution(
            OPEN_LOOP_ENTITY_TYPE.lifeAction,
            action.id,
            OPEN_LOOP_RESOLUTION.carryForward,
            occurredAt,
          );
        }
      }
      decision.reschedule(
        target,
        input.reason?.trim() || 'Перенесено при вечернем разборе',
        occurredAt,
        this.#ids.generate(),
        newOrder,
      );
    } else {
      if (unfinished.length > 0) {
        throw new DecisionHasOpenActionsError(
          unfinished.map((item) => item.id),
          OPEN_LOOP_RESOLUTION.drop,
        );
      }
      decision.cancel(
        occurredAt,
        this.#ids.generate(),
        DecisionCancelReason.create(input.reason?.trim() || 'Отказ при вечернем разборе'),
      );
    }
    return {
      decisions: [{ decision, expectedVersion }],
      lifeActions: actionChanges,
      sessions: [],
      journalEntries: [
        ...createDecisionJournalEntries(decision),
        ...actionChanges.flatMap((change) => createLifeActionJournalEntries(change.lifeAction)),
      ],
    };
  }

  private async resolveLifeAction(
    input: ResolveOpenLoopInput,
    occurredAt: Date,
  ): Promise<ResolutionChanges> {
    const stored = await this.#lifeActions.findById(input.entityId);
    if (stored === null) throw new DomainError('life_action.not_found', 'Действие не найдено.');
    const action = cloneLifeAction(stored);
    const expectedVersion = action.version;
    const sessions = await this.#sessions.findByLifeActionId(action.id);
    if (sessions.some((item) => item.status !== ACTION_SESSION_STATUS.completed)) {
      throw new DomainError(
        'life_action.session_unfinished',
        'Сначала определите судьбу активной рабочей сессии.',
      );
    }
    if (input.resolution === OPEN_LOOP_RESOLUTION.complete) {
      if (
        !sessions.some(
          (item) =>
            item.status === ACTION_SESSION_STATUS.completed &&
            item.completionKind === SESSION_COMPLETION_KIND.completed,
        )
      ) {
        throw new DomainError(
          'life_action.completion_requires_session',
          'Для завершения действия нужна завершённая рабочая сессия.',
        );
      }
      action.complete(
        ActionActualResult.create(requiredText(input.actualResult, 'Укажите итог действия.')),
        occurredAt,
        this.#ids.generate(),
      );
    } else if (input.resolution === OPEN_LOOP_RESOLUTION.carryForward) {
      action.reschedule(
        carryDate(input.dateKey, this.#currentDate.getCurrentDate()),
        occurredAt,
        this.#ids.generate(),
      );
    } else {
      action.cancel(
        occurredAt,
        this.#ids.generate(),
        ActionCancelReason.create(input.reason?.trim() || 'Отказ при вечернем разборе'),
      );
    }
    return {
      decisions: [],
      lifeActions: [{ lifeAction: action, expectedVersion }],
      sessions: [],
      journalEntries: createLifeActionJournalEntries(action),
    };
  }

  private async resolveSession(
    input: ResolveOpenLoopInput,
    occurredAt: Date,
  ): Promise<ResolutionChanges> {
    const stored = await this.#sessions.findById(input.entityId);
    if (stored === null) throw new DomainError('session.not_found', 'Рабочая сессия не найдена.');
    const session = cloneSession(stored);
    const expectedVersion = session.version;
    session.complete({
      completedAt: occurredAt,
      completionKind:
        input.resolution === OPEN_LOOP_RESOLUTION.complete
          ? SESSION_COMPLETION_KIND.completed
          : SESSION_COMPLETION_KIND.interrupted,
      eventId: this.#ids.generate(),
    });
    const action = await this.#lifeActions.findById(session.lifeActionId);
    return {
      decisions: [],
      lifeActions: [],
      sessions: [{ session, expectedVersion }],
      journalEntries: createWorkSessionJournalEntries(session, action),
    };
  }

  private async assertNoUnfinishedSession(lifeActionIds: readonly EntityId[]): Promise<void> {
    const unfinished = await this.#sessions.findUnfinished();
    if (unfinished !== null && lifeActionIds.some((id) => id.equals(unfinished.lifeActionId))) {
      throw new DomainError(
        'open_loop.session_unfinished',
        'Сначала определите судьбу активной рабочей сессии.',
      );
    }
  }

  private async nextDecisionOrder(decision: Decision, target: DayDate): Promise<number | null> {
    if (decision.kind !== DECISION_KIND.main) return null;
    const occupied = new Set(
      (await this.#decisions.findByDate(target))
        .filter(
          (item) =>
            !item.id.equals(decision.id) &&
            item.kind === DECISION_KIND.main &&
            !item.isArchived() &&
            !item.isDeleted() &&
            (item.status === DECISION_STATUS.planned || item.status === DECISION_STATUS.inProgress),
        )
        .map((item) => item.order),
    );
    const order = [1, 2, 3].find((candidate) => !occupied.has(candidate)) ?? null;
    if (order === null) {
      throw new DomainError(
        'decision.main_limit_reached',
        'На дату переноса уже назначены три главных решения.',
      );
    }
    return order;
  }
}

interface ResolutionChanges {
  readonly decisions: readonly OpenLoopDecisionChange[];
  readonly lifeActions: readonly OpenLoopLifeActionChange[];
  readonly sessions: readonly OpenLoopSessionChange[];
  readonly journalEntries: ReturnType<typeof createDecisionJournalEntries>;
}

function requiredText(value: string | undefined, message: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new DomainError('open_loop.result_required', message);
  }
  return value;
}

function carryDate(ownerDate: DayDate, actualCurrentDate: DayDate): DayDate {
  if (ownerDate.isBefore(actualCurrentDate)) return actualCurrentDate;
  const [year, month, day] = ownerDate.toString().split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new DomainError('open_loop.invalid_owner_date', 'Дата дня разбора некорректна.');
  }
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return DayDate.fromParts(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function isUnfinishedAction(action: LifeAction): boolean {
  return (
    action.status === LIFE_ACTION_STATUS.ready || action.status === LIFE_ACTION_STATUS.inProgress
  );
}

function hasRequiredReference(
  cycle: EveningCycle,
  entityType: OpenLoopEntityType,
  entityId: EntityId,
): boolean {
  return cycle.openLoopReferences.some(
    (item) => item.entityType === entityType && item.entityId.equals(entityId),
  );
}

function cloneDecision(item: Decision): Decision {
  return Decision.rehydrate({
    id: item.id,
    title: item.title,
    reason: item.reason,
    sphereId: item.sphereId,
    price: item.price,
    sacrifices: item.sacrifices,
    priority: item.priority,
    projectReference: item.projectReference,
    projectId: item.projectId,
    expectedResult: item.expectedResult,
    actualResultSummary: item.actualResultSummary,
    status: item.status,
    kind: item.kind,
    plannedDate: item.plannedDate,
    order: item.order,
    createdAt: item.createdAt,
    plannedAt: item.plannedAt,
    startedAt: item.startedAt,
    confirmedAt: item.confirmedAt,
    cancelledAt: item.cancelledAt,
    cancelReason: item.cancelReason,
    archivedAt: item.archivedAt,
    deletedAt: item.deletedAt,
    lastDeletedAt: item.lastDeletedAt,
    restoredFromTrashAt: item.restoredFromTrashAt,
    evidenceIds: item.evidenceIds,
    rescheduleCount: item.rescheduleCount,
    rescheduleHistory: item.rescheduleHistory,
    version: item.version,
  });
}

function cloneLifeAction(item: LifeAction): LifeAction {
  return LifeAction.rehydrate({
    priority: item.priority,
    occurrence: item.occurrence,
    completionGeneration: item.completionGeneration,
    expectedContributions: item.expectedContributions,
    completedOn: item.completedOn,
    id: item.id,
    title: item.title,
    description: item.description,
    expectedResult: item.expectedResult,
    actualResult: item.actualResult,
    status: item.status,
    decisionId: item.decisionId,
    sphereId: item.sphereId,
    goalId: item.goalId,
    parentActionId: item.parentActionId,
    isNext: item.isNext,
    plannedDate: item.plannedDate,
    createdAt: item.createdAt,
    readyAt: item.readyAt,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    cancelledAt: item.cancelledAt,
    cancelReason: item.cancelReason,
    archivedAt: item.archivedAt,
    rescheduleCount: item.rescheduleCount,
    version: item.version,
  });
}

function cloneSession(item: ActionSession): ActionSession {
  return ActionSession.rehydrate({
    id: item.id,
    lifeActionId: item.lifeActionId,
    status: item.status,
    startedAt: item.startedAt,
    pausedAt: item.pausedAt,
    completedAt: item.completedAt,
    completionKind: item.completionKind,
    resultNote: item.resultNote,
    pauseIntervals: item.pauseIntervals,
    version: item.version,
  });
}
