import { describe, expect, it } from 'vitest';
import type {
  ActionSessionRepository,
  Clock,
  CurrentDateProvider,
  DecisionRepository,
  DecisionRescheduleUnitOfWork,
  IdGenerator,
  LifeActionRepository,
} from '../../application';
import {
  ActionSession,
  DayDate,
  DECISION_KIND,
  DECISION_STATUS,
  DecisionRescheduled,
  EntityId,
  LIFE_ACTION_STATUS,
  type Decision,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import {
  archiveDecision,
  cancelDecision,
  confirmDecision,
  createDecisionDraft,
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import {
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import type { CommitDecisionRescheduleInput } from '../ports/DecisionRescheduleUnitOfWork';
import { RescheduleDecisionSafely } from './RescheduleDecisionSafely';

const CURRENT_DATE = DayDate.create('2026-08-03');
const PREVIOUS_DATE = DayDate.create('2026-08-04');
const NEW_DATE = DayDate.create('2026-08-10');
const NOW = new Date('2026-08-03T10:00:00.000+09:00');
const REASON = 'Нужно завершить подготовку и выделить отдельный день.';

describe('RescheduleDecisionSafely', () => {
  it('атомарно переносит главное решение и незавершённые действия, сохраняя историю', async () => {
    const decision = createPlannedDecision('main', PREVIOUS_DATE, DECISION_KIND.main, 3);
    const ready = createReadyLifeAction('ready', PREVIOUS_DATE, { decisionId: decision.id });
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('progress', PREVIOUS_DATE, { decisionId: decision.id }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('completed', PREVIOUS_DATE, { decisionId: decision.id }),
    );
    decision.clearUncommittedEvents();
    ready.clearUncommittedEvents();
    inProgress.clearUncommittedEvents();
    const context = createContext(decision, [], [ready, inProgress, completed]);
    const expectedVersion = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion,
      newPlannedDate: NEW_DATE.toString(),
      reason: REASON,
    });

    expect(result.ok).toBe(true);
    expect(decision.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(decision.order).toBe(1);
    expect(decision.rescheduleCount).toBe(1);
    expect(decision.rescheduleHistory).toHaveLength(1);
    expect(decision.rescheduleHistory[0]?.reason).toBe(REASON);
    expect(ready.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(inProgress.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(completed.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    expect(context.unitOfWork.commitCount).toBe(1);
    expect(context.unitOfWork.lastInput?.expectedDecisionVersion).toBe(expectedVersion);
    expect(context.unitOfWork.lastInput?.movedLifeActions).toHaveLength(2);
    const event = decision.getUncommittedEvents()[0];
    expect(event).toBeInstanceOf(DecisionRescheduled);
    if (event instanceof DecisionRescheduled) {
      expect(event.reason).toBe(REASON);
      expect(event.previousPlannedDate.equals(PREVIOUS_DATE)).toBe(true);
      expect(event.newPlannedDate.equals(NEW_DATE)).toBe(true);
    }
  });

  it('переносит выполняемое решение, если незавершённой сессии нет', async () => {
    const decision = markDecisionInProgress(createPlannedDecision('progress', PREVIOUS_DATE));
    const action = markLifeActionInProgress(
      createReadyLifeAction('action', PREVIOUS_DATE, { decisionId: decision.id }),
    );
    const context = createContext(decision, [], [action]);

    const result = await execute(context, decision);

    expect(result.ok).toBe(true);
    expect(decision.status).toBe(DECISION_STATUS.inProgress);
    expect(action.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(action.plannedDate?.equals(NEW_DATE)).toBe(true);
  });

  it('оставляет завершённые и отменённые действия на исторической дате', async () => {
    const decision = createPlannedDecision('history', PREVIOUS_DATE);
    const completed = completeLifeAction(
      createReadyLifeAction('completed', PREVIOUS_DATE, { decisionId: decision.id }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled', PREVIOUS_DATE, { decisionId: decision.id }),
    );
    const context = createContext(decision, [], [completed, cancelled]);

    const result = await execute(context, decision);

    expect(result.ok).toBe(true);
    expect(completed.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    expect(cancelled.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    expect(context.unitOfWork.lastInput?.movedLifeActions).toHaveLength(0);
  });

  it('черновик остаётся связанным и не требует изменения даты', async () => {
    const decision = createPlannedDecision('draft', PREVIOUS_DATE);
    const draft = createLifeActionDraft('draft-action', { decisionId: decision.id });
    const context = createContext(decision, [], [draft]);

    const result = await execute(context, decision);

    expect(result.ok).toBe(true);
    expect(draft.plannedDate).toBeNull();
    expect(context.unitOfWork.lastInput?.linkedLifeActionIds).toHaveLength(1);
    expect(context.unitOfWork.lastInput?.movedLifeActions).toHaveLength(0);
  });

  it('блокирует активную или приостановленную сессию связанного действия', async () => {
    const decision = createPlannedDecision('session', PREVIOUS_DATE);
    const action = createReadyLifeAction('action', PREVIOUS_DATE, { decisionId: decision.id });
    const session = ActionSession.start({
      id: EntityId.create('session'),
      lifeActionId: action.id,
      startedAt: NOW,
      eventId: EntityId.create('session-started'),
    });
    const context = createContext(decision, [], [action], session);

    const result = await execute(context, decision);

    expectFailure(result, 'decision.session_unfinished');
    expect(context.unitOfWork.commitCount).toBe(0);
  });

  it('не блокируется незавершённой сессией другого решения', async () => {
    const decision = createPlannedDecision('candidate', PREVIOUS_DATE);
    const action = createReadyLifeAction('action', PREVIOUS_DATE, { decisionId: decision.id });
    const session = ActionSession.start({
      id: EntityId.create('other-session'),
      lifeActionId: EntityId.create('other-action'),
      startedAt: NOW,
      eventId: EntityId.create('other-started'),
    });
    const context = createContext(decision, [], [action], session);

    expect((await execute(context, decision)).ok).toBe(true);
  });

  it('отклоняет незавершённое действие, уже назначенное на другую дату', async () => {
    const decision = createPlannedDecision('mismatch', PREVIOUS_DATE);
    const action = createReadyLifeAction('action', DayDate.create('2026-08-06'), {
      decisionId: decision.id,
    });
    const context = createContext(decision, [], [action]);

    expectFailure(await execute(context, decision), 'decision.actions_date_mismatch');
    expect(context.unitOfWork.commitCount).toBe(0);
  });

  it('требует причину и дату позже текущей даты решения', async () => {
    const decision = createPlannedDecision('validation', PREVIOUS_DATE);
    const context = createContext(decision);

    expectFailure(
      await context.command.execute({
        decisionId: decision.id,
        expectedVersion: decision.version,
        newPlannedDate: NEW_DATE.toString(),
        reason: '   ',
      }),
      'decision.reschedule_reason_required',
    );
    expectFailure(
      await context.command.execute({
        decisionId: decision.id,
        expectedVersion: decision.version,
        newPlannedDate: PREVIOUS_DATE.toString(),
        reason: REASON,
      }),
      'decision.reschedule_date_must_be_later',
    );
  });

  it('запрещает прошедшую дату', async () => {
    const decision = createPlannedDecision('past', DayDate.create('2026-08-01'));
    const context = createContext(decision);
    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: decision.version,
      newPlannedDate: '2026-08-02',
      reason: REASON,
    });
    expectFailure(result, 'decision.planned_date_in_past');
  });

  it('отклоняет четвёртое главное решение на целевой дате', async () => {
    const decision = createPlannedDecision('candidate', PREVIOUS_DATE);
    const occupied = [1, 2, 3].map((order) =>
      createPlannedDecision(`occupied-${order}`, NEW_DATE, DECISION_KIND.main, order),
    );
    const context = createContext(decision, occupied);

    expectFailure(await execute(context, decision), 'decision.main_limit_reached');
    expect(context.unitOfWork.commitCount).toBe(0);
  });

  it('дополнительное решение не проверяет позиции главных решений', async () => {
    const decision = createPlannedDecision('additional', PREVIOUS_DATE, DECISION_KIND.additional);
    const occupied = [1, 2, 3].map((order) =>
      createPlannedDecision(`occupied-${order}`, NEW_DATE, DECISION_KIND.main, order),
    );
    const context = createContext(decision, occupied);

    expect((await execute(context, decision)).ok).toBe(true);
    expect(decision.order).toBeNull();
    expect(context.decisionRepository.findByDateCount).toBe(0);
  });

  it('отклоняет устаревшую версию до изменения объектов', async () => {
    const decision = createPlannedDecision('conflict', PREVIOUS_DATE);
    const context = createContext(decision);
    const originalVersion = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: originalVersion - 1,
      newPlannedDate: NEW_DATE.toString(),
      reason: REASON,
    });

    expectFailure(result, 'decision.reschedule_conflict');
    expect(decision.version).toBe(originalVersion);
    expect(context.unitOfWork.commitCount).toBe(0);
  });

  it.each([
    () => createDecisionDraft('draft'),
    () => confirmDecision(createPlannedDecision('confirmed', PREVIOUS_DATE)),
    () => cancelDecision(createPlannedDecision('cancelled', PREVIOUS_DATE)),
    () => archiveDecision(confirmDecision(createPlannedDecision('archived', PREVIOUS_DATE))),
  ])('не переносит закрытое или неподготовленное решение', async (factory) => {
    const decision = factory();
    const context = createContext(decision);
    expectFailure(await execute(context, decision), 'decision.cannot_reschedule');
  });

  it('передаёт конфликт атомарной транзакции без частичного сохранения', async () => {
    const decision = createPlannedDecision('uow-conflict', PREVIOUS_DATE);
    const action = createReadyLifeAction('action', PREVIOUS_DATE, { decisionId: decision.id });
    const context = createContext(decision, [], [action]);
    context.unitOfWork.error = new DomainError(
      'decision.action_reschedule_conflict',
      'Конфликт действия',
    );

    const result = await execute(context, decision);

    expectFailure(result, 'decision.action_reschedule_conflict');
    expect(context.unitOfWork.commitCount).toBe(1);
  });
});

async function execute(context: ReturnType<typeof createContext>, decision: Decision) {
  return context.command.execute({
    decisionId: decision.id,
    expectedVersion: decision.version,
    newPlannedDate: NEW_DATE.toString(),
    reason: REASON,
  });
}

function createContext(
  decision: Decision | null,
  targetDateDecisions: readonly Decision[] = [],
  lifeActions: readonly LifeAction[] = [],
  unfinishedSession: ActionSession | null = null,
) {
  const decisionRepository = new TrackingDecisionRepository(decision, targetDateDecisions);
  const lifeActionRepository = new TrackingLifeActionRepository(lifeActions);
  const actionSessionRepository = new TrackingActionSessionRepository(unfinishedSession);
  const unitOfWork = new TrackingDecisionRescheduleUnitOfWork();
  const currentDateProvider = new TrackingCurrentDateProvider();
  const clock = new TrackingClock();
  const idGenerator = new TrackingIdGenerator();
  return {
    decisionRepository,
    lifeActionRepository,
    actionSessionRepository,
    unitOfWork,
    currentDateProvider,
    clock,
    idGenerator,
    command: new RescheduleDecisionSafely(
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      unitOfWork,
      currentDateProvider,
      clock,
      idGenerator,
    ),
  };
}

class TrackingDecisionRepository implements DecisionRepository {
  public findByDateCount = 0;
  public constructor(
    readonly decision: Decision | null,
    readonly targetDateDecisions: readonly Decision[],
  ) {}
  public async findById(id: EntityId): Promise<Decision | null> {
    return this.decision?.id.equals(id) ? this.decision : null;
  }
  public async findByDate(): Promise<readonly Decision[]> {
    this.findByDateCount += 1;
    return this.targetDateDecisions;
  }
  public async save(): Promise<void> {}
}

class TrackingLifeActionRepository implements LifeActionRepository {
  public constructor(readonly lifeActions: readonly LifeAction[]) {}
  public async findById(): Promise<LifeAction | null> {
    return null;
  }
  public async findByDate(): Promise<readonly LifeAction[]> {
    return this.lifeActions;
  }
  public async findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]> {
    return this.lifeActions.filter((lifeAction) => lifeAction.decisionId?.equals(decisionId));
  }
  public async save(): Promise<void> {}
}

class TrackingActionSessionRepository implements ActionSessionRepository {
  public constructor(readonly unfinished: ActionSession | null) {}
  public async findById(): Promise<ActionSession | null> {
    return null;
  }
  public async findByLifeActionId(): Promise<readonly ActionSession[]> {
    return [];
  }
  public async findUnfinished(): Promise<ActionSession | null> {
    return this.unfinished;
  }
  public async save(): Promise<void> {}
}

class TrackingDecisionRescheduleUnitOfWork implements DecisionRescheduleUnitOfWork {
  public commitCount = 0;
  public lastInput: CommitDecisionRescheduleInput | null = null;
  public error: DomainError | null = null;
  public async commit(input: CommitDecisionRescheduleInput): Promise<void> {
    this.commitCount += 1;
    this.lastInput = input;
    if (this.error !== null) {
      throw this.error;
    }
  }
}

class TrackingCurrentDateProvider implements CurrentDateProvider {
  public getCurrentDate(): DayDate {
    return CURRENT_DATE;
  }
}

class TrackingClock implements Clock {
  public now(): Date {
    return new Date(NOW.getTime());
  }
}

class TrackingIdGenerator implements IdGenerator {
  #count = 0;
  public generate(): EntityId {
    this.#count += 1;
    return EntityId.create(`reschedule-event-${this.#count}`);
  }
}

function expectFailure(
  result: Awaited<ReturnType<RescheduleDecisionSafely['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
