import { DomainError } from '../../shared/errors/DomainError';

export const MAX_ENTITY_NEED_LENGTH = 500;

export function normalizeEntityNeed(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new DomainError('need.invalid_text', 'Потребность должна быть текстом.');
  }
  const text = value.trim();
  if (text.length > MAX_ENTITY_NEED_LENGTH) {
    throw new DomainError('need.too_long', 'Потребность не должна превышать 500 символов.');
  }
  return text || null;
}
