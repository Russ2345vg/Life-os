import { describe, expect, it } from 'vitest';
import { DayDate, DECISION_KIND, Decision, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { TestDecisionRepository } from '../../test/helpers/TestRepositories';
import { createPlannedDecision, decisionId } from '../../test/helpers/DecisionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { MainDecisionLimitPolicy } from '../decision/MainDecisionLimitPolicy';
import { RestoreDeletedDecision } from './RestoreDeletedDecision';

const DATE = DayDate.create('2026-08-06');
const DELETED_AT = new Date('2026-08-06T20:00:00.000+09:00');
const RESTORED_AT = new Date('2026-08-07T08:00:00.000+09:00');

describe('RestoreDeletedDecision', () => {
  it('восстанавливает решение в исходном состоянии', async () => {
    const decision = deleted(createPlannedDecision('restore-success', DATE));
    const context = await createContext([decision]);
    const version = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: version,
    });

    expect(result.ok).toBe(true);
    const stored = await context.repository.findById(decision.id);
    expect(stored?.isDeleted()).toBe(false);
    expect(stored?.plannedDate).toEqual(DATE);
    expect(stored?.status).toBe('planned');
    expect(stored?.lastDeletedAt).toEqual(DELETED_AT);
    expect(stored?.restoredFromTrashAt).toEqual(RESTORED_AT);
    expect(stored?.version).toBe(version + 1);
  });

  it('назначает свободную позицию, если прежняя позиция главного решения уже занята', async () => {
    const deletedMain = deleted(
      createPlannedDecision('restore-order', DATE, DECISION_KIND.main, 1),
    );
    const first = createPlannedDecision('occupied-first', DATE, DECISION_KIND.main, 1);
    const second = createPlannedDecision('occupied-second', DATE, DECISION_KIND.main, 2);
    const context = await createContext([deletedMain, first, second]);

    const result = await context.command.execute({ decisionId: deletedMain.id });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.order).toBe(3);
    }
  });

  it('не восстанавливает четвёртое главное решение на дату', async () => {
    const deletedMain = deleted(createPlannedDecision('restore-main', DATE, DECISION_KIND.main, 1));
    const active = [1, 2, 3].map((order) =>
      createPlannedDecision(`active-${order}`, DATE, DECISION_KIND.main, order),
    );
    const context = await createContext([deletedMain, ...active]);

    const result = await context.command.execute({ decisionId: deletedMain.id });

    expectFailure(result, 'decision.main_limit_reached');
    expect((await context.repository.findById(deletedMain.id))?.isDeleted()).toBe(true);
  });

  it('не восстанавливает дубликат активного решения', async () => {
    const deletedDecision = deleted(createPlannedDecision('duplicate-title', DATE));
    const duplicate = cloneWithId(deletedDecision, 'duplicate-active');
    duplicate.restoreFromTrash(RESTORED_AT, decisionId('duplicate-restore-event'));
    const context = await createContext([deletedDecision, duplicate]);

    const result = await context.command.execute({ decisionId: deletedDecision.id });

    expectFailure(result, 'decision.restore_duplicate');
  });

  it('отклоняет устаревшую версию', async () => {
    const decision = deleted(createPlannedDecision('stale-restore', DATE));
    const context = await createContext([decision]);

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: decision.version - 1,
    });

    expectFailure(result, 'decision.restore_conflict');
    expect((await context.repository.findById(decision.id))?.isDeleted()).toBe(true);
  });

  it('отклоняет решение вне корзины', async () => {
    const decision = createPlannedDecision('not-deleted', DATE);
    const context = await createContext([decision]);

    const result = await context.command.execute({ decisionId: decision.id });

    expectFailure(result, 'decision.restore_requires_deleted');
  });
});

function deleted(decision: Decision): Decision {
  decision.softDelete(DELETED_AT, decisionId(`${decision.id.toString()}-delete-event`));
  return decision;
}

async function createContext(decisions: readonly Decision[]) {
  const repository = new TestDecisionRepository();
  for (const decision of decisions) await repository.save(decision);
  return {
    repository,
    command: new RestoreDeletedDecision(
      repository,
      new MainDecisionLimitPolicy(repository),
      new FakeClock(RESTORED_AT),
      new FakeIdGenerator('restore-event'),
    ),
  };
}

function cloneWithId(source: Decision, id: string): Decision {
  return Decision.rehydrate({
    id: EntityId.create(id),
    title: source.title,
    reason: source.reason,
    sphere: source.sphere,
    price: source.price,
    sacrifices: source.sacrifices,
    priority: source.priority,
    projectReference: source.projectReference,
    expectedResult: source.expectedResult,
    actualResultSummary: source.actualResultSummary,
    status: source.status,
    kind: source.kind,
    plannedDate: source.plannedDate,
    order: source.order,
    createdAt: source.createdAt,
    plannedAt: source.plannedAt,
    startedAt: source.startedAt,
    confirmedAt: source.confirmedAt,
    cancelledAt: source.cancelledAt,
    cancelReason: source.cancelReason,
    archivedAt: source.archivedAt,
    deletedAt: source.deletedAt,
    lastDeletedAt: source.lastDeletedAt,
    restoredFromTrashAt: source.restoredFromTrashAt,
    evidenceIds: source.evidenceIds,
    rescheduleCount: source.rescheduleCount,
    version: source.version,
  });
}

function expectFailure(
  result: Awaited<ReturnType<RestoreDeletedDecision['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
