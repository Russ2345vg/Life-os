import { describe, expect, it } from 'vitest';
import type {
  Clock,
  CurrentDateProvider,
  DecisionRepository,
  IdGenerator,
  LifeActionRepository,
} from '../../application';
import {
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
import { RescheduleDecisionSafely } from './RescheduleDecisionSafely';

const CURRENT_DATE = DayDate.create('2026-08-03');
const PREVIOUS_DATE = DayDate.create('2026-08-04');
const NEW_DATE = DayDate.create('2026-08-10');
const NOW = new Date('2026-08-03T10:00:00.000+09:00');

describe('RescheduleDecisionSafely', () => {
  it('переносит planned main, выбирает первую позицию и сохраняет одно событие', async () => {
    const decision = createPlannedDecision('main', PREVIOUS_DATE, DECISION_KIND.main, 3);
    decision.clearUncommittedEvents();
    const context = createContext(decision);
    const title = decision.title;
    const expectedResult = decision.expectedResult;
    const version = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expect(result.ok).toBe(true);
    expect(decision.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(decision.order).toBe(1);
    expect(decision.title).toBe(title);
    expect(decision.expectedResult).toBe(expectedResult);
    expect(decision.kind).toBe(DECISION_KIND.main);
    expect(decision.status).toBe(DECISION_STATUS.planned);
    expect(decision.version).toBe(version + 1);
    expect(context.decisionRepository.saveCount).toBe(1);
    expect(context.clock.nowCount).toBe(1);
    expect(context.idGenerator.generateCount).toBe(1);
    const events = decision.getUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(DecisionRescheduled);
    const event = events[0];
    if (!(event instanceof DecisionRescheduled)) {
      throw new Error('Expected DecisionRescheduled');
    }
    expect(event.previousPlannedDate.equals(PREVIOUS_DATE)).toBe(true);
    expect(event.newPlannedDate.equals(NEW_DATE)).toBe(true);
    expect(event.previousOrder).toBe(3);
    expect(event.newOrder).toBe(1);
    expect(event.occurredAt).toEqual(NOW);
    expect(event.eventId.toString()).toBe('decision-rescheduled-event');
  });

  it('переносит additional без дневного лимита и сохраняет order = null', async () => {
    const decision = createPlannedDecision('additional', PREVIOUS_DATE, DECISION_KIND.additional);
    const occupied = [1, 2, 3].map((order) =>
      createPlannedDecision(`occupied-${order}`, NEW_DATE, DECISION_KIND.main, order),
    );
    const context = createContext(decision, occupied);

    const result = await context.command.execute({
      decisionId: decision.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expect(result.ok).toBe(true);
    expect(decision.order).toBeNull();
    expect(context.decisionRepository.findByDateCount).toBe(0);
  });

  it.each([
    [[], 1],
    [[1], 2],
    [[1, 2], 3],
  ])('при занятых позициях %j выбирает %i', async (occupiedOrders, expectedOrder) => {
    const decision = createPlannedDecision('candidate', PREVIOUS_DATE);
    const occupied = occupiedOrders.map((order) =>
      createPlannedDecision(`occupied-${order}`, NEW_DATE, DECISION_KIND.main, order),
    );
    const context = createContext(decision, occupied);

    const result = await context.command.execute({
      decisionId: decision.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expect(result.ok).toBe(true);
    expect(decision.order).toBe(expectedOrder);
  });

  it('не считает confirmed, cancelled и archived, но считает in_progress', async () => {
    const decision = createPlannedDecision('candidate', PREVIOUS_DATE);
    const confirmed = confirmDecision(
      createPlannedDecision('confirmed', NEW_DATE, DECISION_KIND.main, 1),
    );
    const cancelled = cancelDecision(
      createPlannedDecision('cancelled', NEW_DATE, DECISION_KIND.main, 2),
    );
    const archived = archiveDecision(
      confirmDecision(createPlannedDecision('archived', NEW_DATE, DECISION_KIND.main, 3)),
    );
    const inProgress = markDecisionInProgress(
      createPlannedDecision('progress', NEW_DATE, DECISION_KIND.main, 1),
    );
    const context = createContext(decision, [confirmed, cancelled, archived, inProgress]);

    const result = await context.command.execute({
      decisionId: decision.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expect(result.ok).toBe(true);
    expect(decision.order).toBe(2);
  });

  it('исключает переносимое решение из результатов целевой даты', async () => {
    const decision = createPlannedDecision('candidate', PREVIOUS_DATE, DECISION_KIND.main, 1);
    const context = createContext(decision, [decision]);

    const result = await context.command.execute({
      decisionId: decision.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expect(result.ok).toBe(true);
    expect(decision.order).toBe(1);
  });

  it('отклоняет четвёртое главное решение без изменений и сохранений', async () => {
    const decision = createPlannedDecision('candidate', PREVIOUS_DATE);
    decision.clearUncommittedEvents();
    const occupied = [1, 2, 3].map((order) =>
      createPlannedDecision(`occupied-${order}`, NEW_DATE, DECISION_KIND.main, order),
    );
    const context = createContext(decision, occupied);
    const version = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expectFailure(result, 'decision.main_limit_reached');
    expect(decision.plannedDate?.equals(PREVIOUS_DATE)).toBe(true);
    expect(decision.version).toBe(version);
    expect(decision.getUncommittedEvents()).toHaveLength(0);
    expectNoWrites(context);
  });

  it('перенос на ту же дату полностью идемпотентен', async () => {
    const decision = createPlannedDecision('same-date', PREVIOUS_DATE);
    decision.clearUncommittedEvents();
    const context = createContext(decision);
    const version = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
      newPlannedDate: PREVIOUS_DATE.toString(),
    });

    expect(result).toEqual({ ok: true, value: decision });
    expect(decision.version).toBe(version);
    expect(decision.getUncommittedEvents()).toHaveLength(0);
    expect(context.clock.nowCount).toBe(0);
    expectNoWrites(context);
  });

  it('возвращает decision.not_found', async () => {
    const context = createContext(null);
    const result = await context.command.execute({
      decisionId: EntityId.create('missing'),
      newPlannedDate: NEW_DATE.toString(),
    });
    expectFailure(result, 'decision.not_found');
    expectNoWrites(context);
  });

  it.each([
    ['draft', () => createDecisionDraft('draft')],
    ['in_progress', () => markDecisionInProgress(createPlannedDecision('progress', PREVIOUS_DATE))],
    ['confirmed', () => confirmDecision(createPlannedDecision('confirmed', PREVIOUS_DATE))],
    ['cancelled', () => cancelDecision(createPlannedDecision('cancelled', PREVIOUS_DATE))],
    [
      'archived',
      () => archiveDecision(confirmDecision(createPlannedDecision('archived', PREVIOUS_DATE))),
    ],
  ])('запрещает перенос состояния %s', async (_label, createDecision) => {
    const decision = createDecision();
    const version = decision.version;
    const context = createContext(decision);

    const result = await context.command.execute({
      decisionId: decision.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expectFailure(result, 'decision.cannot_reschedule');
    expect(decision.version).toBe(version);
    expectNoWrites(context);
  });

  it('требует дату и запрещает прошедшую дату через CurrentDateProvider', async () => {
    const decision = createPlannedDecision('dates', PREVIOUS_DATE);
    const context = createContext(decision);

    expectFailure(
      await context.command.execute({ decisionId: decision.id, newPlannedDate: '   ' }),
      'decision.planned_date_required',
    );
    expect(context.currentDateProvider.getCurrentDateCount).toBe(0);
    expectFailure(
      await context.command.execute({
        decisionId: decision.id,
        newPlannedDate: '2026-08-02',
      }),
      'decision.planned_date_in_past',
    );
    expect(context.currentDateProvider.getCurrentDateCount).toBe(1);
    expectNoWrites(context);
  });

  it.each([LIFE_ACTION_STATUS.draft, LIFE_ACTION_STATUS.inProgress])(
    '%s LifeAction блокирует перенос',
    async (status) => {
      const decision = createPlannedDecision(`blocked-${status}`, PREVIOUS_DATE);
      const action = createActionWithStatus(status, decision);
      const context = createContext(decision, [], [action]);
      const version = action.version;
      const plannedDate = action.plannedDate;

      const result = await context.command.execute({
        decisionId: decision.id,
        newPlannedDate: NEW_DATE.toString(),
      });

      expectFailure(result, 'decision.actions_block_reschedule');
      expect(action.version).toBe(version);
      expect(action.plannedDate).toBe(plannedDate);
      expectNoWrites(context);
    },
  );

  it.each([LIFE_ACTION_STATUS.ready, LIFE_ACTION_STATUS.completed, LIFE_ACTION_STATUS.cancelled])(
    '%s LifeAction не блокирует перенос и не изменяется',
    async (status) => {
      const decision = createPlannedDecision(`allowed-${status}`, PREVIOUS_DATE);
      const action = createActionWithStatus(status, decision);
      action.clearUncommittedEvents();
      const context = createContext(decision, [], [action]);
      const version = action.version;
      const plannedDate = action.plannedDate;

      const result = await context.command.execute({
        decisionId: decision.id,
        newPlannedDate: NEW_DATE.toString(),
      });

      expect(result.ok).toBe(true);
      expect(action.version).toBe(version);
      expect(action.plannedDate).toBe(plannedDate);
      expect(action.getUncommittedEvents()).toHaveLength(0);
      expect(context.lifeActionRepository.saveCount).toBe(0);
    },
  );
});

function createActionWithStatus(status: string, decision: Decision): LifeAction {
  const id = `action-${status}`;
  switch (status) {
    case LIFE_ACTION_STATUS.draft:
      return createLifeActionDraft(id, { decisionId: decision.id });
    case LIFE_ACTION_STATUS.ready:
      return createReadyLifeAction(id, PREVIOUS_DATE, { decisionId: decision.id });
    case LIFE_ACTION_STATUS.inProgress:
      return markLifeActionInProgress(
        createReadyLifeAction(id, PREVIOUS_DATE, { decisionId: decision.id }),
      );
    case LIFE_ACTION_STATUS.completed:
      return completeLifeAction(
        createReadyLifeAction(id, PREVIOUS_DATE, { decisionId: decision.id }),
      );
    case LIFE_ACTION_STATUS.cancelled:
      return cancelLifeAction(
        createReadyLifeAction(id, PREVIOUS_DATE, { decisionId: decision.id }),
      );
    default:
      throw new Error(`Unsupported status: ${status}`);
  }
}

function createContext(
  decision: Decision | null,
  targetDateDecisions: readonly Decision[] = [],
  lifeActions: readonly LifeAction[] = [],
) {
  const decisionRepository = new TrackingDecisionRepository(decision, targetDateDecisions);
  const lifeActionRepository = new TrackingLifeActionRepository(lifeActions);
  const currentDateProvider = new TrackingCurrentDateProvider();
  const clock = new TrackingClock();
  const idGenerator = new TrackingIdGenerator();
  return {
    decisionRepository,
    lifeActionRepository,
    currentDateProvider,
    clock,
    idGenerator,
    command: new RescheduleDecisionSafely(
      decisionRepository,
      lifeActionRepository,
      currentDateProvider,
      clock,
      idGenerator,
    ),
  };
}

class TrackingDecisionRepository implements DecisionRepository {
  public saveCount = 0;
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

  public async save(): Promise<void> {
    this.saveCount += 1;
  }
}

class TrackingLifeActionRepository implements LifeActionRepository {
  public saveCount = 0;

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

  public async save(): Promise<void> {
    this.saveCount += 1;
  }
}

class TrackingCurrentDateProvider implements CurrentDateProvider {
  public getCurrentDateCount = 0;

  public getCurrentDate(): DayDate {
    this.getCurrentDateCount += 1;
    return CURRENT_DATE;
  }
}

class TrackingClock implements Clock {
  public nowCount = 0;

  public now(): Date {
    this.nowCount += 1;
    return new Date(NOW.getTime());
  }
}

class TrackingIdGenerator implements IdGenerator {
  public generateCount = 0;

  public generate(): EntityId {
    this.generateCount += 1;
    return EntityId.create('decision-rescheduled-event');
  }
}

function expectNoWrites(context: ReturnType<typeof createContext>): void {
  expect(context.decisionRepository.saveCount).toBe(0);
  expect(context.lifeActionRepository.saveCount).toBe(0);
  expect(context.clock.nowCount).toBe(0);
  expect(context.idGenerator.generateCount).toBe(0);
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
