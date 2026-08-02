import { describe, expect, it, vi } from 'vitest';
import { DayDate, EntityId, type Decision } from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { GetDecisionById } from './GetDecisionById';

const DATE = DayDate.create('2026-08-02');
const DECISION_ID = EntityId.create('decision-1');

describe('GetDecisionById', () => {
  it('returns the found decision without changing or saving it', async () => {
    const decision = createPlannedDecision('decision-1', DATE);
    const repository = new FakeDecisionRepository(decision);
    const save = vi.spyOn(repository, 'save');
    const initialVersion = decision.version;
    const initialEvents = decision.getUncommittedEvents();
    const initialState = decisionState(decision);

    const result = await new GetDecisionById(repository).execute(DECISION_ID);

    expect(result).toEqual({ ok: true, value: decision });
    expect(decisionState(decision)).toEqual(initialState);
    expect(decision.version).toBe(initialVersion);
    expect(decision.getUncommittedEvents()).toEqual(initialEvents);
    expect(save).not.toHaveBeenCalled();
  });

  it('returns decision.not_found for an unknown id without saving', async () => {
    const repository = new FakeDecisionRepository();
    const save = vi.spyOn(repository, 'save');

    const result = await new GetDecisionById(repository).execute(DECISION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('decision.not_found');
    }
    expect(save).not.toHaveBeenCalled();
  });
});

class FakeDecisionRepository implements DecisionRepository {
  readonly #decision: Decision | null;

  public constructor(decision: Decision | null = null) {
    this.#decision = decision;
  }

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#decision?.id.equals(id) === true ? this.#decision : null;
  }

  public async findByDate(): Promise<readonly Decision[]> {
    return this.#decision === null ? [] : [this.#decision];
  }

  public async save(decision: Decision): Promise<void> {
    void decision;
  }
}

function decisionState(decision: Decision): object {
  return {
    status: decision.status,
    plannedDate: decision.plannedDate,
    order: decision.order,
    archivedAt: decision.archivedAt,
  };
}
