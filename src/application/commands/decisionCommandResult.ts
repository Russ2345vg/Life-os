import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Failure } from '../../shared/result/Result';

export function domainFailure(error: unknown): Failure<DomainError> {
  if (error instanceof DomainError) {
    return failure(error);
  }

  throw error;
}

export function decisionNotFound(): Failure<DomainError> {
  return failure(new DomainError('decision.not_found', 'Решение не найдено.'));
}
