import type { MonthlyDirectionFocus } from '../../domain/planner/MonthlyDirectionFocus';

export interface MonthlyDirectionFocusRepository {
  findByMonth(month: string): Promise<MonthlyDirectionFocus | null>;
  findLatestBefore(month: string): Promise<MonthlyDirectionFocus | null>;
  change(
    month: string,
    change: (current: MonthlyDirectionFocus | null) => MonthlyDirectionFocus,
  ): Promise<MonthlyDirectionFocus>;
}
