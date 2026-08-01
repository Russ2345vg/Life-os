export const DAY_STATUS = {
  planned: 'planned',
  open: 'open',
  completed: 'completed',
} as const;

export type DayStatus = (typeof DAY_STATUS)[keyof typeof DAY_STATUS];
