import type { PilotDeleteRepository } from '../../../application/sync/pilot/PilotDeleteRepository';
import type { PilotEntityType } from '../../../application/sync/pilot/PilotSyncProtocol';
import { LIFE_OS_STORE, type LifeOsIndexedDb } from '../../persistence/indexed-db/LifeOsIndexedDb';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from './IndexedDbPilotMutationRecorder';
import { pilotRelationshipReferences, pilotStoreFor } from './PilotSyncRegistryAdapters';

export class IndexedDbPilotDeleteRepository implements PilotDeleteRepository {
  public constructor(
    private readonly database: LifeOsIndexedDb,
    private readonly recorder: IndexedDbPilotMutationRecorder,
  ) {}

  public async delete(entityType: PilotEntityType, objectId: string): Promise<boolean> {
    const database = await this.database.open();
    const stores = new Set<string>([pilotStoreFor(entityType), ...PILOT_MUTATION_STORES]);
    if (entityType === 'direction') {
      stores.add(LIFE_OS_STORE.goals);
    }
    const goalDependants = [
      'planning_period',
      'period_membership',
      'period_decision',
      'contribution_link',
      'progress_contribution',
      'recurrence_rule',
      'decision',
      'journal_entry',
      'walk',
      'preparation_plan',
      'evening_cycle',
    ] as const;
    if (entityType === 'goal') for (const type of goalDependants) stores.add(pilotStoreFor(type));
    const transaction = database.transaction([...stores], 'readwrite');
    const domainStore = transaction.objectStore(pilotStoreFor(entityType));
    const existing = await request(domainStore.getKey(objectId));
    if (existing === undefined) {
      transaction.abort();
      await afterAbort(transaction);
      return false;
    }
    if (entityType === 'direction' && (await hasDirectionDependants(transaction, objectId))) {
      transaction.abort();
      await afterAbort(transaction);
      return false;
    }
    if (entityType === 'goal') {
      for (const type of goalDependants) {
        const children = await request<Readonly<Record<string, unknown>>[]>(
          transaction.objectStore(pilotStoreFor(type)).getAll(),
        );
        if (
          children.some((child) =>
            pilotRelationshipReferences(type, child).some(
              (ref) => ref.entityType === 'goal' && ref.objectId === objectId,
            ),
          )
        ) {
          transaction.abort();
          await afterAbort(transaction);
          return false;
        }
      }
    }
    const previous = await request<Readonly<Record<string, unknown>>>(domainStore.get(objectId));
    const recorded = await this.recorder.recordTombstone(
      transaction,
      entityType,
      objectId,
      previous,
    );
    domainStore.delete(objectId);
    await done(transaction);
    this.recorder.notifyCommitted(recorded);
    return true;
  }
}

async function hasDirectionDependants(
  transaction: IDBTransaction,
  directionId: string,
): Promise<boolean> {
  const goals = await request<IDBValidKey[]>(
    transaction.objectStore(LIFE_OS_STORE.goals).index('byDirectionId').getAllKeys(directionId, 1),
  );
  return goals.length > 0;
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
async function afterAbort(transaction: IDBTransaction): Promise<void> {
  try {
    await done(transaction);
  } catch {
    /* Expected abort. */
  }
}
