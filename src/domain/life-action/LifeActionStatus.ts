export const LIFE_ACTION_STATUS = {
  draft: 'draft',
  ready: 'ready',
  inProgress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
} as const;

export type LifeActionStatus = (typeof LIFE_ACTION_STATUS)[keyof typeof LIFE_ACTION_STATUS];
