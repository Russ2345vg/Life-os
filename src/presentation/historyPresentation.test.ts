import { describe, expect, it } from 'vitest';
import {
  ActionSession,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
} from '../domain';
import {
  cancelDecision,
  confirmDecision,
  createPlannedDecision,
} from '../test/helpers/DecisionTestFactory';
import {
  cancelLifeAction,
  completeLifeAction,
  createReadyLifeAction,
} from '../test/helpers/LifeActionTestFactory';
import {
  HISTORY_ENTITY_FILTER,
  HISTORY_OUTCOME_FILTER,
  createHistoryEntries,
  filterHistoryEntries,
  formatHistoryDuration,
  summarizeHistory,
} from './historyPresentation';

const DATE = DayDate.create('2026-08-01');

function createData() {
  const confirmed = confirmDecision(createPlannedDecision('confirmed', DATE));
  const cancelledDecision = cancelDecision(createPlannedDecision('cancelled', DATE));
  const completed = completeLifeAction(createReadyLifeAction('completed', DATE));
  const cancelledAction = cancelLifeAction(createReadyLifeAction('cancelled-action', DATE));
  const completedSession = createSession('session-completed', completed.id, false);
  const interruptedSession = createSession('session-interrupted', completed.id, true);

  return {
    startDate: DATE,
    endDate: DATE,
    decisions: [confirmed, cancelledDecision],
    lifeActions: [completed, cancelledAction],
    actionSessions: [
      { session: completedSession, lifeAction: completed },
      { session: interruptedSession, lifeAction: completed },
    ],
  } as const;
}

describe('history presentation', () => {
  it('строит единую хронологию решений, действий и сессий', () => {
    const entries = createHistoryEntries(createData());

    expect(entries).toHaveLength(6);
    expect(entries.some((entry) => entry.kind === 'decision')).toBe(true);
    expect(entries.some((entry) => entry.kind === 'action')).toBe(true);
    expect(entries.some((entry) => entry.kind === 'session')).toBe(true);
  });

  it('фильтрует тип сущности и исход одновременно', () => {
    const entries = createHistoryEntries(createData());

    expect(
      filterHistoryEntries(
        entries,
        HISTORY_ENTITY_FILTER.decisions,
        HISTORY_OUTCOME_FILTER.cancelled,
      ),
    ).toHaveLength(1);
    expect(
      filterHistoryEntries(
        entries,
        HISTORY_ENTITY_FILTER.sessions,
        HISTORY_OUTCOME_FILTER.interrupted,
      ),
    ).toHaveLength(1);
  });

  it('считает итоговые показатели и рабочее время', () => {
    const summary = summarizeHistory(createHistoryEntries(createData()));

    expect(summary.confirmedDecisions).toBe(1);
    expect(summary.completedActions).toBe(1);
    expect(summary.sessions).toBe(2);
    expect(summary.cancelled).toBe(3);
    expect(summary.workedDurationMs).toBe(60 * 60_000);
  });

  it('форматирует минуты и часы без технических единиц', () => {
    expect(formatHistoryDuration(35 * 60_000)).toBe('35 мин');
    expect(formatHistoryDuration(60 * 60_000)).toBe('1 ч');
    expect(formatHistoryDuration(95 * 60_000)).toBe('1 ч 35 мин');
  });
});

function createSession(id: string, lifeActionId: EntityId, interrupted: boolean): ActionSession {
  const startedAt = new Date(`2026-08-01T${interrupted ? '11' : '09'}:00:00.000+09:00`);
  const completedAt = new Date(startedAt.getTime() + 30 * 60_000);
  const session = ActionSession.start({
    id: EntityId.create(id),
    lifeActionId,
    startedAt,
    eventId: EntityId.create(`${id}-start`),
  });
  session.complete({
    completedAt,
    completionKind: interrupted
      ? SESSION_COMPLETION_KIND.interrupted
      : SESSION_COMPLETION_KIND.completed,
    resultNote: SessionResultNote.create('Итог сессии'),
    eventId: EntityId.create(`${id}-complete`),
  });
  return session;
}
