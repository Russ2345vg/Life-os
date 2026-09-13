import type { SyncStatusSnapshot, SyncStatusSource } from '../../application/sync/SyncStatus';
import type { DurableAttachment } from '../../application/sync/attachments/AttachmentContracts';
import type { RecoverySnapshot } from '../../application/sync/recovery/SyncRecovery';
import {
  LIFE_OS_SYNC_STORE as S,
  type LifeOsIndexedDb,
} from '../persistence/indexed-db/LifeOsIndexedDb';
import type {
  SyncConflictRecord,
  SyncOutboxRecord,
  SyncQuarantineRecord,
  SyncSettingsRecord,
  SyncCursorRecord,
} from '../persistence/records/SyncStoreRecords';

type Installation = Pick<SyncSettingsRecord, 'spaceId' | 'setupState' | 'membershipStatus'>;
type Attachment = SyncStatusSnapshot['attachments'][number] & {
  spaceId: string;
  deletedAt: string | null;
};
const stores = [
  S.settings,
  S.outbox,
  S.conflicts,
  S.quarantine,
  S.attachmentQueue,
  S.snapshotMeta,
  S.cursor,
];
export class IndexedDbSyncStatusSource implements SyncStatusSource {
  readonly #dirty = new Set<string>(stores);
  #subscriptions = 0;
  #cursors: SyncCursorRecord[] = [];
  #installation: Installation | null = null;
  #outbox: Pick<SyncOutboxRecord, 'state'>[] = [];
  #conflicts: Pick<SyncConflictRecord, 'spaceId' | 'resolutionStatus'>[] = [];
  #quarantine: Pick<SyncQuarantineRecord, 'spaceId' | 'state'>[] = [];
  #attachments: (SyncStatusSnapshot['attachments'][number] & {
    spaceId: string;
    deletedAt: string | null;
  })[] = [];
  #snapshots: Pick<RecoverySnapshot, 'spaceId' | 'cloudVerifiedAt' | 'retryCount'>[] = [];
  public constructor(private readonly database: LifeOsIndexedDb) {}
  public subscribe(listener: (stores: readonly string[]) => void): () => void {
    this.#subscriptions++;
    const stop = this.database.subscribeCommits((changed) => {
      for (const store of changed)
        if (stores.includes(store as (typeof stores)[number])) this.#dirty.add(store);
      listener(changed);
    });
    return () => {
      this.#subscriptions--;
      stop();
    };
  }
  public async read(): Promise<SyncStatusSnapshot> {
    const db = await this.database.open();
    // When used without subscribers, always read fresh. In the shell commits invalidate only changed slices.
    if (this.#subscriptions === 0) for (const store of stores) this.#dirty.add(store);
    const selected = [...this.#dirty];
    this.#dirty.clear();
    if (selected.length) {
      const tx = db.transaction(selected);
      try {
        await Promise.all(
          selected.map(async (name) => {
            const store = tx.objectStore(name);
            if (name === S.cursor)
              this.#cursors = await project<SyncCursorRecord, SyncCursorRecord>(store, (c) => ({
                spaceId: c.spaceId,
                lastSequence: c.lastSequence,
                updatedAt: c.updatedAt,
              }));
            if (name === S.settings)
              this.#installation =
                (
                  await project<SyncSettingsRecord, Installation | null>(store, (i) =>
                    i.id === 'sync'
                      ? {
                          spaceId: i.spaceId,
                          setupState: i.setupState,
                          membershipStatus: i.membershipStatus,
                        }
                      : null,
                  )
                ).find((i) => i !== null) ?? null;
            if (name === S.outbox)
              this.#outbox = await project<SyncOutboxRecord, Pick<SyncOutboxRecord, 'state'>>(
                store,
                (o) => ({ state: o.state }),
              );
            if (name === S.conflicts)
              this.#conflicts = await project<
                SyncConflictRecord,
                Pick<SyncConflictRecord, 'spaceId' | 'resolutionStatus'>
              >(store, (c) => ({ spaceId: c.spaceId, resolutionStatus: c.resolutionStatus }));
            if (name === S.quarantine)
              this.#quarantine = await project<
                SyncQuarantineRecord,
                Pick<SyncQuarantineRecord, 'spaceId' | 'state'>
              >(store, (q) => ({ spaceId: q.spaceId ?? null, state: q.state }));
            if (name === S.attachmentQueue)
              this.#attachments = await project<DurableAttachment, Attachment>(store, (a) => ({
                attachmentId: a.attachmentId,
                parentObjectId: a.parentObjectId,
                entityType: a.entityType,
                state: a.state,
                localAvailable: a.localImage !== null,
                spaceId: a.spaceId,
                deletedAt: a.deletedAt,
              }));
            if (name === S.snapshotMeta)
              this.#snapshots = await project<
                RecoverySnapshot,
                Pick<RecoverySnapshot, 'spaceId' | 'cloudVerifiedAt' | 'retryCount'>
              >(store, (s) => ({
                spaceId: s.spaceId,
                cloudVerifiedAt: s.cloudVerifiedAt,
                retryCount: s.retryCount,
              }));
          }),
        );
      } catch (error) {
        for (const store of selected) this.#dirty.add(store);
        throw error;
      }
    }
    const spaceId = this.#installation?.spaceId;
    const ownQuarantine = this.#quarantine.filter((q) => !q.spaceId || q.spaceId === spaceId);
    const pendingBackups = this.#snapshots.filter(
      (s) => spaceId && s.spaceId === spaceId && !s.cloudVerifiedAt,
    );
    return {
      cursor: this.#cursors.find((c) => c.spaceId === spaceId)?.lastSequence ?? null,
      setupIssue:
        this.#installation?.setupState === 'rotation_pending'
          ? 'rotation-pending'
          : this.#installation?.membershipStatus === 'revoked'
            ? 'revoked'
            : this.#installation?.membershipStatus === 'pending'
              ? 'pending'
              : null,
      configured:
        this.#installation?.setupState === 'configured' &&
        this.#installation.membershipStatus === 'active',
      pending: this.#outbox.filter((o) => o.state !== 'quarantined').length,
      conflicts: this.#conflicts.filter(
        (c) => c.spaceId === spaceId && c.resolutionStatus === 'unresolved',
      ).length,
      quarantined:
        this.#outbox.filter((o) => o.state === 'quarantined').length +
        ownQuarantine.filter((q) => q.state === 'attention').length,
      deferred: ownQuarantine.filter((q) => q.state === 'deferred').length,
      attachments: this.#attachments
        .filter(
          (a) =>
            spaceId && a.spaceId === spaceId && a.deletedAt === null && a.state !== 'tombstoned',
        )
        .map((a) => ({
          attachmentId: a.attachmentId,
          parentObjectId: a.parentObjectId,
          entityType: a.entityType,
          state: a.state,
          localAvailable: a.localAvailable,
        })),
      pendingBackups: pendingBackups.length,
      failedBackups: pendingBackups.filter((s) => s.retryCount > 0).length,
    };
  }
}

// Cursor projection releases each large payload immediately instead of retaining all blobs in getAll arrays.
function project<T, R>(store: IDBObjectStore, map: (value: T) => R): Promise<R[]> {
  return new Promise((resolve, reject) => {
    const values: R[] = [];
    const request = store.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(values);
        return;
      }
      try {
        values.push(map(cursor.value as T));
        cursor.continue();
      } catch (error) {
        reject(error);
      }
    };
  });
}
