import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { GetDecisionOverview } from '../../application';
import {
  ActionSession,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
} from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { IndexedDbDecisionRepository } from './IndexedDbDecisionRepository';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const DATE = DayDate.create('2026-08-05');

describe('decision overview IndexedDB integration', () => {
  it('restores the decision, linked action result, and completed session after reopening', async () => {
    const indexedDb = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(indexedDb);
    await firstDatabase.open();
    const firstDecisionRepository = new IndexedDbDecisionRepository(firstDatabase);
    const firstActionRepository = new IndexedDbLifeActionRepository(firstDatabase);
    const firstSessionRepository = new IndexedDbActionSessionRepository(firstDatabase);
    const decision = createPlannedDecision('persisted-overview', DATE);
    const action = completeLifeAction(
      createReadyLifeAction('persisted-overview-action', DATE, { decisionId: decision.id }),
    );
    const session = ActionSession.start({
      id: EntityId.create('persisted-overview-session'),
      lifeActionId: action.id,
      startedAt: new Date('2026-08-05T09:00:00.000Z'),
      eventId: EntityId.create('persisted-overview-session-started'),
    });
    session.complete({
      completedAt: new Date('2026-08-05T09:40:00.000Z'),
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: SessionResultNote.create('Зафиксированный результат сессии'),
      eventId: EntityId.create('persisted-overview-session-completed'),
    });

    await Promise.all([
      firstDecisionRepository.save(decision),
      firstActionRepository.save(action),
      firstSessionRepository.save(session),
    ]);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(indexedDb);
    await reopenedDatabase.open();
    const query = new GetDecisionOverview(
      new IndexedDbDecisionRepository(reopenedDatabase),
      new IndexedDbLifeActionRepository(reopenedDatabase),
      new IndexedDbActionSessionRepository(reopenedDatabase),
    );

    const result = await query.execute(decision.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.decision.id.equals(decision.id)).toBe(true);
      expect(result.value.actions).toHaveLength(1);
      expect(result.value.actions[0]?.lifeAction.actualResult?.toString()).toBe(
        'Действие выполнено',
      );
      expect(result.value.actions[0]?.sessions).toHaveLength(1);
      expect(result.value.actions[0]?.sessions[0]?.resultNote?.toString()).toBe(
        'Зафиксированный результат сессии',
      );
      expect(
        result.value.actions[0]?.sessions[0]?.workedDurationAt(
          new Date('2026-08-05T12:00:00.000Z'),
        ),
      ).toBe(40 * 60_000);
    }
    reopenedDatabase.close();
  });
});
