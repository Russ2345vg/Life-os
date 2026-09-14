import { DomainError } from '../../shared/errors/DomainError';
import { balanceScore } from './BalanceImportance';
import { validateBalanceRecord } from './DirectionIndicator';
export interface BalanceMonthlySnapshot {
  readonly id: string;
  readonly entityType: 'sphere' | 'direction';
  readonly entityId: string;
  readonly month: string;
  readonly automaticScore: number | null;
  readonly manualScore: number | null;
  readonly effectiveScore: number | null;
  readonly desiredLevel: number | null;
  readonly attentionNeed: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly schemaVersion: 1;
}
export function balanceSnapshotId(type: 'sphere' | 'direction', id: string, month: string): string {
  if (!id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw invalid();
  return `monthly:${type}:${encodeURIComponent(id)}:${month}`;
}
export function validateBalanceSnapshot(value: BalanceMonthlySnapshot): BalanceMonthlySnapshot {
  if (
    !value ||
    !['sphere', 'direction'].includes(value.entityType) ||
    typeof value.entityId !== 'string' ||
    value.id !== balanceSnapshotId(value.entityType, value.entityId, value.month)
  )
    throw invalid();
  validateBalanceRecord(value);
  for (const score of [
    value.automaticScore,
    value.manualScore,
    value.effectiveScore,
    value.desiredLevel,
  ]) {
    if (score === undefined) throw invalid();
    balanceScore(score);
  }
  if (
    value.attentionNeed !== null &&
    (!Number.isFinite(value.attentionNeed) || value.attentionNeed < 0)
  )
    throw invalid();
  if (value.effectiveScore !== (value.manualScore ?? value.automaticScore)) throw invalid();
  return { ...value };
}
function invalid() {
  return new DomainError(
    'balance.invalid_snapshot',
    'Снимок состояния содержит некорректные данные.',
  );
}
