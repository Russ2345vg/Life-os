import type { WalkCaptureRepository } from '../../application/ports/WalkCaptureRepository';
import type { EntityId, WalkCapture } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { WalkCaptureRecordMapper } from './mappers/WalkCaptureRecordMapper';
import type { WalkCaptureRecord } from './records/WalkCaptureRecord';

export class IndexedDbWalkCaptureRepository implements WalkCaptureRepository {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async insert(capture: WalkCapture): Promise<void> {
    const database = await this.indexedDb.open();
    await executeIndexedDbRequest(database, LIFE_OS_STORE.walkCaptures, 'readwrite', (store) =>
      store.add(WalkCaptureRecordMapper.toRecord(capture)),
    );
  }

  public async findById(id: EntityId): Promise<WalkCapture | null> {
    const database = await this.indexedDb.open();
    const value = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.walkCaptures,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return value === undefined ? null : WalkCaptureRecordMapper.fromRecord(value);
  }

  public findPending(): Promise<readonly WalkCapture[]> {
    return this.findByIndex('byStatus', 'pending');
  }

  public findByWalkId(walkId: EntityId): Promise<readonly WalkCapture[]> {
    return this.findByIndex('byWalkId', walkId.toString());
  }

  public async updateIfVersionMatches(
    capture: WalkCapture,
    expectedVersion: number,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const next = WalkCaptureRecordMapper.toRecord(capture);
    let matched = false;
    // The read and conditional write share one transaction; the helper awaits its commit.
    await executeIndexedDbRequest(database, LIFE_OS_STORE.walkCaptures, 'readwrite', (store) => {
      const request: IDBRequest<WalkCaptureRecord | undefined> = store.get(next.id);
      request.addEventListener('success', () => {
        if (request.result?.version === expectedVersion) {
          try {
            store.put(next);
            matched = true;
          } catch {
            // Synchronous write failures must reject through the transaction, not escape the event handler.
            store.transaction.abort();
          }
        }
      });
      return request;
    });
    return matched;
  }

  private async findByIndex(index: string, key: string): Promise<readonly WalkCapture[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.walkCaptures,
      'readonly',
      (store) => store.index(index).getAll(key),
    );
    return values.map((value) => WalkCaptureRecordMapper.fromRecord(value));
  }
}
