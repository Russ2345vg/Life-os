import type { PreparationRule } from '../../domain';

export interface PreparationRuleRepository {
  findActive(): Promise<readonly PreparationRule[]>;
  save(rule: PreparationRule): Promise<void>;
}
