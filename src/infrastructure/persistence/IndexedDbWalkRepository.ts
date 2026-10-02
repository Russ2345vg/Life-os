import type { Walk } from '../../domain/walk/Walk';
import type {
  WalkRepository,
  WalkHistoryPage,
  WalkHistoryQuery,
} from '../../application/ports/WalkRepository';
import type {
  WalkRequest,
  WalkTransaction,
  WalkUnitOfWork,
} from '../../application/ports/WalkUnitOfWork';
import type { CommittedWalkChanges } from '../../application/ports/CommittedWalkChanges';
import { DomainError } from '../../shared/errors/DomainError';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import { LIFE_OS_SYNC_STORE, type LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { WalkRecordMapper } from './mappers/WalkRecordMapper';
import type { WalkRecord } from './records/WalkRecord';
import { assertWalkSyncV1Compatible } from '../../application/walk/WalkSyncCompatibility';
import { confirmedWalkDataFormat } from '../sync/WalkDataFormat';
import type { SyncSettingsRecord } from './records/SyncStoreRecords';
import type { WalkCapture } from '../../domain/walk-capture/WalkCapture';
import type {
  WalkCaptureRepository,
  WalkCaptureTransaction,
} from '../../application/ports/WalkCaptureRepository';
import { WalkCaptureRecordMapper } from './mappers/WalkCaptureRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import type { LifeActionRecord } from './records/LifeActionRecord';

interface Receipt {
  readonly id: string;
  readonly operation: string;
  readonly inputHash: string;
  readonly walkId: string;
  readonly version: number;
  readonly updatedAt: string;
  readonly generation: number;
}

export class IndexedDbWalkRepository
  implements WalkRepository, WalkUnitOfWork, CommittedWalkChanges, WalkCaptureRepository
{
  public constructor(private readonly database: LifeOsIndexedDb) {}
  public async reserveExport(input: WalkRequest, candidateId: string): Promise<string> {
    const db = await this.database.open();
    const tx = db.transaction('sync_settings', 'readwrite');
    const completion = done(tx);
    void completion.catch(() => undefined);
    try {
      const store = tx.objectStore('sync_settings');
      const key = `walk-export:v1:${input.requestId}`;
      const generation =
        (await request<{ generation: number } | undefined>(store.get('walk-command-generation')))
          ?.generation ?? 0;
      const previous = await request<
        { inputHash: string; generation: number; memoryId: string } | undefined
      >(store.get(key));
      if (previous && previous.inputHash !== input.inputHash)
        throw new DomainError(
          'walk.request_reused',
          'Запрос переноса уже использован с другими данными.',
        );
      if (previous && previous.generation !== generation)
        throw new DomainError(
          'walk.request_invalidated',
          'Данные восстановлены. Создайте новый запрос переноса.',
        );
      if (!previous) store.add({ id: key, ...input, generation, memoryId: candidateId });
      await completion;
      return previous?.memoryId ?? candidateId;
    } catch (error: unknown) {
      try {
        tx.abort();
      } catch {
        /* Settled. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }
  public subscribe(listener: () => void): () => void {
    return this.database.subscribeCommits((stores) => {
      if (stores.includes('walks') || stores.includes('walkCaptures')) listener();
    });
  }
  public async get(id: string): Promise<Walk | null> {
    const db = await this.database.open();
    return getWalk(db.transaction('walks').objectStore('walks'), id);
  }
  public async getActive(): Promise<readonly Walk[]> {
    const db = await this.database.open();
    return getActive(db.transaction('walks').objectStore('walks'));
  }
  public async list(query: WalkHistoryQuery = {}): Promise<WalkHistoryPage> {
    const db = await this.database.open();
    const rows: Walk[] = [];
    // Cursor keeps large photo payloads out of the accumulated list projection.
    await new Promise<void>((resolve, reject) => {
      const cursor = db.transaction('walks').objectStore('walks').openCursor();
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) {
          resolve();
          return;
        }
        try {
          const record = entry.value as WalkRecord;
          const walk = WalkRecordMapper.fromRecord({ ...record, photo: null });
          if (
            (query.deleted ? walk.deletedAt !== null : walk.deletedAt === null) &&
            (!query.from || record.date >= query.from) &&
            (!query.to || record.date <= query.to) &&
            (!query.intent || record.intent === query.intent) &&
            (!query.status || record.status === query.status) &&
            (!query.sphereId || record.sphereId === query.sphereId) &&
            (!query.search ||
              `${record.result ?? ''} ${record.reflectionQuestion ?? ''}`
                .toLocaleLowerCase()
                .includes(query.search.toLocaleLowerCase())) &&
            (!query.cursor || sortKey(walk) < query.cursor)
          ) {
            rows.push(walk);
            rows.sort(compareWalks);
            if (rows.length > 31) rows.pop();
          }
          entry.continue();
        } catch (error: unknown) {
          reject(error);
        }
      };
    });
    rows.sort(compareWalks);
    const items = rows.slice(0, 30);
    return { items, nextCursor: rows.length > 30 ? sortKey(items[29]!) : null };
  }
  public run(
    input: WalkRequest,
    change: (transaction: WalkTransaction) => Promise<Walk>,
  ): Promise<Walk> {
    return this.execute(input, change, (tx, id) => tx.getWalk(id));
  }
  public runCapture(
    input: WalkRequest,
    change: (transaction: WalkCaptureTransaction) => Promise<WalkCapture>,
  ): Promise<WalkCapture> {
    return this.execute(input, change, (tx, id) => tx.getCapture(id));
  }
  public async listCaptures(walkId?: string): Promise<readonly WalkCapture[]> {
    const db = await this.database.open();
    const store = db.transaction('walkCaptures').objectStore('walkCaptures');
    const rows = await request<unknown[]>(
      walkId ? store.index('byWalkId').getAll(walkId) : store.getAll(),
    );
    return rows
      .map((row) => WalkCaptureRecordMapper.fromRecord(row))
      .sort(
        (a, b) =>
          b.capturedAt.getTime() - a.capturedAt.getTime() ||
          a.id.toString().localeCompare(b.id.toString()),
      );
  }
  private async execute<T extends Walk | WalkCapture>(
    input: WalkRequest,
    change: (transaction: WalkCaptureTransaction) => Promise<T>,
    lookup: (tx: WalkCaptureTransaction, id: string) => Promise<T | null>,
  ): Promise<T> {
    const db = await this.database.open();
    const tx = db.transaction(
      ['walks', 'walkCaptures', 'lifeActions', 'goals', LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    const completion = done(tx);
    void completion.catch(() => undefined);
    try {
      const store = tx.objectStore('walks');
      const settings = tx.objectStore(LIFE_OS_SYNC_STORE.settings);
      const captures = tx.objectStore('walkCaptures');
      const transaction: WalkCaptureTransaction = {
        getAction: async (id) => {
          const raw = await request<LifeActionRecord | undefined>(
            tx.objectStore('lifeActions').get(id),
          );
          return raw ? LifeActionRecordMapper.fromRecord(raw) : null;
        },
        hasGoal: async (id) => {
          const raw = await request<
            { deletedAt?: string | null; archivedAt?: string | null } | undefined
          >(tx.objectStore('goals').get(id));
          return !!raw && raw.deletedAt == null && raw.archivedAt == null;
        },
        getWalk: (id) => getWalk(store, id),
        getActive: () => getActive(store),
        getCapture: async (id) => {
          const raw = await request<unknown>(captures.get(id));
          return raw === undefined ? null : WalkCaptureRecordMapper.fromRecord(raw);
        },
        saveCapture: async (capture, expectedVersion) => {
          const existing = await request<{ version: number } | undefined>(
            captures.get(capture.id.toString()),
          );
          if ((existing?.version ?? null) !== expectedVersion)
            throw new DomainError(
              'persistence.version_conflict',
              'Мысль изменилась. Обновите данные.',
            );
          await request(
            captures.put({ ...existing, ...WalkCaptureRecordMapper.toRecord(capture) }),
          );
        },
        saveWalk: async (walk, expectedVersion) => {
          const existing = await request<WalkRecord | undefined>(store.get(walk.id.toString()));
          if ((existing?.version ?? null) !== expectedVersion)
            throw new DomainError(
              'persistence.version_conflict',
              'Запись изменилась. Обновите данные.',
            );
          const sync = await request<SyncSettingsRecord | undefined>(settings.get('sync'));
          if (
            (sync?.setupState === 'configured' || sync?.setupState === 'rotation_pending') &&
            sync.membershipStatus === 'active' &&
            sync.spaceId != null &&
            sync.currentKeyEpoch != null
          )
            assertWalkSyncV1Compatible(
              { ...WalkRecordMapper.toRecord(walk) },
              await confirmedWalkDataFormat(tx, sync),
            );
          await request(store.put({ ...existing, ...WalkRecordMapper.toRecord(walk) }));
        },
      };
      const receiptId = `walk-command:v1:${input.requestId}`;
      const receipt = await request<Receipt | undefined>(settings.get(receiptId));
      const generation =
        (await request<{ generation: number } | undefined>(settings.get('walk-command-generation')))
          ?.generation ?? 0;
      if (receipt) {
        if (receipt.operation !== input.operation || receipt.inputHash !== input.inputHash)
          throw new DomainError(
            'walk.request_reused',
            'Команда уже использована с другими данными.',
          );
        if (receipt.generation !== generation)
          throw new DomainError(
            'walk.request_invalidated',
            'Данные восстановлены. Обновите экран перед новым действием.',
          );
        const current = await lookup(transaction, receipt.walkId);
        if (
          !current ||
          current.version < receipt.version ||
          current.updatedAt.toISOString() < receipt.updatedAt
        )
          throw new DomainError(
            'walk.request_obsolete',
            'Данные восстановлены или удалены. Обновите экран и повторите действие.',
          );
        await completion;
        return current;
      }
      const result = await change(transaction);
      await request(
        settings.add({
          id: receiptId,
          ...input,
          generation,
          walkId: result.id.toString(),
          version: result.version,
          updatedAt: result.updatedAt.toISOString(),
        } satisfies Receipt & WalkRequest),
      );
      await completion;
      return result;
    } catch (error: unknown) {
      try {
        tx.abort();
      } catch {
        /* Already settled. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }
}
async function getWalk(store: IDBObjectStore, id: string): Promise<Walk | null> {
  const raw = await request<unknown>(store.get(id));
  return raw === undefined ? null : WalkRecordMapper.fromRecord(raw);
}
async function getActive(store: IDBObjectStore): Promise<readonly Walk[]> {
  const running = store.index('byStatus').getAll('running');
  const paused = store.index('byStatus').getAll('paused');
  return (await Promise.all([request<unknown[]>(running), request<unknown[]>(paused)]))
    .flat()
    .map((raw) => WalkRecordMapper.fromRecord(raw));
}
function sortKey(walk: Walk) {
  return `${walk.date.toString()}|${walk.startedAt?.toISOString() ?? walk.createdAt.toISOString()}|${walk.id.toString()}`;
}
function compareWalks(a: Walk, b: Walk) {
  return sortKey(a) === sortKey(b) ? 0 : sortKey(a) < sortKey(b) ? 1 : -1;
}
