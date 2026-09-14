import { DomainError } from '../../shared/errors/DomainError';
import { balanceImportance, balanceScore, type BalanceImportance } from './BalanceImportance';

export type NumericTarget =
  | { readonly kind: 'atLeast'; readonly value: number }
  | { readonly kind: 'atMost'; readonly value: number }
  | { readonly kind: 'range'; readonly min: number; readonly max: number };
export type IndicatorMeasure =
  | { readonly type: 'rating'; readonly value: number | null; readonly target: null }
  | { readonly type: 'boolean'; readonly value: boolean | null; readonly target: null }
  | { readonly type: 'numeric'; readonly value: number | null; readonly target: NumericTarget };
export type DirectionIndicator = IndicatorMeasure & {
  readonly id: string;
  readonly directionId: string;
  readonly name: string;
  readonly importance: BalanceImportance;
  readonly sourceType: 'manual' | 'quantitativeGoal';
  readonly sourceGoalId: string | null;
  readonly removed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly schemaVersion: 1;
};
export const MAX_DIRECTION_INDICATORS = 5;
export function indicatorId(directionId: string, slot: number): string {
  if (!directionId || !Number.isInteger(slot) || slot < 0 || slot >= MAX_DIRECTION_INDICATORS)
    throw invalid();
  return `indicator:${encodeURIComponent(directionId)}:${slot}`;
}
export function validateIndicator(input: DirectionIndicator): DirectionIndicator {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.directionId !== 'string' ||
    !input.directionId ||
    !Array.from({ length: MAX_DIRECTION_INDICATORS }, (_, n) =>
      indicatorId(input.directionId, n),
    ).includes(input.id) ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.trim().length > 160 ||
    typeof input.removed !== 'boolean'
  )
    throw invalid();
  validateBalanceRecord(input);
  if (balanceImportance(input.importance) !== input.importance) throw invalid();
  if (input.sourceType !== 'manual' && input.sourceType !== 'quantitativeGoal') throw invalid();
  if (input.sourceType === 'quantitativeGoal') {
    if (typeof input.sourceGoalId !== 'string' || !input.sourceGoalId) throw invalid();
  } else if (input.sourceGoalId !== null) throw invalid();
  if (input.type === 'rating') {
    if (input.value === undefined) throw invalid();
    balanceScore(input.value);
    if (input.target !== null) throw invalid();
  } else if (input.type === 'boolean') {
    if ((input.value !== null && typeof input.value !== 'boolean') || input.target !== null)
      throw invalid();
  } else if (input.type === 'numeric') {
    if (input.value !== null && !finite(input.value)) throw invalid();
    const t = input.target;
    if (!t || typeof t !== 'object') throw invalid();
    if (t.kind === 'range') {
      if (!finite(t.min) || !finite(t.max) || t.min < 0 || t.max < t.min) throw invalid();
    } else if (t.kind === 'atLeast' || t.kind === 'atMost') {
      if (!finite(t.value) || t.value < 0 || (t.kind === 'atLeast' && t.value === 0))
        throw invalid();
    } else throw invalid();
  } else throw invalid();
  return { ...input, name: input.name.trim() };
}
export function validateBalanceRecord(value: {
  schemaVersion: number;
  version: number;
  updatedAt: string;
  createdAt: string;
}): void {
  if (
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  )
    throw invalid();
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function invalid() {
  return new DomainError(
    'balance.invalid_indicator',
    'Проверьте название, значение и условие показателя.',
  );
}
