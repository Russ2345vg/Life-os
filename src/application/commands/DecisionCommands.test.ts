import { describe, expect, it } from 'vitest';
import {
  DayDate,
  DecisionTitle,
  DECISION_KIND,
  DECISION_STATUS,
  EntityId,
  ExpectedResult,
  type Decision,
} from '../../domain';
import { InMemoryDecisionRepository } from '../../infrastructure';
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
import { MainDecisionLimitPolicy } from '../decision/MainDecisionLimitPolicy';
import { CreateDecisionDraft } from './CreateDecisionDraft';
import { PlanDecision } from './PlanDecision';
import { RescheduleDecision } from './RescheduleDecision';
import { RestoreDecision } from './RestoreDecision';

const DATE = DayDate.create('2026-08-01');
const NEW_DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-01T08:00:00.000+09:00');

describe('CreateDecisionDraft', () => {
  it('создаёт и сохраняет один черновик с Clock и IdGenerator', async () => {
    const repository = new InMemoryDecisionRepository();
    const idGenerator = new FakeIdGenerator('draft');
    const command = new CreateDecisionDraft(repository, new FakeClock(NOW), idGenerator);

    const result = await command.execute({
      title: DecisionTitle.create('Подготовить релиз'),
      kind: DECISION_KIND.main,
      reason: 'Согласовать поставку',
    });
    const decision = unwrap(result);

    expect(decision.id.toString()).toBe('draft-1');
    expect(decision.createdAt).toEqual(NOW);
    expect(decision.status).toBe(DECISION_STATUS.draft);
    expect(decision.plannedDate).toBeNull();
    expect(idGenerator.generatedCount).toBe(2);
    await expect(repository.findById(decision.id)).resolves.toBe(decision);
  });

  it('не проверяет дневной лимит при создании черновика', async () => {
    const repository = new InMemoryDecisionRepository();
    await seedThreeMainDecisions(repository, DATE);
    const command = new CreateDecisionDraft(
      repository,
      new FakeClock(NOW),
      new FakeIdGenerator('draft'),
    );

    const result = await command.execute({
      title: DecisionTitle.create('Четвёртый черновик'),
      kind: DECISION_KIND.main,
    });

    expect(result.ok).toBe(true);
    expect(await repository.findByDate(DATE)).toHaveLength(3);
  });
});

describe('PlanDecision', () => {
  it('разрешает первое, второе и третье главное решение, а четвёртое отклоняет атомарно', async () => {
    const context = createCommandContext();
    const drafts = ['first', 'second', 'third', 'fourth'].map((id) =>
      createDecisionDraft(id, DECISION_KIND.main),
    );
    await Promise.all(drafts.map((decision) => context.repository.save(decision)));

    for (const [index, decision] of drafts.entries()) {
      const result = await context.plan.execute({
        decisionId: decision.id,
        plannedDate: DATE,
        kind: DECISION_KIND.main,
        order: Math.min(index + 1, 3),
        expectedResult: ExpectedResult.create(`Результат ${index + 1}`),
      });

      if (index < 3) {
        expect(result.ok).toBe(true);
      } else {
        expectFailureCode(result, 'decision.main_limit_reached');
      }
    }

    expect(drafts[3]?.status).toBe(DECISION_STATUS.draft);
    expect(drafts[3]?.plannedDate).toBeNull();
    expect(drafts[3]?.version).toBe(1);
    expect(await context.repository.findByDate(DATE)).toHaveLength(3);
  });

  it('разрешает дополнительное решение при трёх главных', async () => {
    const context = createCommandContext();
    await seedThreeMainDecisions(context.repository, DATE);
    const additional = createDecisionDraft('additional');
    await context.repository.save(additional);

    const result = await context.plan.execute({
      decisionId: additional.id,
      plannedDate: DATE,
      kind: DECISION_KIND.additional,
    });

    expect(unwrap(result)).toBe(additional);
    expect(additional.status).toBe(DECISION_STATUS.planned);
  });

  it('не считает confirmed, cancelled и archived решения', async () => {
    const context = createCommandContext();
    await context.repository.save(confirmDecision(createPlannedDecision('confirmed', DATE)));
    await context.repository.save(cancelDecision(createPlannedDecision('cancelled', DATE)));
    await context.repository.save(
      archiveDecision(confirmDecision(createPlannedDecision('archived', DATE))),
    );
    const draft = createDecisionDraft('candidate', DECISION_KIND.main);
    await context.repository.save(draft);

    const result = await context.plan.execute({
      decisionId: draft.id,
      plannedDate: DATE,
      kind: DECISION_KIND.main,
      order: 1,
      expectedResult: ExpectedResult.create('Новый результат'),
    });

    expect(result.ok).toBe(true);
  });

  it('учитывает in_progress решение', async () => {
    const context = createCommandContext();
    await context.repository.save(createPlannedDecision('first', DATE, DECISION_KIND.main, 1));
    await context.repository.save(createPlannedDecision('second', DATE, DECISION_KIND.main, 2));
    await context.repository.save(
      markDecisionInProgress(createPlannedDecision('third', DATE, DECISION_KIND.main, 3)),
    );
    const draft = createDecisionDraft('candidate', DECISION_KIND.main);
    await context.repository.save(draft);

    const result = await context.plan.execute({
      decisionId: draft.id,
      plannedDate: DATE,
      kind: DECISION_KIND.main,
      order: 1,
      expectedResult: ExpectedResult.create('Новый результат'),
    });

    expectFailureCode(result, 'decision.main_limit_reached');
    expect(draft.status).toBe(DECISION_STATUS.draft);
  });

  it('возвращает decision.not_found для отсутствующего решения', async () => {
    const context = createCommandContext();

    const result = await context.plan.execute({
      decisionId: EntityId.create('missing'),
      plannedDate: DATE,
      kind: DECISION_KIND.additional,
    });

    expectFailureCode(result, 'decision.not_found');
  });

  it('возвращает ошибку модели без частичного изменения', async () => {
    const context = createCommandContext();
    const draft = createDecisionDraft('main-draft', DECISION_KIND.main);
    await context.repository.save(draft);

    const result = await context.plan.execute({
      decisionId: draft.id,
      plannedDate: DATE,
      kind: DECISION_KIND.main,
      order: 4,
    });

    expectFailureCode(result, 'decision.main_invalid_order');
    expect(draft.status).toBe(DECISION_STATUS.draft);
    expect(draft.version).toBe(1);
  });
});

describe('RescheduleDecision', () => {
  it('переносит тот же объект на свободную дату и увеличивает счётчик', async () => {
    const context = createCommandContext();
    const decision = createPlannedDecision('candidate', DATE);
    await context.repository.save(decision);

    const result = await context.reschedule.execute({ decisionId: decision.id, newDate: NEW_DATE });

    expect(unwrap(result)).toBe(decision);
    expect(decision.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(decision.rescheduleCount).toBe(1);
    await expect(context.repository.findById(decision.id)).resolves.toBe(decision);
  });

  it('отклоняет перенос главного решения к трём другим без мутации', async () => {
    const context = createCommandContext();
    const decision = createPlannedDecision('candidate', DATE);
    await context.repository.save(decision);
    await seedThreeMainDecisions(context.repository, NEW_DATE);

    const result = await context.reschedule.execute({ decisionId: decision.id, newDate: NEW_DATE });

    expectFailureCode(result, 'decision.main_limit_reached');
    expect(decision.plannedDate?.equals(DATE)).toBe(true);
    expect(decision.rescheduleCount).toBe(0);
  });

  it('разрешает перенос дополнительного решения без лимита', async () => {
    const context = createCommandContext();
    const decision = createPlannedDecision('additional', DATE, DECISION_KIND.additional);
    await context.repository.save(decision);
    await seedThreeMainDecisions(context.repository, NEW_DATE);

    const result = await context.reschedule.execute({ decisionId: decision.id, newDate: NEW_DATE });

    expect(result.ok).toBe(true);
    expect(decision.plannedDate?.equals(NEW_DATE)).toBe(true);
  });
});

describe('RestoreDecision', () => {
  it('восстанавливает отменённое главное решение на свободную дату', async () => {
    const context = createCommandContext();
    const decision = cancelDecision(createPlannedDecision('candidate', DATE));
    await context.repository.save(decision);

    const result = await context.restore.execute({ decisionId: decision.id, newDate: NEW_DATE });

    expect(unwrap(result)).toBe(decision);
    expect(decision.status).toBe(DECISION_STATUS.planned);
    expect(decision.plannedDate?.equals(NEW_DATE)).toBe(true);
  });

  it('отклоняет восстановление при трёх главных без изменения состояния', async () => {
    const context = createCommandContext();
    const decision = cancelDecision(createPlannedDecision('candidate', DATE));
    await context.repository.save(decision);
    await seedThreeMainDecisions(context.repository, NEW_DATE);
    const version = decision.version;

    const result = await context.restore.execute({ decisionId: decision.id, newDate: NEW_DATE });

    expectFailureCode(result, 'decision.main_limit_reached');
    expect(decision.status).toBe(DECISION_STATUS.cancelled);
    expect(decision.version).toBe(version);
  });

  it('восстанавливает дополнительное решение без лимита', async () => {
    const context = createCommandContext();
    const decision = cancelDecision(
      createPlannedDecision('additional', DATE, DECISION_KIND.additional),
    );
    await context.repository.save(decision);
    await seedThreeMainDecisions(context.repository, NEW_DATE);

    const result = await context.restore.execute({ decisionId: decision.id, newDate: NEW_DATE });

    expect(result.ok).toBe(true);
    expect(decision.status).toBe(DECISION_STATUS.planned);
  });
});

function createCommandContext(): {
  repository: InMemoryDecisionRepository;
  plan: PlanDecision;
  reschedule: RescheduleDecision;
  restore: RestoreDecision;
} {
  const repository = new InMemoryDecisionRepository();
  const policy = new MainDecisionLimitPolicy(repository);
  const clock = new FakeClock(NOW);
  const idGenerator = new FakeIdGenerator('command-event');

  return {
    repository,
    plan: new PlanDecision(repository, policy, clock, idGenerator),
    reschedule: new RescheduleDecision(repository, policy, clock, idGenerator),
    restore: new RestoreDecision(repository, policy, clock, idGenerator),
  };
}

async function seedThreeMainDecisions(
  repository: InMemoryDecisionRepository,
  date: DayDate,
): Promise<void> {
  await repository.save(
    createPlannedDecision(`${date.toString()}-first`, date, DECISION_KIND.main, 1),
  );
  await repository.save(
    createPlannedDecision(`${date.toString()}-second`, date, DECISION_KIND.main, 2),
  );
  await repository.save(
    createPlannedDecision(`${date.toString()}-third`, date, DECISION_KIND.main, 3),
  );
}

function unwrap(result: Result<Decision, DomainError>): Decision {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function expectFailureCode(result: Result<Decision, DomainError>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
