import type {
  DirectionDeletionRepository,
  DirectionDeletionResult,
  DirectionDependency,
} from '../../../application/ports/DirectionDeletionRepository';
import { directionDependency } from '../../../application/commands/directionDeletionPolicy';
import type { PilotEntityType } from '../../../application/sync/pilot/PilotSyncProtocol';
import { DirectionRecordMapper } from '../../persistence/mappers/DirectionRecordMapper';
import { type DirectionRecord } from '../../persistence/records/DirectionRecord';
import { type LifeOsIndexedDb, LIFE_OS_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from './IndexedDbPilotMutationRecorder';
import {
  PILOT_RUNTIME_REGISTRY,
  pilotRelationshipReferences,
  pilotStoreFor,
} from './PilotSyncRegistryAdapters';

export class IndexedDbDirectionDeletionRepository implements DirectionDeletionRepository {
  public constructor(
    private readonly database: LifeOsIndexedDb,
    private readonly recorder: IndexedDbPilotMutationRecorder,
  ) {}

  public inspect(id: string, today: string): Promise<DirectionDeletionResult> {
    return this.run(id, today, null);
  }

  public remove(
    id: string,
    expectedVersion: number,
    today: string,
    now: Date,
  ): Promise<DirectionDeletionResult> {
    return this.run(id, today, { expectedVersion, now });
  }

  private async run(
    id: string,
    today: string,
    mutation: { readonly expectedVersion: number; readonly now: Date } | null,
  ): Promise<DirectionDeletionResult> {
    const database = await this.database.open();
    const stores = new Set<string>([
      LIFE_OS_STORE.directions,
      ...PILOT_MUTATION_STORES,
      ...PILOT_RUNTIME_REGISTRY.filter(
        (entry) => entry.registration.storageKind === 'indexed_db',
      ).map((entry) => entry.registration.storeName),
    ]);
    const transaction = database.transaction(
      mutation ? this.database.balanceTransactionStores([...stores]) : [...stores],
      mutation ? 'readwrite' : 'readonly',
    );
    const completion = done(transaction);
    try {
      const directionStore = transaction.objectStore(LIFE_OS_STORE.directions);
      const record = await request<DirectionRecord | undefined>(directionStore.get(id));
      if (!record)
        return await stop(
          transaction,
          completion,
          { kind: 'not_found', live: [], historical: [] },
          mutation !== null,
        );
      if (mutation && record.version !== mutation.expectedVersion)
        return await stop(
          transaction,
          completion,
          { kind: 'version_conflict', live: [], historical: [] },
          true,
        );
      const dependencies: DirectionDependency[] = [];
      for (const runtime of PILOT_RUNTIME_REGISTRY) {
        if (runtime.registration.storageKind !== 'indexed_db') continue;
        const entityType = runtime.registration.entityType;
        const children = await request<Readonly<Record<string, unknown>>[]>(
          transaction.objectStore(pilotStoreFor(entityType)).getAll(),
        );
        for (const child of children) {
          if (entityType === 'direction' && child.id === id) continue;
          for (const reference of pilotRelationshipReferences(entityType, child)) {
            if (reference.entityType !== 'direction' || reference.objectId !== id) continue;
            if (!reference.required && entityType !== 'journal_entry') continue;
            const dependency = directionDependency(entityType as PilotEntityType, child, today);
            dependencies.push(
              reference.required ? dependency : { ...dependency, relation: 'historical' },
            );
          }
        }
      }
      const live = dependencies.filter((item) => item.relation === 'live');
      const historical = dependencies.filter((item) => item.relation === 'historical');
      if (live.length)
        return await stop(
          transaction,
          completion,
          { kind: 'blocked', live, historical },
          mutation !== null,
        );
      if (!mutation)
        return await stop(
          transaction,
          completion,
          { kind: historical.length ? 'archived' : 'deleted', live, historical },
          false,
        );
      if (historical.length) {
        const current = DirectionRecordMapper.fromRecord(record);
        const archived = current.archive(mutation.now);
        if (archived !== current) {
          const updated = { ...record, ...DirectionRecordMapper.toRecord(archived) };
          await request(directionStore.put(updated));
          const recorded = await this.recorder.recordUpsert(transaction, 'direction', updated);
          await this.database.refreshBalanceSnapshots(transaction, completion);
          await completion;
          this.recorder.notifyCommitted(recorded);
        } else await completion;
        return { kind: 'archived', live, historical };
      }
      const recorded = await this.recorder.recordTombstone(transaction, 'direction', id, {
        ...record,
      });
      await request(directionStore.delete(id));
      await this.database.refreshBalanceSnapshots(transaction, completion);
      await completion;
      this.recorder.notifyCommitted(recorded);
      return { kind: 'deleted', live, historical };
    } catch (error: unknown) {
      try {
        transaction.abort();
      } catch {
        /* already settled */
      }
      await completion.catch(() => {});
      throw error;
    }
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
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
async function stop(
  transaction: IDBTransaction,
  completion: Promise<void>,
  result: DirectionDeletionResult,
  abort: boolean,
) {
  if (abort) {
    transaction.abort();
    await completion.catch(() => {});
  } else await completion;
  return result;
}
