import type { PreparationRuleRepository } from '../../application';
import type { PreparationRule } from '../../domain';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { PreparationRuleRecordMapper } from './mappers/PreparationRuleRecordMapper';
import type { PreparationRuleRecord } from './records/PreparationRuleRecord';

export class IndexedDbPreparationRuleRepository implements PreparationRuleRepository {
  public constructor(private readonly database: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findActive(): Promise<readonly PreparationRule[]> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.preparationRules, 'readonly');
    const request = transaction.objectStore(LIFE_OS_STORE.preparationRules).getAll();
    return (await observeRequest<PreparationRuleRecord[]>(request))
      .map((record) => PreparationRuleRecordMapper.fromRecord(record))
      .filter((rule) => rule.active);
  }

  public async save(rule: PreparationRule): Promise<void> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.preparationRules, 'readwrite');
    await observeRequest(
      transaction
        .objectStore(LIFE_OS_STORE.preparationRules)
        .put(PreparationRuleRecordMapper.toRecord(rule)),
    );
  }
}

function observeRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}
