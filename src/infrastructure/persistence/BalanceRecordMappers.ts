import {
  validateIndicator,
  type DirectionIndicator,
} from '../../domain/balance/DirectionIndicator';
import {
  validateBalanceSnapshot,
  type BalanceMonthlySnapshot,
} from '../../domain/balance/BalanceMonthlySnapshot';
export const DirectionIndicatorRecordMapper = {
  toRecord: (value: DirectionIndicator) => validateIndicator(value),
  fromRecord: (value: unknown) => validateIndicator(value as DirectionIndicator),
};
export const BalanceMonthlySnapshotRecordMapper = {
  toRecord: (value: BalanceMonthlySnapshot) => validateBalanceSnapshot(value),
  fromRecord: (value: unknown) => validateBalanceSnapshot(value as BalanceMonthlySnapshot),
};
