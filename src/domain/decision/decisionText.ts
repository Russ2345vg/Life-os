import { DomainError } from '../../shared/errors/DomainError';

export function normalizeDecisionText(
  value: string,
  fieldName: string,
  maximumLength: number,
  errorCode: string,
): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new DomainError(errorCode, `${fieldName} не может быть пустым.`);
  }

  if (normalizedValue.length > maximumLength) {
    throw new DomainError(
      errorCode,
      `${fieldName} не может быть длиннее ${maximumLength} символов.`,
    );
  }

  return normalizedValue;
}
