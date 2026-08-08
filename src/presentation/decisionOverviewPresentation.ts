import {
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  type ActionSession,
  type Decision,
  type LifeAction,
} from '../domain';
import type { DecisionOverviewSnapshot } from '../application';

export interface DecisionLifecycleEntry {
  readonly key: string;
  readonly label: string;
  readonly occurredAt: Date;
  readonly detail: string | null;
}

export interface DecisionActionPresentation {
  readonly lifeAction: LifeAction;
  readonly sessions: readonly ActionSession[];
  readonly sessionCount: number;
  readonly completedSessionCount: number;
  readonly workedDurationMs: number;
}

export interface DecisionOverviewPresentation {
  readonly decision: Decision;
  readonly actions: readonly DecisionActionPresentation[];
  readonly actionCount: number;
  readonly completedActionCount: number;
  readonly unfinishedActionCount: number;
  readonly cancelledActionCount: number;
  readonly sessionCount: number;
  readonly completedSessionCount: number;
  readonly workedDurationMs: number;
  readonly lifecycle: readonly DecisionLifecycleEntry[];
}

export function createDecisionOverviewPresentation(
  snapshot: DecisionOverviewSnapshot,
  now: Date,
): DecisionOverviewPresentation {
  const actions = snapshot.actions.map(({ lifeAction, sessions }) => ({
    lifeAction,
    sessions,
    sessionCount: sessions.length,
    completedSessionCount: sessions.filter((session) => session.isCompleted()).length,
    workedDurationMs: sessions.reduce((total, session) => total + session.workedDurationAt(now), 0),
  }));

  return {
    decision: snapshot.decision,
    actions,
    actionCount: actions.length,
    completedActionCount: actions.filter(
      ({ lifeAction }) => lifeAction.status === LIFE_ACTION_STATUS.completed,
    ).length,
    unfinishedActionCount: actions.filter(
      ({ lifeAction }) =>
        lifeAction.status === LIFE_ACTION_STATUS.draft ||
        lifeAction.status === LIFE_ACTION_STATUS.ready ||
        lifeAction.status === LIFE_ACTION_STATUS.inProgress,
    ).length,
    cancelledActionCount: actions.filter(
      ({ lifeAction }) => lifeAction.status === LIFE_ACTION_STATUS.cancelled,
    ).length,
    sessionCount: actions.reduce((total, action) => total + action.sessionCount, 0),
    completedSessionCount: actions.reduce(
      (total, action) => total + action.completedSessionCount,
      0,
    ),
    workedDurationMs: actions.reduce((total, action) => total + action.workedDurationMs, 0),
    lifecycle: createDecisionLifecycle(snapshot.decision),
  };
}

export function createDecisionLifecycle(decision: Decision): readonly DecisionLifecycleEntry[] {
  const entries: DecisionLifecycleEntry[] = [
    {
      key: 'created',
      label: 'Решение создано',
      occurredAt: decision.createdAt,
      detail: null,
    },
  ];

  if (decision.plannedAt !== null) {
    entries.push({
      key: 'planned',
      label: 'Решение запланировано',
      occurredAt: decision.plannedAt,
      detail: decision.plannedDate?.toString() ?? null,
    });
  }

  if (decision.startedAt !== null) {
    entries.push({
      key: 'started',
      label: 'Выполнение решения начато',
      occurredAt: decision.startedAt,
      detail: null,
    });
  }

  if (decision.confirmedAt !== null) {
    entries.push({
      key: 'confirmed',
      label: 'Результат решения подтверждён',
      occurredAt: decision.confirmedAt,
      detail: decision.actualResultSummary?.toString() ?? null,
    });
  }

  if (decision.cancelledAt !== null) {
    entries.push({
      key: 'cancelled',
      label: 'Решение отменено',
      occurredAt: decision.cancelledAt,
      detail: decision.cancelReason?.toString() ?? null,
    });
  }

  if (decision.archivedAt !== null) {
    entries.push({
      key: 'archived',
      label: 'Решение помещено в архив',
      occurredAt: decision.archivedAt,
      detail: null,
    });
  }

  if (decision.lastDeletedAt !== null) {
    entries.push({
      key: 'deleted',
      label: 'Решение перемещено в корзину',
      occurredAt: decision.lastDeletedAt,
      detail: null,
    });
  }

  if (decision.restoredFromTrashAt !== null) {
    entries.push({
      key: 'restored-from-trash',
      label: 'Решение восстановлено из корзины',
      occurredAt: decision.restoredFromTrashAt,
      detail: null,
    });
  }

  return entries.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
}

export function decisionOutcomeLabel(decision: Decision): string {
  if (decision.status === DECISION_STATUS.confirmed) {
    return decision.actualResultSummary?.toString() ?? 'Результат подтверждён';
  }

  if (decision.status === DECISION_STATUS.cancelled) {
    return decision.cancelReason?.toString() ?? 'Решение отменено без указанной причины';
  }

  return 'Итог решения ещё не зафиксирован';
}
