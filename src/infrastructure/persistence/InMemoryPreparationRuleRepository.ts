import type { PreparationRuleRepository } from '../../application';
import type { PreparationRule } from '../../domain';

export class InMemoryPreparationRuleRepository implements PreparationRuleRepository {
  readonly #rules = new Map<string, PreparationRule>();

  public async findActive(): Promise<readonly PreparationRule[]> {
    return [...this.#rules.values()].filter((rule) => rule.active);
  }
  public async save(rule: PreparationRule): Promise<void> {
    this.#rules.set(rule.id.toString(), rule);
  }
}
