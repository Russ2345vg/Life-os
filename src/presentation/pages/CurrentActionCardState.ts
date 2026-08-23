import {
  ACTION_SESSION_STATUS,
  LIFE_ACTION_STATUS,
  type ActionSession,
  type Decision,
  type LifeAction,
} from '../../domain';

export const CURRENT_ACTION_COMMAND = {
  startSession: 'start_session',
  completeSession: 'complete_session',
  resumeSession: 'resume_session',
} as const;

export type CurrentActionCommand =
  (typeof CURRENT_ACTION_COMMAND)[keyof typeof CURRENT_ACTION_COMMAND];

export interface CurrentActionCardState {
  readonly lifeAction: LifeAction;
  readonly decisionTitle: string | null;
  readonly statusLabel: string;
  readonly primaryCommand: CurrentActionCommand;
  readonly primaryLabel: string;
  readonly unfinishedSession: ActionSession | null;
  readonly sessions: readonly ActionSession[];
  readonly canManageAction: boolean;
}

export interface ResolveCurrentActionCardStateInput {
  readonly lifeAction: LifeAction;
  readonly decisions: readonly Decision[];
  readonly sessions: readonly ActionSession[];
  readonly unfinishedSession: ActionSession | null;
}

export function resolveCurrentActionCardState(
  input: ResolveCurrentActionCardStateInput,
): CurrentActionCardState {
  const sessions = input.sessions.filter((session) =>
    session.lifeActionId.equals(input.lifeAction.id),
  );
  const unfinishedSession =
    input.unfinishedSession !== null &&
    input.unfinishedSession.lifeActionId.equals(input.lifeAction.id)
      ? input.unfinishedSession
      : null;
  const decisionId = input.lifeAction.decisionId;
  const decision =
    decisionId === null
      ? null
      : (input.decisions.find((candidate) => candidate.id.equals(decisionId)) ?? null);

  if (unfinishedSession?.status === ACTION_SESSION_STATUS.running) {
    return {
      lifeAction: input.lifeAction,
      decisionTitle: decision?.title.toString() ?? null,
      statusLabel: 'Сессия идёт',
      primaryCommand: CURRENT_ACTION_COMMAND.completeSession,
      primaryLabel: 'Завершить',
      unfinishedSession,
      sessions,
      canManageAction: false,
    };
  }

  if (unfinishedSession?.status === ACTION_SESSION_STATUS.paused) {
    return {
      lifeAction: input.lifeAction,
      decisionTitle: decision?.title.toString() ?? null,
      statusLabel: 'Сессия на паузе',
      primaryCommand: CURRENT_ACTION_COMMAND.resumeSession,
      primaryLabel: 'Продолжить',
      unfinishedSession,
      sessions,
      canManageAction: false,
    };
  }

  return {
    lifeAction: input.lifeAction,
    decisionTitle: decision?.title.toString() ?? null,
    statusLabel: input.lifeAction.status === LIFE_ACTION_STATUS.inProgress ? 'В работе' : 'Готово',
    primaryCommand: CURRENT_ACTION_COMMAND.startSession,
    primaryLabel: 'Начать',
    unfinishedSession: null,
    sessions,
    canManageAction: true,
  };
}

export function totalWorkedDurationAt(sessions: readonly ActionSession[], now: Date): number {
  return sessions.reduce((total, session) => total + session.workedDurationAt(now), 0);
}
