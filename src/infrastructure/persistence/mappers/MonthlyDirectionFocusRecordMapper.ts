import {
  validateMonthlyDirectionFocus,
  type MonthlyDirectionFocus,
} from '../../../domain/planner/MonthlyDirectionFocus';

export const MonthlyDirectionFocusRecordMapper = {
  fromRecord(value: unknown): MonthlyDirectionFocus {
    return validateMonthlyDirectionFocus(value as MonthlyDirectionFocus);
  },
  toRecord(value: MonthlyDirectionFocus): MonthlyDirectionFocus {
    return validateMonthlyDirectionFocus(value);
  },
};
