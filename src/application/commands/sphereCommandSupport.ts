import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Failure } from '../../shared/result/Result';

export function sphereFailure(error: unknown): Failure<DomainError> {
  if (error instanceof DomainError) return failure(error);
  throw error;
}

export function sphereNotFound(): Failure<DomainError> {
  return failure(new DomainError('sphere.not_found', 'Сфера не найдена.'));
}

export function sphereNameConflict(): Failure<DomainError> {
  return failure(
    new DomainError('sphere.name_conflict', 'Сфера с таким названием уже существует.'),
  );
}

export function sphereVersionConflict(): Failure<DomainError> {
  return failure(
    new DomainError(
      'sphere.version_conflict',
      'Сфера изменилась в другой вкладке. Обновите данные и повторите действие.',
    ),
  );
}

export function validSphereExpectedVersion(version: number): boolean {
  return Number.isInteger(version) && version >= 1;
}
