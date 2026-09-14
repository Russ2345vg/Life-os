import type { BalanceState } from '../../application/ports/BalanceRepository';
import { projectLifeBalance } from '../../application/balance/GetLifeBalance';
import {
  balanceSnapshotId,
  type BalanceMonthlySnapshot,
} from '../../domain/balance/BalanceMonthlySnapshot';
import { SphereRecordMapper } from './mappers/SphereRecordMapper';
import { DirectionRecordMapper } from './mappers/DirectionRecordMapper';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import {
  PlanningPeriodRecordMapper,
  PeriodMembershipRecordMapper,
  PeriodDecisionRecordMapper,
  ProgressContributionRecordMapper,
} from './PlanningRecordMappers';
import {
  BalanceMonthlySnapshotRecordMapper,
  DirectionIndicatorRecordMapper,
} from './BalanceRecordMappers';
import { LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';

const bindings = {
  spheres: [LIFE_OS_STORE.spheres, SphereRecordMapper],
  directions: [LIFE_OS_STORE.directions, DirectionRecordMapper],
  goals: [LIFE_OS_STORE.goals, GoalRecordMapper],
  actions: [LIFE_OS_STORE.lifeActions, LifeActionRecordMapper],
  contributions: [LIFE_OS_STORE.progressContributions, ProgressContributionRecordMapper],
  periods: [LIFE_OS_STORE.planningPeriods, PlanningPeriodRecordMapper],
  memberships: [LIFE_OS_STORE.periodMemberships, PeriodMembershipRecordMapper],
  decisions: [LIFE_OS_STORE.periodDecisions, PeriodDecisionRecordMapper],
  indicators: [LIFE_OS_STORE.directionIndicators, DirectionIndicatorRecordMapper],
  snapshots: [LIFE_OS_STORE.balanceMonthlySnapshots, BalanceMonthlySnapshotRecordMapper],
} as const;
export const BALANCE_TRANSACTION_STORES = Object.values(bindings).map(([store]) => store);
export function balanceRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}
export async function readBalanceTransaction(tx: IDBTransaction): Promise<BalanceState> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(bindings).map(async ([key, [store, mapper]]) => {
        const values = await balanceRequest<unknown[]>(tx.objectStore(store).getAll());
        const reader = mapper as { fromRecord(value: unknown): unknown };
        return [key, values.map((value) => reader.fromRecord(value))];
      }),
    ),
  ) as unknown as BalanceState;
}
export async function refreshBalanceTransaction(
  tx: IDBTransaction,
  today: string,
  now: Date,
): Promise<void> {
  const state = await readBalanceTransaction(tx),
    projection = projectLifeBalance(state, today),
    month = today.slice(0, 7);
  const candidates = [
    ...projection.directions.map((d) => ({
      entityType: 'direction' as const,
      entityId: d.direction.id.toString(),
      automaticScore: d.automaticScore,
      manualScore: d.manualScore,
      effectiveScore: d.effectiveScore,
      desiredLevel: null,
      attentionNeed: null,
    })),
    ...projection.spheres.map((s) => ({
      entityType: 'sphere' as const,
      entityId: s.sphere.id.toString(),
      automaticScore: s.automaticScore,
      manualScore: s.manualScore,
      effectiveScore: s.effectiveScore,
      desiredLevel: s.sphere.desiredLevel,
      attentionNeed: s.attentionNeed,
    })),
  ];
  const store = tx.objectStore(LIFE_OS_STORE.balanceMonthlySnapshots);
  for (const data of candidates) {
    if (
      state.snapshots.some(
        (s) => s.entityType === data.entityType && s.entityId === data.entityId && s.month > month,
      )
    )
      continue;
    const id = balanceSnapshotId(data.entityType, data.entityId, month);
    const old = state.snapshots.find((v) => v.id === id);
    if (
      old &&
      Object.entries(data).every(([key, value]) => old[key as keyof typeof data] === value)
    )
      continue;
    const snapshot: BalanceMonthlySnapshot = {
      ...data,
      id,
      month,
      schemaVersion: 1,
      version: (old?.version ?? 0) + 1,
      createdAt: old?.createdAt ?? now.toISOString(),
      updatedAt: new Date(
        Math.max(now.getTime(), old ? Date.parse(old.updatedAt) : 0),
      ).toISOString(),
    };
    await balanceRequest(store.put(BalanceMonthlySnapshotRecordMapper.toRecord(snapshot)));
  }
}
