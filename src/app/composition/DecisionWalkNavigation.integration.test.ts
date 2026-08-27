import { describe, expect, it } from 'vitest';
import { GetDecisionById } from '../../application';
import {
  DECISION_KIND,
  DayDate,
  Decision,
  DecisionTitle,
  EntityId,
  Walk,
  WALK_TYPE,
} from '../../domain';
import { InMemoryDecisionRepository } from '../../infrastructure/persistence/InMemoryDecisionRepository';
import {
  decisionWalkReturnId,
  loadDecisionWalkContext,
} from '../../presentation/decision/DecisionWalkNavigation';

const DATE = DayDate.create('2026-08-26');
const NOW = new Date('2026-08-26T08:00:00Z');
const SOURCE_ID = EntityId.create('original-decision');
function linkedWalk() {
  return Walk.create({
    id: EntityId.create('linked-walk'),
    date: DATE,
    type: WALK_TYPE.reflection,
    linkedEntity: { type: 'decision', id: EntityId.create('different-linked-id') },
    returnContext: {
      origin: 'decision',
      entity: { type: 'decision', id: SOURCE_ID },
      nextStep: null,
    },
    now: NOW,
  });
}
function source() {
  return Decision.createDraft({
    id: SOURCE_ID,
    title: DecisionTitle.create('Исходное решение'),
    kind: DECISION_KIND.additional,
    occurredAt: NOW,
    eventId: EntityId.create('created'),
  });
}

describe('Decision Walk destination', () => {
  it('uses the persisted return id rather than link title or a different linked entity', async () => {
    const repository = new InMemoryDecisionRepository();
    await repository.save(source());
    expect(decisionWalkReturnId(linkedWalk())?.toString()).toBe('original-decision');
    expect(
      await loadDecisionWalkContext(linkedWalk(), new GetDecisionById(repository)),
    ).toMatchObject({
      status: 'ready',
      title: 'Исходное решение',
      decisionId: SOURCE_ID,
      plannedDate: null,
    });
  });
  it.each(['missing', 'deleted', 'storage-error'] as const)(
    'has a safe %s fallback without recreating the Decision',
    async (kind) => {
      const repository = new InMemoryDecisionRepository();
      if (kind === 'deleted') {
        const decision = source();
        decision.softDelete(NOW, EntityId.create('deleted'));
        await repository.save(decision);
      }
      const query =
        kind === 'storage-error'
          ? {
              execute: async () => {
                throw new Error('offline');
              },
            }
          : new GetDecisionById(repository);
      expect(await loadDecisionWalkContext(linkedWalk(), query)).toEqual({ status: 'unavailable' });
      expect((await repository.findAll()).length).toBe(kind === 'deleted' ? 1 : 0);
    },
  );
  it('does not invent a Decision destination for an ordinary walk', async () => {
    const walk = Walk.create({
      id: EntityId.create('free-walk'),
      date: DATE,
      type: WALK_TYPE.mindful,
      now: NOW,
    });
    expect(decisionWalkReturnId(walk)).toBeNull();
    expect(
      await loadDecisionWalkContext(walk, new GetDecisionById(new InMemoryDecisionRepository())),
    ).toEqual({ status: 'not-linked' });
  });
});
