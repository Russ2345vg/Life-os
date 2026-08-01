import { describe, expect, it } from 'vitest';
import { DayDate, DECISION_KIND } from '../../domain';
import { InMemoryDecisionRepository } from '../../infrastructure';
import {
  cancelDecision,
  confirmDecision,
  createPlannedDecision,
} from '../../test/helpers/DecisionTestFactory';
import { GetDecisionsForDate } from './GetDecisionsForDate';

const DATE = DayDate.create('2026-08-01');

describe('GetDecisionsForDate', () => {
  it('сортирует главные по order и помещает дополнительные после них', async () => {
    const repository = new InMemoryDecisionRepository();
    const additional = createPlannedDecision('additional', DATE, DECISION_KIND.additional);
    const third = createPlannedDecision('third', DATE, DECISION_KIND.main, 3);
    const first = createPlannedDecision('first', DATE, DECISION_KIND.main, 1);
    const second = createPlannedDecision('second', DATE, DECISION_KIND.main, 2);
    await Promise.all(
      [additional, third, first, second].map((decision) => repository.save(decision)),
    );

    const result = await new GetDecisionsForDate(repository).execute(DATE);

    expect(result.map((decision) => decision.id.toString())).toEqual([
      'first',
      'second',
      'third',
      'additional',
    ]);
  });

  it('не изменяет исходный порядок массива репозитория', async () => {
    const repository = new InMemoryDecisionRepository();
    const additional = createPlannedDecision('additional', DATE, DECISION_KIND.additional);
    const main = createPlannedDecision('main', DATE, DECISION_KIND.main, 1);
    await repository.save(additional);
    await repository.save(main);
    const before = await repository.findByDate(DATE);

    await new GetDecisionsForDate(repository).execute(DATE);

    expect(before.map((decision) => decision.id.toString())).toEqual(['additional', 'main']);
    expect((await repository.findByDate(DATE)).map((decision) => decision.id.toString())).toEqual([
      'additional',
      'main',
    ]);
  });

  it('не скрывает автоматически confirmed и cancelled решения', async () => {
    const repository = new InMemoryDecisionRepository();
    const confirmed = confirmDecision(createPlannedDecision('confirmed', DATE));
    const cancelled = cancelDecision(createPlannedDecision('cancelled', DATE));
    await repository.save(confirmed);
    await repository.save(cancelled);

    const result = await new GetDecisionsForDate(repository).execute(DATE);

    expect(result).toEqual([confirmed, cancelled]);
  });
});
