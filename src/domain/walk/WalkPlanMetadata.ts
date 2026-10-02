import { DomainError } from '../../shared/errors/DomainError';
export interface WalkPlanMetadata {
  readonly kind: 'walk';
  readonly targetMinutes: number | null;
}
export function validateWalkPlan(
  value: WalkPlanMetadata | null | undefined,
): WalkPlanMetadata | null {
  if (value == null) return null;
  if (
    value.kind !== 'walk' ||
    (value.targetMinutes !== null &&
      (!Number.isInteger(value.targetMinutes) ||
        value.targetMinutes < 1 ||
        value.targetMinutes > 1440))
  )
    throw new DomainError(
      'walk.invalid_plan',
      'Длительность прогулки должна быть от 1 до 1440 минут.',
    );
  return Object.freeze({ kind: 'walk', targetMinutes: value.targetMinutes });
}
