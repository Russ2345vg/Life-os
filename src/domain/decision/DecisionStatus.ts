export const DECISION_STATUS = {
  draft: 'draft',
  planned: 'planned',
  inProgress: 'in_progress',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
} as const;

export type DecisionStatus = (typeof DECISION_STATUS)[keyof typeof DECISION_STATUS];
