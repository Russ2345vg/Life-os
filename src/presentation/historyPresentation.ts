import {
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
  type ActionSession,
  type Decision,
  type LifeAction,
} from '../domain';
import type { HistoryDateRangeResult } from '../application';

export const HISTORY_ENTITY_FILTER = {
  all: 'all',
  decisions: 'decisions',
  actions: 'actions',
  sessions: 'sessions',
} as const;

export type HistoryEntityFilter =
  (typeof HISTORY_ENTITY_FILTER)[keyof typeof HISTORY_ENTITY_FILTER];

export const HISTORY_OUTCOME_FILTER = {
  all: 'all',
  completed: 'completed',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
} as const;

export type HistoryOutcomeFilter =
  (typeof HISTORY_OUTCOME_FILTER)[keyof typeof HISTORY_OUTCOME_FILTER];

export const HISTORY_RANGE = {
  day: 'day',
  week: 'week',
  month: 'month',
} as const;

export type HistoryRange = (typeof HISTORY_RANGE)[keyof typeof HISTORY_RANGE];

export type HistoryEntry =
  | {
      readonly key: string;
      readonly kind: 'decision';
      readonly outcome: 'completed' | 'cancelled';
      readonly occurredAt: Date;
      readonly decision: Decision;
    }
  | {
      readonly key: string;
      readonly kind: 'action';
      readonly outcome: 'completed' | 'cancelled';
      readonly occurredAt: Date;
      readonly lifeAction: LifeAction;
    }
  | {
      readonly key: string;
      readonly kind: 'session';
      readonly outcome: 'completed' | 'interrupted';
      readonly occurredAt: Date;
      readonly session: ActionSession;
      readonly lifeAction: LifeAction;
    };

export interface HistorySummary {
  readonly confirmedDecisions: number;
  readonly completedActions: number;
  readonly sessions: number;
  readonly cancelled: number;
  readonly workedDurationMs: number;
}

export function createHistoryEntries(data: HistoryDateRangeResult): readonly HistoryEntry[] {
  const entries: HistoryEntry[] = [];

  for (const decision of data.decisions) {
    const occurredAt = decision.confirmedAt ?? decision.cancelledAt;
    if (occurredAt === null) {
      continue;
    }

    entries.push({
      key: `decision-${decision.id.toString()}`,
      kind: 'decision',
      outcome: decision.status === DECISION_STATUS.cancelled ? 'cancelled' : 'completed',
      occurredAt,
      decision,
    });
  }

  for (const lifeAction of data.lifeActions) {
    const occurredAt = lifeAction.completedAt ?? lifeAction.cancelledAt;
    if (occurredAt === null) {
      continue;
    }

    entries.push({
      key: `action-${lifeAction.id.toString()}`,
      kind: 'action',
      outcome: lifeAction.status === LIFE_ACTION_STATUS.cancelled ? 'cancelled' : 'completed',
      occurredAt,
      lifeAction,
    });
  }

  for (const item of data.actionSessions) {
    if (item.session.completedAt === null || item.session.completionKind === null) {
      continue;
    }

    entries.push({
      key: `session-${item.session.id.toString()}`,
      kind: 'session',
      outcome:
        item.session.completionKind === SESSION_COMPLETION_KIND.interrupted
          ? 'interrupted'
          : 'completed',
      occurredAt: item.session.completedAt,
      session: item.session,
      lifeAction: item.lifeAction,
    });
  }

  return entries.sort((left, right) => {
    const timeDifference = right.occurredAt.getTime() - left.occurredAt.getTime();
    return timeDifference !== 0 ? timeDifference : left.key.localeCompare(right.key);
  });
}

export function filterHistoryEntries(
  entries: readonly HistoryEntry[],
  entityFilter: HistoryEntityFilter,
  outcomeFilter: HistoryOutcomeFilter,
): readonly HistoryEntry[] {
  return entries.filter((entry) => {
    const entityMatches =
      entityFilter === HISTORY_ENTITY_FILTER.all ||
      (entityFilter === HISTORY_ENTITY_FILTER.decisions && entry.kind === 'decision') ||
      (entityFilter === HISTORY_ENTITY_FILTER.actions && entry.kind === 'action') ||
      (entityFilter === HISTORY_ENTITY_FILTER.sessions && entry.kind === 'session');
    const outcomeMatches =
      outcomeFilter === HISTORY_OUTCOME_FILTER.all || entry.outcome === outcomeFilter;

    return entityMatches && outcomeMatches;
  });
}

export function summarizeHistory(entries: readonly HistoryEntry[]): HistorySummary {
  return entries.reduce<HistorySummary>(
    (summary, entry) => ({
      confirmedDecisions:
        summary.confirmedDecisions +
        (entry.kind === 'decision' && entry.outcome === 'completed' ? 1 : 0),
      completedActions:
        summary.completedActions +
        (entry.kind === 'action' && entry.outcome === 'completed' ? 1 : 0),
      sessions: summary.sessions + (entry.kind === 'session' ? 1 : 0),
      cancelled:
        summary.cancelled +
        (entry.outcome === 'cancelled' || entry.outcome === 'interrupted' ? 1 : 0),
      workedDurationMs:
        summary.workedDurationMs +
        (entry.kind === 'session'
          ? entry.session.workedDurationAt(entry.session.completedAt ?? entry.occurredAt)
          : 0),
    }),
    {
      confirmedDecisions: 0,
      completedActions: 0,
      sessions: 0,
      cancelled: 0,
      workedDurationMs: 0,
    },
  );
}

export function formatHistoryDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} мин`;
  }

  if (minutes === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${minutes} мин`;
}
