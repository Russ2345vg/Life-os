import { DomainError } from '../../shared/errors/DomainError';

export const DECISION_PRIORITY = {
  low: 'low',
  normal: 'normal',
  high: 'high',
} as const;

export type DecisionPriority = (typeof DECISION_PRIORITY)[keyof typeof DECISION_PRIORITY];

export function assertDecisionPriority(value: DecisionPriority): void {
  if (!Object.values(DECISION_PRIORITY).includes(value)) {
    throw new DomainError('decision.invalid_priority', 'Указан неизвестный приоритет решения.');
  }
}
