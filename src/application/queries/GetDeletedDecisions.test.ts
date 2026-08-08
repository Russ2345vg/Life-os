import { describe, expect, it } from 'vitest';
import { DayDate, type Decision } from '../../domain';
import { TestDecisionRepository } from '../../test/helpers/TestRepositories';
import { createPlannedDecision, decisionId } from '../../test/helpers/DecisionTestFactory';
import { GetDeletedDecisions } from './GetDeletedDecisions';

const DATE = DayDate.create('2026-08-06');

describe('GetDeletedDecisions', () => {
  it('возвращает только удалённые решения от новых к старым', async () => {
    const repository = new TestDecisionRepository();
    const active = createPlannedDecision('active', DATE);
    const older = deleteAt(createPlannedDecision('older', DATE), '2026-08-06T18:00:00.000+09:00');
    const newer = deleteAt(createPlannedDecision('newer', DATE), '2026-08-06T20:00:00.000+09:00');
    for (const decision of [active, older, newer]) await repository.save(decision);

    const result = await new GetDeletedDecisions(repository).execute();

    expect(result.map((decision) => decision.id.toString())).toEqual(['newer', 'older']);
  });

  it('возвращает пустой список, если хранилище не поддерживает findAll', async () => {
    const result = await new GetDeletedDecisions({
      findById: async () => null,
      findByDate: async () => [],
      save: async () => undefined,
    }).execute();

    expect(result).toEqual([]);
  });
});

function deleteAt(decision: Decision, value: string): Decision {
  decision.softDelete(new Date(value), decisionId(`${decision.id.toString()}-delete-event`));
  return decision;
}
