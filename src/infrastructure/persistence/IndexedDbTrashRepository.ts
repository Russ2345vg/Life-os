import type { TrashRepository } from '../../application/trash/TrashRepository';
import type { EntityId, Goal, LifeAction } from '../../domain';
import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import { RecurrenceRuleRecordMapper } from './PlanningRecordMappers';
import type { LifeActionRecord } from './records/LifeActionRecord';

/** Reads the authoritative stores without the active repositories' visibility filter. */
export class IndexedDbTrashRepository implements TrashRepository {
  public constructor(private readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findGoalIncludingDeleted(id: EntityId): Promise<Goal | null> {
    const record = await this.find(LIFE_OS_STORE.goals, id.toString());
    return record === undefined ? null : GoalRecordMapper.fromRecord(record);
  }

  public async findActionIncludingDeleted(id: EntityId): Promise<LifeAction | null> {
    const record = await this.find(LIFE_OS_STORE.lifeActions, id.toString());
    return record === undefined
      ? null
      : LifeActionRecordMapper.fromRecord(record as LifeActionRecord);
  }

  public async findSeriesIncludingRemoved(id: string): Promise<RecurrenceRule | null> {
    const record = await this.find(LIFE_OS_STORE.recurrenceRules, id);
    return record === undefined ? null : RecurrenceRuleRecordMapper.fromRecord(record);
  }

  public async listDeletedGoals(): Promise<readonly Goal[]> {
    return (await this.list(LIFE_OS_STORE.goals))
      .map((record) => GoalRecordMapper.fromRecord(record))
      .filter((goal) => goal.isDeleted());
  }

  public async listDeletedActions(): Promise<readonly LifeAction[]> {
    return (await this.list(LIFE_OS_STORE.lifeActions))
      .map((record) => LifeActionRecordMapper.fromRecord(record as LifeActionRecord))
      .filter((action) => action.isDeleted());
  }

  public async listRemovedSeries(): Promise<readonly RecurrenceRule[]> {
    return (await this.list(LIFE_OS_STORE.recurrenceRules))
      .map((record) => RecurrenceRuleRecordMapper.fromRecord(record))
      .filter((rule) => rule.removedAt != null && rule.purgedAt == null);
  }

  private async find(store: string, id: string): Promise<unknown> {
    return executeIndexedDbRequest(await this.indexedDb.open(), store, 'readonly', (source) =>
      source.get(id),
    );
  }

  private async list(store: string): Promise<unknown[]> {
    return executeIndexedDbRequest(await this.indexedDb.open(), store, 'readonly', (source) =>
      source.getAll(),
    );
  }
}
