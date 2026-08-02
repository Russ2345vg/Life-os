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
import { ConfirmDecisionFromActions } from './ConfirmDecisionFromActions';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T11:30:00.000+09:00');

describe('ConfirmDecisionFromActions', () => {
  it('подтверждает planned Decision с одним completed-действием', async () => {
    const context = createContext(createPlannedDecision('planned', DATE), [completed('done')]);

    const result = await context.command.execute(input(context.decision));

    expect(result.ok).toBe(true);
    expect(context.decision.status).toBe(DECISION_STATUS.confirmed);
    expect(context.decision.startedAt).toEqual(NOW);
  });

  it('подтверждает in_progress Decision', async () => {
    const decision = markDecisionInProgress(createPlannedDecision('progress', DATE));
    const context = createContext(decision, [completed('done')]);

    const result = await context.command.execute(input(decision));

    expect(result.ok).toBe(true);
    expect(decision.status).toBe(DECISION_STATUS.confirmed);
  });

  it('сохраняет идентификаторы всех completed-действий как evidenceIds', async () => {
    const context = createContext(createPlannedDecision('several', DATE), [
      completed('first'),
      completed('second'),
      completed('third'),
    ]);

    await context.command.execute(input(context.decision));

    expect(context.decision.evidenceIds.map(String)).toEqual(['first', 'second', 'third']);
  });

  it('формирует evidenceIds в стабильном порядке времени создания и id', async () => {
    const late = completed('late', '2026-08-02T10:00:00.000+09:00');
    const sameTimeB = completed('same-b', '2026-08-02T08:00:00.000+09:00');
    const sameTimeA = completed('same-a', '2026-08-02T08:00:00.000+09:00');
    const context = createContext(createPlannedDecision('ordered', DATE), [
      late,
      sameTimeB,
      sameTimeA,
    ]);

    await context.command.execute(input(context.decision));

    expect(context.decision.evidenceIds.map(String)).toEqual(['same-a', 'same-b', 'late']);
  });

  it('сохраняет введённый actualResult', async () => {
    const context = createContext(createPlannedDecision('result', DATE), [completed('done')]);

    await context.command.execute({
      decisionId: context.decision.id,
      actualResult: '  Получен проверенный результат  ',
    });

    expect(context.decision.actualResultSummary?.toString()).toBe('Получен проверенный результат');
  });

  it('использует Clock для confirmedAt', async () => {
    const context = createContext(createPlannedDecision('clock', DATE), [completed('done')]);

    await context.command.execute(input(context.decision));

    expect(context.decision.confirmedAt).toEqual(NOW);
  });

  it('использует отдельный id события через IdGenerator', async () => {
    const context = createContext(createPlannedDecision('event', DATE), [completed('done')]);

    await context.command.execute(input(context.decision));

    const event = context.decision.getUncommittedEvents().at(-1);
    expect(event?.eventType).toBe('decision.confirmed');
    expect(event?.eventId.toString()).toBe('confirmation-event-1');
    expect(context.idGenerator.generatedCount).toBe(1);
  });

  it('сохраняет Decision ровно один раз', async () => {
    const context = createContext(createPlannedDecision('save-once', DATE), [completed('done')]);

    await context.command.execute(input(context.decision));

    expect(context.decisionRepository.saveCount).toBe(1);
  });

  it('не изменяет и повторно не сохраняет LifeAction', async () => {
    const action = completed('unchanged');
    const initialVersion = action.version;
    const context = createContext(createPlannedDecision('actions-read-only', DATE), [action]);

    await context.command.execute(input(context.decision));

    expect(action.status).toBe(LIFE_ACTION_STATUS.completed);
    expect(action.version).toBe(initialVersion);
    expect(context.lifeActionRepository.saveCount).toBe(0);
  });

  it('возвращает decision.not_found', async () => {
    const context = createContext(null, []);

    const result = await context.command.execute({
      decisionId: EntityId.create('missing'),
      actualResult: 'Результат',
    });

    expectFailure(result, 'decision.not_found');
  });

  it.each([
    ['draft', createDecisionDraft('draft')],
    ['confirmed', confirmDecision(createPlannedDecision('confirmed', DATE))],
    ['cancelled', cancelDecision(createPlannedDecision('cancelled', DATE))],
    ['archived', archiveDecision(confirmDecision(createPlannedDecision('archived', DATE)))],
  ])('запрещает %s Decision', async (_label, decision) => {
    const context = createContext(decision, [completed('done')]);

    const result = await context.command.execute(input(decision));

    expectFailure(result, 'decision.cannot_confirm');
    expect(context.decisionRepository.saveCount).toBe(0);
  });

  it('возвращает decision.no_completed_actions при отсутствии действий', async () => {
    const context = createContext(createPlannedDecision('no-actions', DATE), []);

    const result = await context.command.execute(input(context.decision));

    expectFailure(result, 'decision.no_completed_actions');
  });

  it('не считает только cancelled-действие подтверждением результата', async () => {
    const cancelled = cancelLifeAction(createReadyLifeAction('cancelled-only', DATE));
    const context = createContext(createPlannedDecision('cancelled-actions', DATE), [cancelled]);

    const result = await context.command.execute(input(context.decision));

    expectFailure(result, 'decision.no_completed_actions');
  });

  it.each([
    ['ready', createReadyLifeAction('ready', DATE)],
    ['in_progress', markLifeActionInProgress(createReadyLifeAction('progress-action', DATE))],
    ['draft', createLifeActionDraft('draft-action')],
  ])('%s-действие блокирует подтверждение', async (_status, unfinished) => {
    const context = createContext(createPlannedDecision(`blocked-${_status}`, DATE), [
      completed('done'),
      unfinished,
    ]);

    const result = await context.command.execute(input(context.decision));

    expectFailure(result, 'decision.actions_unfinished');
    expect(context.decisionRepository.saveCount).toBe(0);
  });

  it('completed и cancelled вместе разрешают подтверждение', async () => {
    const context = createContext(createPlannedDecision('completed-cancelled', DATE), [
      completed('done'),
      cancelLifeAction(createReadyLifeAction('cancelled', DATE)),
    ]);

    const result = await context.command.execute(input(context.decision));

    expect(result.ok).toBe(true);
    expect(context.decision.evidenceIds.map(String)).toEqual(['done']);
  });

  it('запрещает пустой actualResult', async () => {
    const context = createContext(createPlannedDecision('empty-result', DATE), [completed('done')]);

    const result = await context.command.execute({
      decisionId: context.decision.id,
      actualResult: '   ',
    });

    expectFailure(result, 'decision.actual_result_required');
    expect(context.decisionRepository.saveCount).toBe(0);
  });

  it('не сохраняет Decision при предметной ошибке actualResult', async () => {
    const context = createContext(createPlannedDecision('invalid-result', DATE), [
      completed('done'),
    ]);

    const result = await context.command.execute({
      decisionId: context.decision.id,
      actualResult: 'x'.repeat(2_001),
    });

    expect(result.ok).toBe(false);
    expect(context.decision.status).toBe(DECISION_STATUS.planned);
    expect(context.decisionRepository.saveCount).toBe(0);
  });
});

function input(decision: Decision) {
  return { decisionId: decision.id, actualResult: 'Фактический результат решения' } as const;
}

function completed(id: string, createdAt?: string): LifeAction {
  return completeLifeAction(
    createReadyLifeAction(id, DATE, {
      ...(createdAt === undefined ? {} : { createdAt: new Date(createdAt) }),
    }),
  );
}

interface CommandContext {
  readonly decision: Decision;
  readonly decisionRepository: TrackingDecisionRepository;
  readonly lifeActionRepository: TrackingLifeActionRepository;
  readonly idGenerator: FakeIdGenerator;
  readonly command: ConfirmDecisionFromActions;
}

interface MissingDecisionContext extends Omit<CommandContext, 'decision'> {
  readonly decision: null;
}

function createContext(decision: Decision, lifeActions: readonly LifeAction[]): CommandContext;
function createContext(decision: null, lifeActions: readonly LifeAction[]): MissingDecisionContext;
function createContext(
  decision: Decision | null,
  lifeActions: readonly LifeAction[],
): CommandContext | MissingDecisionContext {
  const decisionRepository = new TrackingDecisionRepository(decision);
  const lifeActionRepository = new TrackingLifeActionRepository(lifeActions);
  const idGenerator = new FakeIdGenerator('confirmation-event');
  return {
    decision,
    decisionRepository,
    lifeActionRepository,
    idGenerator,
    command: new ConfirmDecisionFromActions(
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
  result: Awaited<ReturnType<ConfirmDecisionFromActions['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
