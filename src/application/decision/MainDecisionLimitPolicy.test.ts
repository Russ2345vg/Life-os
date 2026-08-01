import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { InMemoryDecisionRepository } from '../../infrastructure';
import {
  archiveDecision,
  cancelDecision,
  confirmDecision,
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import { MainDecisionLimitPolicy } from './MainDecisionLimitPolicy';

const DATE = DayDate.create('2026-08-01');

describe('MainDecisionLimitPolicy', () => {
  it('учитывает planned и in_progress главные решения', async () => {
    const repository = new InMemoryDecisionRepository();
    const candidate = createPlannedDecision('candidate', DayDate.create('2026-08-02'));
    await repository.save(createPlannedDecision('first', DATE, 'main', 1));
    await repository.save(createPlannedDecision('second', DATE, 'main', 2));
    await repository.save(markDecisionInProgress(createPlannedDecision('third', DATE, 'main', 3)));

    const result = await new MainDecisionLimitPolicy(repository).check(candidate, DATE);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('decision.main_limit_reached');
    }
  });

  it('не учитывает confirmed, cancelled, archived и additional', async () => {
    const repository = new InMemoryDecisionRepository();
    const candidate = createPlannedDecision('candidate', DayDate.create('2026-08-02'));
    await repository.save(confirmDecision(createPlannedDecision('confirmed', DATE)));
    await repository.save(cancelDecision(createPlannedDecision('cancelled', DATE)));
    await repository.save(
      archiveDecision(confirmDecision(createPlannedDecision('archived', DATE))),
    );
    await repository.save(createPlannedDecision('additional', DATE, 'additional'));

    await expect(new MainDecisionLimitPolicy(repository).check(candidate, DATE)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('не считает повторно проверяемое решение', async () => {
    const repository = new InMemoryDecisionRepository();
    const candidate = createPlannedDecision('candidate', DATE, 'main', 1);
    await repository.save(candidate);
    await repository.save(createPlannedDecision('second', DATE, 'main', 2));
    await repository.save(createPlannedDecision('third', DATE, 'main', 3));

    await expect(new MainDecisionLimitPolicy(repository).check(candidate, DATE)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });
});
