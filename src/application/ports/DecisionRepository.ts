import type { DayDate, Decision, EntityId } from '../../domain';

export interface DecisionRepository {
  findById(id: EntityId): Promise<Decision | null>;
  findByDate(date: DayDate): Promise<readonly Decision[]>;
  save(decision: Decision): Promise<void>;
}
