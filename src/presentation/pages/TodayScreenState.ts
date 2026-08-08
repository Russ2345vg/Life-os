import {
  ACTION_SESSION_STATUS,
  DAY_STATUS,
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  type ActionSession,
  type Day,
  type Decision,
  type LifeAction,
} from '../../domain';

export const TODAY_SCREEN_STATE = {
  loading: 'loading',
  dayNotPlanned: 'day_not_planned',
  dayPlanned: 'day_planned',
  dayStarted: 'day_started',
  activeSession: 'active_session',
  pausedSession: 'paused_session',
  noCurrentAction: 'no_current_action',
  eveningControl: 'evening_control',
  dayCompleted: 'day_completed',
  recoveryError: 'recovery_error',
} as const;

export type TodayScreenStateKind = (typeof TODAY_SCREEN_STATE)[keyof typeof TODAY_SCREEN_STATE];

export type TodayRecoveryStatus = 'loading' | 'ready' | 'error';
export type TodayDecisionsStatus = 'loading' | 'ready' | 'error';

interface TodayScreenStateBase {
  readonly kind: TodayScreenStateKind;
  readonly day: Day;
}

interface TodayOpenActionState {
  readonly currentLifeAction: LifeAction;
  readonly nextLifeAction: LifeAction | null;
  readonly availableLifeActions: readonly LifeAction[];
  readonly currentLifeActionIndex: number;
}

export type TodayScreenState =
  | (TodayScreenStateBase & {
      readonly kind: typeof TODAY_SCREEN_STATE.loading;
    })
  | (TodayScreenStateBase & {
      readonly kind: typeof TODAY_SCREEN_STATE.dayNotPlanned;
      readonly mainDecisionCount: 0;
    })
  | (TodayScreenStateBase & {
      readonly kind: typeof TODAY_SCREEN_STATE.dayPlanned;
      readonly mainDecisionCount: number;
    })
  | (TodayScreenStateBase &
      TodayOpenActionState & {
        readonly kind: typeof TODAY_SCREEN_STATE.dayStarted;
      })
  | (TodayScreenStateBase &
      TodayOpenActionState & {
        readonly kind: typeof TODAY_SCREEN_STATE.activeSession;
        readonly session: ActionSession;
      })
  | (TodayScreenStateBase &
      TodayOpenActionState & {
        readonly kind: typeof TODAY_SCREEN_STATE.pausedSession;
        readonly session: ActionSession;
      })
  | (TodayScreenStateBase & {
      readonly kind: typeof TODAY_SCREEN_STATE.noCurrentAction;
    })
  | (TodayScreenStateBase & {
      readonly kind: typeof TODAY_SCREEN_STATE.eveningControl;
    })
  | (TodayScreenStateBase & {
      readonly kind: typeof TODAY_SCREEN_STATE.dayCompleted;
    })
  | (TodayScreenStateBase & {
      readonly kind: typeof TODAY_SCREEN_STATE.recoveryError;
      readonly message: string;
    });

export interface ResolveTodayScreenStateInput {
  readonly day: Day;
  readonly decisionsStatus: TodayDecisionsStatus;
  readonly decisions: readonly Decision[];
  readonly recoveryStatus: TodayRecoveryStatus;
  readonly lifeActions: readonly LifeAction[];
  readonly unfinishedSession: ActionSession | null;
  readonly isEveningControlOpen: boolean;
  readonly preferredLifeActionId?: string | null;
}

export function resolveTodayScreenState(input: ResolveTodayScreenStateInput): TodayScreenState {
  if (input.day.status === DAY_STATUS.completed) {
    return { kind: TODAY_SCREEN_STATE.dayCompleted, day: input.day };
  }

  if (input.isEveningControlOpen && input.day.status === DAY_STATUS.open) {
    return { kind: TODAY_SCREEN_STATE.eveningControl, day: input.day };
  }

  if (input.recoveryStatus === 'error' || input.decisionsStatus === 'error') {
    return {
      kind: TODAY_SCREEN_STATE.recoveryError,
      day: input.day,
      message: 'Не удалось восстановить решения, действия или рабочую сессию текущего дня.',
    };
  }

  if (input.recoveryStatus === 'loading' || input.decisionsStatus === 'loading') {
    return { kind: TODAY_SCREEN_STATE.loading, day: input.day };
  }

  if (input.unfinishedSession !== null && input.day.status !== DAY_STATUS.open) {
    return {
      kind: TODAY_SCREEN_STATE.recoveryError,
      day: input.day,
      message: 'Незавершённая рабочая сессия не связана с начатым днём.',
    };
  }

  const mainDecisionCount = countActiveMainDecisions(input.decisions);

  if (input.day.status === DAY_STATUS.planned) {
    if (mainDecisionCount === 0) {
      return {
        kind: TODAY_SCREEN_STATE.dayNotPlanned,
        day: input.day,
        mainDecisionCount: 0,
      };
    }

    return {
      kind: TODAY_SCREEN_STATE.dayPlanned,
      day: input.day,
      mainDecisionCount,
    };
  }

  const availableLifeActions = selectAvailableLifeActions(input.lifeActions, input.day);

  if (input.unfinishedSession !== null) {
    const sessionLifeAction = availableLifeActions.find((lifeAction) =>
      lifeAction.id.equals(input.unfinishedSession!.lifeActionId),
    );

    if (sessionLifeAction === undefined) {
      return {
        kind: TODAY_SCREEN_STATE.recoveryError,
        day: input.day,
        message: 'Рабочая сессия восстановлена, но связанное действие не найдено.',
      };
    }

    if (sessionLifeAction.status !== LIFE_ACTION_STATUS.inProgress) {
      return {
        kind: TODAY_SCREEN_STATE.recoveryError,
        day: input.day,
        message: 'Незавершённая сессия связана с действием в недопустимом состоянии.',
      };
    }

    const navigation = createActionNavigation(availableLifeActions, sessionLifeAction);

    if (input.unfinishedSession.status === ACTION_SESSION_STATUS.running) {
      return {
        kind: TODAY_SCREEN_STATE.activeSession,
        day: input.day,
        ...navigation,
        session: input.unfinishedSession,
      };
    }

    if (input.unfinishedSession.status === ACTION_SESSION_STATUS.paused) {
      return {
        kind: TODAY_SCREEN_STATE.pausedSession,
        day: input.day,
        ...navigation,
        session: input.unfinishedSession,
      };
    }

    return {
      kind: TODAY_SCREEN_STATE.recoveryError,
      day: input.day,
      message: 'Хранилище вернуло завершённую сессию как незавершённую.',
    };
  }

  const currentLifeAction = selectCurrentLifeAction(
    availableLifeActions,
    input.preferredLifeActionId ?? null,
  );

  if (currentLifeAction === null) {
    return { kind: TODAY_SCREEN_STATE.noCurrentAction, day: input.day };
  }

  return {
    kind: TODAY_SCREEN_STATE.dayStarted,
    day: input.day,
    ...createActionNavigation(availableLifeActions, currentLifeAction),
  };
}

export function selectCurrentLifeAction(
  availableLifeActions: readonly LifeAction[],
  preferredLifeActionId: string | null = null,
): LifeAction | null {
  if (preferredLifeActionId !== null) {
    const preferred = availableLifeActions.find(
      (lifeAction) => lifeAction.id.toString() === preferredLifeActionId,
    );
    if (preferred !== undefined) {
      return preferred;
    }
  }

  return availableLifeActions[0] ?? null;
}

export function selectAvailableLifeActions(
  lifeActions: readonly LifeAction[],
  day: Day,
): readonly LifeAction[] {
  return [...lifeActions]
    .filter(
      (lifeAction) =>
        lifeAction.isScheduledFor(day.date) &&
        (lifeAction.status === LIFE_ACTION_STATUS.inProgress ||
          lifeAction.status === LIFE_ACTION_STATUS.ready),
    )
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === LIFE_ACTION_STATUS.inProgress ? -1 : 1;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });
}

function createActionNavigation(
  availableLifeActions: readonly LifeAction[],
  currentLifeAction: LifeAction,
): TodayOpenActionState {
  const currentLifeActionIndex = availableLifeActions.findIndex((lifeAction) =>
    lifeAction.id.equals(currentLifeAction.id),
  );
  const nextLifeAction = availableLifeActions[currentLifeActionIndex + 1] ?? null;

  return {
    currentLifeAction,
    nextLifeAction,
    availableLifeActions,
    currentLifeActionIndex,
  };
}

function countActiveMainDecisions(decisions: readonly Decision[]): number {
  return decisions.filter(
    (decision) =>
      decision.kind === DECISION_KIND.main &&
      (decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress),
  ).length;
}
