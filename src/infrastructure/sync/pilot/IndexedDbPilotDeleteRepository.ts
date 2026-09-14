import type { PilotDeleteRepository } from '../../../application/sync/pilot/PilotDeleteRepository';
import type { PilotEntityType } from '../../../application/sync/pilot/PilotSyncProtocol';
import { type LifeOsIndexedDb } from '../../persistence/indexed-db/LifeOsIndexedDb';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from './IndexedDbPilotMutationRecorder';
import {
  PILOT_RUNTIME_REGISTRY,
  pilotRelationshipReferences,
  pilotStoreFor,
} from './PilotSyncRegistryAdapters';

export class IndexedDbPilotDeleteRepository implements PilotDeleteRepository {
  public constructor(
    private readonly database: LifeOsIndexedDb,
    private readonly recorder: IndexedDbPilotMutationRecorder,
  ) {}

  public async delete(entityType: PilotEntityType, objectId: string): Promise<boolean> {
    const database = await this.database.open();
    const stores = new Set<string>([
      pilotStoreFor(entityType),
      ...PILOT_MUTATION_STORES,
      ...PILOT_RUNTIME_REGISTRY.filter(
        (item) => item.registration.storageKind === 'indexed_db',
      ).map((item) => item.registration.storeName),
    ]);
    const transaction = database.transaction([...stores], 'readwrite');
    const domainStore = transaction.objectStore(pilotStoreFor(entityType));
    const existing = await request(domainStore.getKey(objectId));
    if (existing === undefined) {
      transaction.abort();
      await afterAbort(transaction);
      return false;
    }
    for (const runtime of PILOT_RUNTIME_REGISTRY) {
      if (runtime.registration.storageKind === 'indexed_db') {
        const type = runtime.registration.entityType;
        const children = await request<Readonly<Record<string, unknown>>[]>(
          transaction.objectStore(pilotStoreFor(type)).getAll(),
        );
        if (
          children.some(
            (child) =>
              !(type === entityType && child.id === objectId) &&
              pilotRelationshipReferences(type, child).some(
                (ref) => ref.required && ref.entityType === entityType && ref.objectId === objectId,
              ),
          )
        ) {
          transaction.abort();
          await afterAbort(transaction);
          return false;
        }
      }
    }
    if (entityType === 'life_action') {
      const rules = await request<Readonly<Record<string, unknown>>[]>(
        transaction.objectStore(pilotStoreFor('recurrence_rule')).getAll(),
      );
      if (rules.some((rule) => rule.id === `recurrence:${objectId}`)) {
        transaction.abort();
        await afterAbort(transaction);
        return false;
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
