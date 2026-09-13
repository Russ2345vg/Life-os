import { describe, expect, it } from 'vitest';
import {
  ActionExpectedResult,
  DayDate,
  DECISION_KIND,
  EntityId,
  LIFE_ACTION_STATUS,
  LifeActionReady,
  LifeActionTitle,
  type LifeAction,
} from '../../domain';
import { InMemoryDecisionRepository, InMemoryLifeActionRepository } from '../../infrastructure';
import { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import {
  archiveDecision,
  cancelDecision,
  confirmDecision,
  createDecisionDraft,
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { CreateLifeActionDraft } from './CreateLifeActionDraft';
import { MakeLifeActionReady } from './MakeLifeActionReady';

const DATE = DayDate.create('2026-08-01');
const NOW = new Date('2026-08-01T10:00:00.000+09:00');

describe('CreateLifeActionDraft', () => {
  it('создаёт полноценное standalone-действие только по title', async () => {
    const repository = new InMemoryLifeActionRepository();
    const command = new CreateLifeActionDraft(
      repository,
      new InMemoryDecisionRepository(),
      new FakeClock(NOW),
      new FakeIdGenerator('standalone'),
    );
    const action = unwrap(await command.execute({ title: LifeActionTitle.create('Прогуляться') }));

    expect(action.status).toBe(LIFE_ACTION_STATUS.draft);
    expect(action.goalId).toBeNull();
    expect(action.decisionId).toBeNull();
    expect(action.plannedDate).toBeNull();
    expect(action.expectedResult).toBeNull();
    expect(action.startedAt).toBeNull();
    await expect(repository.findAll()).resolves.toEqual([action]);
  });

  it('создаёт и сохраняет независимый черновик с Clock и двумя id', async () => {
    const lifeActionRepository = new InMemoryLifeActionRepository();
    const idGenerator = new FakeIdGenerator('action');
    const command = new CreateLifeActionDraft(
      lifeActionRepository,
      new InMemoryDecisionRepository(),
      new FakeClock(NOW),
      idGenerator,
    );

    const result = await command.execute({
      title: LifeActionTitle.create('Подготовить прототип'),
      description: '  Проверить основной сценарий  ',
    });
    const lifeAction = unwrap(result);

    expect(lifeAction.id.toString()).toBe('action-1');
    expect(lifeAction.createdAt).toEqual(NOW);
    expect(lifeAction.description).toBe('Проверить основной сценарий');
    expect(lifeAction.status).toBe(LIFE_ACTION_STATUS.draft);
    expect(lifeAction.plannedDate).toBeNull();
    expect(lifeAction.getUncommittedEvents()[0]?.eventId.toString()).toBe('action-2');
    expect(idGenerator.generatedCount).toBe(2);
    await expect(lifeActionRepository.findById(lifeAction.id)).resolves.toBe(lifeAction);
  });

  it('разрешает связь с draft, planned и in_progress Decision, не изменяя решения', async () => {
    const decisions = [
      createDecisionDraft('draft-decision'),
      createPlannedDecision('planned-decision', DATE, DECISION_KIND.additional),
      markDecisionInProgress(
        createPlannedDecision('in-progress-decision', DATE, DECISION_KIND.additional),
      ),
    ];

    for (const decision of decisions) {
      const decisionRepository = new InMemoryDecisionRepository();
      const lifeActionRepository = new InMemoryLifeActionRepository();
      await decisionRepository.save(decision);
      const version = decision.version;
      const events = decision.getUncommittedEvents();
      const command = new CreateLifeActionDraft(
        lifeActionRepository,
        decisionRepository,
        new FakeClock(NOW),
        new FakeIdGenerator(decision.status),
      );

      const result = await command.execute({
        title: LifeActionTitle.create(`Действие для ${decision.status}`),
        decisionId: decision.id,
      });
      const lifeAction = unwrap(result);

      expect(lifeAction.decisionId?.equals(decision.id)).toBe(true);
      expect(decision.version).toBe(version);
      expect(decision.getUncommittedEvents()).toEqual(events);
      await expect(lifeActionRepository.findByDecisionId(decision.id)).resolves.toEqual([
        lifeAction,
      ]);
    }
  });

  it('возвращает decision.not_found и не создаёт действие', async () => {
    const lifeActionRepository = new InMemoryLifeActionRepository();
    const idGenerator = new FakeIdGenerator('missing-decision');
    const command = new CreateLifeActionDraft(
      lifeActionRepository,
      new InMemoryDecisionRepository(),
      new FakeClock(NOW),
      idGenerator,
    );

    const result = await command.execute({
      title: LifeActionTitle.create('Связанное действие'),
      decisionId: EntityId.create('missing'),
    });

    expectFailureCode(result, 'decision.not_found');
    expect(idGenerator.generatedCount).toBe(0);
    await expect(
      lifeActionRepository.findByDecisionId(EntityId.create('missing')),
    ).resolves.toEqual([]);
  });

  it('запрещает связь с confirmed, cancelled и архивированным Decision без мутаций', async () => {
    const unavailableDecisions = [
      confirmDecision(createPlannedDecision('confirmed', DATE)),
      cancelDecision(createPlannedDecision('cancelled', DATE)),
      archiveDecision(confirmDecision(createPlannedDecision('archived', DATE))),
    ];

    for (const decision of unavailableDecisions) {
      const decisionRepository = new InMemoryDecisionRepository();
      const lifeActionRepository = new InMemoryLifeActionRepository();
      const idGenerator = new FakeIdGenerator('unavailable');
      await decisionRepository.save(decision);
      const version = decision.version;
      const events = decision.getUncommittedEvents();
      const command = new CreateLifeActionDraft(
        lifeActionRepository,
        decisionRepository,
        new FakeClock(NOW),
        idGenerator,
      );

      const result = await command.execute({
        title: LifeActionTitle.create('Недопустимое связанное действие'),
        decisionId: decision.id,
      });

      expectFailureCode(result, 'action.decision_unavailable');
      expect(idGenerator.generatedCount).toBe(0);
      expect(decision.version).toBe(version);
      expect(decision.getUncommittedEvents()).toEqual(events);
      await expect(lifeActionRepository.findByDecisionId(decision.id)).resolves.toEqual([]);
    }
  });

  it('возвращает предметную ошибку и не сохраняет частично созданное действие', async () => {
    const lifeActionRepository = new InMemoryLifeActionRepository();
    const command = new CreateLifeActionDraft(
      lifeActionRepository,
      new InMemoryDecisionRepository(),
      new FakeClock(NOW),
      new FakeIdGenerator('invalid'),
    );

    const result = await command.execute({
      title: null as unknown as LifeActionTitle,
    });

    expectFailureCode(result, 'life_action.title_required');
    await expect(lifeActionRepository.findById(EntityId.create('invalid-1'))).resolves.toBeNull();
  });
});

describe('MakeLifeActionReady', () => {
  it('переводит draft в ready, сохраняет результат, дату, время и событие', async () => {
    const repository = new InMemoryLifeActionRepository();
    const lifeAction = createLifeActionDraft('action-1');
    lifeAction.clearUncommittedEvents();
    await repository.save(lifeAction);
    const idGenerator = new FakeIdGenerator('ready-event');
    const command = new MakeLifeActionReady(repository, new FakeClock(NOW), idGenerator);
    const expectedResult = ActionExpectedResult.create('Прототип согласован');

    const result = await command.execute({
      lifeActionId: lifeAction.id,
      expectedResult,
      plannedDate: DATE,
    });
    const updated = unwrap(result);

    expect(updated).toBe(lifeAction);
    expect(updated.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(updated.expectedResult?.equals(expectedResult)).toBe(true);
    expect(updated.plannedDate?.equals(DATE)).toBe(true);
    expect(updated.readyAt).toEqual(NOW);
    expect(updated.startedAt).toBeNull();
    expect(updated.getUncommittedEvents()).toHaveLength(1);
    const event = updated.getUncommittedEvents()[0];
    expect(event).toBeInstanceOf(LifeActionReady);
    expect(event?.eventId.toString()).toBe('ready-event-1');
    expect(event?.occurredAt).toEqual(NOW);
    expect(idGenerator.generatedCount).toBe(1);
    await expect(repository.findById(updated.id)).resolves.toBe(updated);
  });

  it('возвращает action.not_found для отсутствующего действия', async () => {
    const repository = new InMemoryLifeActionRepository();
    const idGenerator = new FakeIdGenerator('unused');
    const command = new MakeLifeActionReady(repository, new FakeClock(NOW), idGenerator);

    const result = await command.execute({
      lifeActionId: EntityId.create('missing'),
      expectedResult: ActionExpectedResult.create('Результат'),
      plannedDate: DATE,
    });

    expectFailureCode(result, 'action.not_found');
    expect(idGenerator.generatedCount).toBe(0);
  });

  it('возвращает ошибку повторной подготовки без частичного изменения', async () => {
    const repository = new InMemoryLifeActionRepository();
    const lifeAction = createLifeActionDraft('already-ready');
    lifeAction.makeReady({
      expectedResult: ActionExpectedResult.create('Первоначальный результат'),
      plannedDate: DATE,
      occurredAt: NOW,
      eventId: EntityId.create('first-ready-event'),
    });
    lifeAction.clearUncommittedEvents();
    await repository.save(lifeAction);
    const version = lifeAction.version;
    const command = new MakeLifeActionReady(
      repository,
      new FakeClock(new Date('2026-08-02T10:00:00.000+09:00')),
      new FakeIdGenerator('second-ready-event'),
    );

    const result = await command.execute({
      lifeActionId: lifeAction.id,
      expectedResult: ActionExpectedResult.create('Другой результат'),
      plannedDate: DayDate.create('2026-08-02'),
    });

    expectFailureCode(result, 'life_action.make_ready_requires_draft');
    expect(lifeAction.expectedResult?.toString()).toBe('Первоначальный результат');
    expect(lifeAction.plannedDate?.equals(DATE)).toBe(true);
    expect(lifeAction.readyAt).toEqual(NOW);
    expect(lifeAction.version).toBe(version);
    expect(lifeAction.getUncommittedEvents()).toEqual([]);
  });

  it('не оставляет частичных данных при ошибке предметной валидации', async () => {
    const repository = new InMemoryLifeActionRepository();
    const lifeAction = createLifeActionDraft('invalid-ready');
    lifeAction.clearUncommittedEvents();
    await repository.save(lifeAction);
    const command = new MakeLifeActionReady(
      repository,
      new FakeClock(NOW),
      new FakeIdGenerator('invalid-ready-event'),
    );

    const result = await command.execute({
      lifeActionId: lifeAction.id,
      expectedResult: null as unknown as ActionExpectedResult,
      plannedDate: DATE,
    });

    expectFailureCode(result, 'life_action.expected_result_required');
    expect(lifeAction.status).toBe(LIFE_ACTION_STATUS.draft);
    expect(lifeAction.expectedResult).toBeNull();
    expect(lifeAction.plannedDate).toBeNull();
    expect(lifeAction.readyAt).toBeNull();
    expect(lifeAction.version).toBe(1);
    expect(lifeAction.getUncommittedEvents()).toEqual([]);
  });
});

function unwrap(result: Result<LifeAction, DomainError>): LifeAction {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function expectFailureCode(result: Result<LifeAction, DomainError>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
