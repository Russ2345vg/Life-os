import { describe, expect, it } from 'vitest';
import {
  DayDate,
  DECISION_STATUS,
  EntityId,
  LIFE_ACTION_STATUS,
  type Decision,
  type LifeAction,
} from '../../domain';
import type { DecisionRepository, LifeActionRepository } from '../../application';
import { DomainError } from '../../shared/errors/DomainError';
import {
  archiveDecision,
  cancelDecision,
  confirmDecision,
  createDecisionDraft,
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { CancelDecisionSafely } from './CancelDecisionSafely';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T13:00:00.000+09:00');

describe('CancelDecisionSafely', () => {
  it('отменяет planned Decision без действий и сохраняет его один раз', async () => {
    const decision = createPlannedDecision('planned', DATE);
    const context = createContext(decision, []);
    decision.clearUncommittedEvents();
    const version = decision.version;

    const result = await context.command.execute({ decisionId: decision.id });

    expect(result.ok).toBe(true);
    expect(decision.status).toBe(DECISION_STATUS.cancelled);
    expect(decision.cancelledAt).toEqual(NOW);
    expect(decision.version).toBe(version + 1);
    expect(context.decisionRepository.saveCount).toBe(1);
    expect(decision.getUncommittedEvents()).toHaveLength(1);
    expect(decision.getUncommittedEvents()[0]).toMatchObject({
      eventType: 'decision.cancelled',
      eventId: EntityId.create('cancel-event-1'),
    });
  });

  it('отменяет in_progress Decision после завершённых действий', async () => {
    const decision = markDecisionInProgress(createPlannedDecision('progress', DATE));
    const context = createContext(decision, [completed('done', decision)]);

    const result = await context.command.execute({ decisionId: decision.id });

    expect(result.ok).toBe(true);
    expect(decision.status).toBe(DECISION_STATUS.cancelled);
  });

  it.each([
    ['completed', (decision: Decision) => completed('completed', decision)],
    [
      'cancelled',
      (decision: Decision) =>
        cancelLifeAction(createReadyLifeAction('cancelled', DATE, { decisionId: decision.id })),
    ],
  ])('%s-действие не блокирует отмену', async (_label, createAction) => {
    const decision = createPlannedDecision(`allowed-${_label}`, DATE);
    const context = createContext(decision, [createAction(decision)]);

    const result = await context.command.execute({ decisionId: decision.id });

    expect(result.ok).toBe(true);
  });

  it('completed и cancelled вместе не блокируют отмену', async () => {
    const decision = createPlannedDecision('mixed', DATE);
    const context = createContext(decision, [
      completed('done', decision),
      cancelLifeAction(createReadyLifeAction('stopped', DATE, { decisionId: decision.id })),
    ]);

    const result = await context.command.execute({ decisionId: decision.id });

    expect(result.ok).toBe(true);
  });

  it.each([
    ['draft', (decision: Decision) => createLifeActionDraft('draft', { decisionId: decision.id })],
    [
      'ready',
      (decision: Decision) => createReadyLifeAction('ready', DATE, { decisionId: decision.id }),
    ],
    [
      'in_progress',
      (decision: Decision) =>
        markLifeActionInProgress(
          createReadyLifeAction('progress-action', DATE, { decisionId: decision.id }),
        ),
    ],
  ])('%s-действие блокирует отмену без изменения Decision', async (_label, createAction) => {
    const decision = createPlannedDecision(`blocked-${_label}`, DATE);
    const version = decision.version;
    const context = createContext(decision, [createAction(decision)]);

    const result = await context.command.execute({ decisionId: decision.id });

    expectFailure(result, 'decision.actions_unfinished');
    expect(decision.status).toBe(DECISION_STATUS.planned);
    expect(decision.version).toBe(version);
    expect(context.decisionRepository.saveCount).toBe(0);
  });

  it('возвращает decision.not_found', async () => {
    const context = createContext(null, []);
    const result = await context.command.execute({ decisionId: EntityId.create('missing') });
    expectFailure(result, 'decision.not_found');
  });

  it.each([
    ['draft', createDecisionDraft('draft-decision')],
    ['confirmed', confirmDecision(createPlannedDecision('confirmed', DATE))],
    ['cancelled', cancelDecision(createPlannedDecision('cancelled-decision', DATE))],
    ['archived', archiveDecision(confirmDecision(createPlannedDecision('archived', DATE)))],
  ])('запрещает отмену %s Decision без повторного сохранения', async (_label, decision) => {
    const context = createContext(decision, []);
    const eventCount = decision.getUncommittedEvents().length;
    const result = await context.command.execute({ decisionId: decision.id });

    expectFailure(result, 'decision.cannot_cancel');
    expect(decision.getUncommittedEvents()).toHaveLength(eventCount);
    expect(context.decisionRepository.saveCount).toBe(0);
  });

  it('не изменяет и не сохраняет связанные LifeAction', async () => {
    const decision = createPlannedDecision('read-only-actions', DATE);
    const done = completed('done-read-only', decision);
    const stopped = cancelLifeAction(
      createReadyLifeAction('stopped-read-only', DATE, { decisionId: decision.id }),
    );
    const versions = [done.version, stopped.version];
    const context = createContext(decision, [done, stopped]);

    await context.command.execute({ decisionId: decision.id });

    expect(done.status).toBe(LIFE_ACTION_STATUS.completed);
    expect(stopped.status).toBe(LIFE_ACTION_STATUS.cancelled);
    expect([done.version, stopped.version]).toEqual(versions);
    expect(context.lifeActionRepository.saveCount).toBe(0);
  });
});

function completed(id: string, decision: Decision): LifeAction {
  return completeLifeAction(createReadyLifeAction(id, DATE, { decisionId: decision.id }));
}

function createContext(decision: Decision | null, lifeActions: readonly LifeAction[]) {
  const decisionRepository = new TrackingDecisionRepository(decision);
  const lifeActionRepository = new TrackingLifeActionRepository(lifeActions);
  const idGenerator = new FakeIdGenerator('cancel-event');
  return {
    decisionRepository,
    lifeActionRepository,
    command: new CancelDecisionSafely(
      decisionRepository,
      lifeActionRepository,
      new FakeClock(NOW),
      idGenerator,
    ),
  };
}

class TrackingDecisionRepository implements DecisionRepository {
  readonly #decision: Decision | null;
  public saveCount = 0;

  public constructor(decision: Decision | null) {
    this.#decision = decision;
  }

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#decision?.id.equals(id) ? this.#decision : null;
  }

  public async findByDate(): Promise<readonly Decision[]> {
    return this.#decision === null ? [] : [this.#decision];
  }

  public async save(): Promise<void> {
    this.saveCount += 1;
  }
}

class TrackingLifeActionRepository implements LifeActionRepository {
  readonly #lifeActions: readonly LifeAction[];
  public saveCount = 0;

  public constructor(lifeActions: readonly LifeAction[]) {
    this.#lifeActions = lifeActions;
  }

  public async findById(id: EntityId): Promise<LifeAction | null> {
    return this.#lifeActions.find((lifeAction) => lifeAction.id.equals(id)) ?? null;
  }

  public async findByDate(): Promise<readonly LifeAction[]> {
    return this.#lifeActions;
  }

  public async findByDecisionId(): Promise<readonly LifeAction[]> {
    return this.#lifeActions;
  }

  public async save(): Promise<void> {
    this.saveCount += 1;
  }
}

function expectFailure(
  result: Awaited<ReturnType<CancelDecisionSafely['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
