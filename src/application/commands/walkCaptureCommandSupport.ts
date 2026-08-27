import { DomainError } from '../../shared/errors/DomainError';
import { failure } from '../../shared/result/Result';

export function captureNotFound() {
  return failure(new DomainError('walk_capture.not_found', 'Сохранённая мысль не найдена.'));
}

export function captureVersionConflict() {
  return failure(
    new DomainError(
      'walk_capture.version_conflict',
      'Мысль изменилась в другой вкладке. Откройте её заново перед сохранением.',
    ),
  );
}
