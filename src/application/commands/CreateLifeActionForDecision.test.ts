import { describe, expect, it, vi } from 'vitest';
import type { Clock, LifeActionRepository } from '../../application';
import {
  DayDate,
  DECISION_STATUS,
  EntityId,
  LIFE_ACTION_STATUS,
  LifeActionDraftCreated,
  LifeActionReady,
  type Decision,
  type LifeAction,
} from '../../domain';
import { InMemoryDecisionRepository, InMemoryLifeActionRepository } from '../../infrastructure';
import type { Result } from '../../shared/result/Result';
import {
  archiveDecision,
  cancelDecision,
  confirmDecision,
  createDecisionDraft,
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import { FakeIdGenerator } from '../../test/helpers/Fakes';
import { CreateLifeActionForDecision } from './CreateLifeActionForDecision';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T08:00:00.000+09:00');

describe('CreateLifeActionForDecision', () => {
  it.each([
    ['planned', () => createPlannedDecision('decision', DATE)],
    ['in_progress', () => markDecisionInProgress(createPlannedDecision('decision', DATE))],
  ])('creates a ready action for a %s decision', async (_status, createDecision) => {
    const context = await createContext(createDecision());

    const action = unwrap(await context.command.execute(validInput(context.decision)));

    expect(action.decisionId?.equals(context.decision.id)).toBe(true);
    expect(action.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(action.title.toString()).toBe('Подготовить рабочую область');
    expect(action.expectedResult?.toString()).toBe('Рабочая область готова');
    expect(action.plannedDate?.equals(DATE)).toBe(true);
  });

  it('preserves an optional description and accepts its absence', async () => {
    const withDescription = await createContext(createPlannedDecision('with-description', DATE));
    const described = unwrap(
      await withDescription.command.execute({
        ...validInput(withDescription.decision),
        description: 'Собрать нужные материалы',
      }),
    );
    const withoutDescription = await createContext(
      createPlannedDecision('without-description', DATE),
    );
    const plain = unwrap(
      await withoutDescription.command.execute(validInput(withoutDescription.decision)),
    );

    expect(described.description).toBe('Собрать нужные материалы');
    expect(plain.description).toBeNull();
  });

  it('uses one clock value, three identifiers, and saves only the ready action once', async () => {
    const context = await createContext(createPlannedDecision('decision', DATE));

    const action = unwrap(await context.command.execute(validInput(context.decision)));

    expect(context.clock.callCount).toBe(1);
    expect(context.idGenerator.generatedCount).toBe(3);
    expect(context.lifeActionRepository.saveCount).toBe(1);
    expect(context.lifeActionRepository.savedStatuses).toEqual([LIFE_ACTION_STATUS.ready]);
    expect(action.createdAt).toEqual(NOW);
    expect(action.readyAt).toEqual(NOW);
  });

  it('creates action.draft_created and action.ready with distinct ids at the same time', async () => {
    const context = await createContext(createPlannedDecision('decision', DATE));

    const action = unwrap(await context.command.execute(validInput(context.decision)));
    const events = action.getUncommittedEvents();

    expect(events).toHaveLength(2);
    expect(events[0]).toBeInstanceOf(LifeActionDraftCreated);
    expect(events[1]).toBeInstanceOf(LifeActionReady);
    expect(events.map((event) => event.eventType)).toEqual([
      'action.draft_created',
      'action.ready',
    ]);
    expect(events[0]?.eventId.equals(events[1]!.eventId)).toBe(false);
    expect(events.every((event) => event.occurredAt.getTime() === NOW.getTime())).toBe(true);
  });

  it('does not change or save the decision', async () => {
    const decision = createPlannedDecision('decision', DATE);
    const context = await createContext(decision);
    const decisionSave = vi.spyOn(context.decisionRepository, 'save');
    decisionSave.mockClear();
    const initialVersion = decision.version;
    const initialStatus = decision.status;
    const initialEvents = decision.getUncommittedEvents();

    await context.command.execute(validInput(decision));

    expect(decision.version).toBe(initialVersion);
    expect(decision.status).toBe(initialStatus);
    expect(decision.getUncommittedEvents()).toEqual(initialEvents);
    expect(decisionSave).not.toHaveBeenCalled();
  });

  it('returns decision.not_found without using creation dependencies', async () => {
    const context = createEmptyContext();

    const result = await context.command.execute({
      ...validInput(createDecisionDraft('missing')),
      decisionId: EntityId.create('missing'),
    });

    expectFailureCode(result, 'decision.not_found');
    expect(context.clock.callCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
    expect(context.lifeActionRepository.saveCount).toBe(0);
  });

  it.each([
    ['confirmed', () => confirmDecision(createPlannedDecision('confirmed', DATE))],
    ['cancelled', () => cancelDecision(createPlannedDecision('cancelled', DATE))],
    ['archived', () => archiveDecision(confirmDecision(createPlannedDecision('archived', DATE)))],
  ])(
    'rejects a %s decision without creating or saving an action',
    async (_status, createDecision) => {
      const context = await createContext(createDecision());

      const result = await context.command.execute(validInput(context.decision));

      expectFailureCode(result, 'action.decision_unavailable');
      expect(context.clock.callCount).toBe(0);
      expect(context.idGenerator.generatedCount).toBe(0);
      expect(context.lifeActionRepository.saveCount).toBe(0);
    },
  );

  it('does not leave a draft in the repository when makeReady fails', async () => {
    const context = await createContext(createPlannedDecision('decision', DATE));

    const result = await context.command.execute({
      ...validInput(context.decision),
      expectedResult: '   ',
    });

    expectFailureCode(result, 'action_expected_result.invalid');
    expect(context.lifeActionRepository.saveCount).toBe(0);
    await expect(
      context.lifeActionRepository.findByDecisionId(context.decision.id),
    ).resolves.toEqual([]);
  });

  it('allows a draft decision', async () => {
    const context = await createContext(createDecisionDraft('draft'));

    const action = unwrap(await context.command.execute(validInput(context.decision)));

    expect(context.decision.status).toBe(DECISION_STATUS.draft);
    expect(action.status).toBe(LIFE_ACTION_STATUS.ready);
  });
});

class CountingClock implements Clock {
  #callCount = 0;

  public now(): Date {
    this.#callCount += 1;
    return new Date(NOW.getTime());
  }

  public get callCount(): number {
    return this.#callCount;
  }
}

class CountingLifeActionRepository implements LifeActionRepository {
  readonly #repository = new InMemoryLifeActionRepository();
  readonly #savedStatuses: string[] = [];

  public findById(id: EntityId): Promise<LifeAction | null> {
    return this.#repository.findById(id);
  }

  public findByDate(date: DayDate): Promise<readonly LifeAction[]> {
    return this.#repository.findByDate(date);
  }

  public findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]> {
    return this.#repository.findByDecisionId(decisionId);
  }

  public async save(lifeAction: LifeAction): Promise<void> {
    this.#savedStatuses.push(lifeAction.status);
    await this.#repository.save(lifeAction);
  }

  public get saveCount(): number {
    return this.#savedStatuses.length;
  }

  public get savedStatuses(): readonly string[] {
    return [...this.#savedStatuses];
  }
}

function createEmptyContext() {
  const decisionRepository = new InMemoryDecisionRepository();
  const lifeActionRepository = new CountingLifeActionRepository();
  const clock = new CountingClock();
  const idGenerator = new FakeIdGenerator('linked-action');
  return {
    decisionRepository,
    lifeActionRepository,
    clock,
    idGenerator,
    command: new CreateLifeActionForDecision(
      decisionRepository,
      lifeActionRepository,
      clock,
      idGenerator,
    ),
  };
}

async function createContext(decision: Decision) {
  const context = createEmptyContext();
  await context.decisionRepository.save(decision);
  return { ...context, decision };
}

function validInput(decision: Decision) {
  return {
    decisionId: decision.id,
    title: 'Подготовить рабочую область',
    expectedResult: 'Рабочая область готова',
    plannedDate: DATE,
  } as const;
}

function unwrap(result: Result<LifeAction, Error>): LifeAction {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function expectFailureCode(result: Result<LifeAction, Error>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toMatchObject({ code });
  }
}
