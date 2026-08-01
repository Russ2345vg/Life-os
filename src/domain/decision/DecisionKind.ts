export const DECISION_KIND = {
  main: 'main',
  additional: 'additional',
} as const;

export type DecisionKind = (typeof DECISION_KIND)[keyof typeof DECISION_KIND];
