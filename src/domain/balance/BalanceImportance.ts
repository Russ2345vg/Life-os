import { DomainError } from '../../shared/errors/DomainError';

export const IMPORTANCE_WEIGHT = { low: 1, normal: 2, high: 3, critical: 4 } as const;
export type BalanceImportance = keyof typeof IMPORTANCE_WEIGHT;
export type DirectionMode = 'develop' | 'maintain';
export interface BalanceSettings {
  readonly importance?: BalanceImportance;
  readonly manualScore?: number | null;
}
export interface SphereBalanceSettings extends BalanceSettings {
  readonly desiredLevel?: number | null;
  readonly includeInBalanceWheel?: boolean;
}
export interface DirectionBalanceSettings extends BalanceSettings {
  readonly currentStateText?: string | null;
  readonly mode?: DirectionMode;
}
export function balanceImportance(value: unknown = 'normal'): BalanceImportance {
  if (typeof value !== 'string' || !Object.hasOwn(IMPORTANCE_WEIGHT, value))
    throw new DomainError('balance.invalid_importance', 'Выберите важность.');
  return value as BalanceImportance;
}
export function balanceScore(value: unknown = null): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10)
    throw new DomainError('balance.invalid_score', 'Оценка должна быть от 0 до 10.');
  return value;
}
export function directionMode(value: unknown = 'develop'): DirectionMode {
  if (value !== 'develop' && value !== 'maintain')
    throw new DomainError('direction.invalid_mode', 'Выберите режим направления.');
  return value;
}
