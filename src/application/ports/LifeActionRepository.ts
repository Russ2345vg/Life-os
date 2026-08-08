import type { DayDate, EntityId, LifeAction } from '../../domain';

export interface LifeActionRepository {
  findById(id: EntityId): Promise<LifeAction | null>;
  findByDate(date: DayDate): Promise<readonly LifeAction[]>;
  findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]>;
  findAll?(): Promise<readonly LifeAction[]>;
  save(lifeAction: LifeAction): Promise<void>;
}
