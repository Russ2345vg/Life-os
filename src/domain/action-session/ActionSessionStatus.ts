export const ACTION_SESSION_STATUS = {
  running: 'running',
  paused: 'paused',
  completed: 'completed',
} as const;

export type ActionSessionStatus =
  (typeof ACTION_SESSION_STATUS)[keyof typeof ACTION_SESSION_STATUS];
