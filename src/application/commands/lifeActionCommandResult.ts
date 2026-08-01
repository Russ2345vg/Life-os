import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Failure } from '../../shared/result/Result';

export function lifeActionDomainFailure(error: unknown): Failure<DomainError> {
  if (error instanceof DomainError) {
    return failure(error);
  }

  throw error;
}

export function lifeActionNotFound(): Failure<DomainError> {
  return failure(new DomainError('action.not_found', 'Действие не найдено.'));
}

export function decisionNotFoundForLifeAction(): Failure<DomainError> {
  return failure(new DomainError('decision.not_found', 'Решение не найдено.'));
}

export function decisionUnavailableForLifeAction(): Failure<DomainError> {
  return failure(
    new DomainError(
      'action.decision_unavailable',
      'Новое действие нельзя связать с этим решением.',
    ),
  );
}
