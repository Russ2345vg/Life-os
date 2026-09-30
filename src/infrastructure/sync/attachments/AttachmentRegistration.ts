import type {
  AttachmentReference,
  DurableAttachment,
  LocalSyncImage,
} from '../../../application/sync/attachments/AttachmentContracts';
import { attachmentReference } from '../../../application/sync/attachments/AttachmentContracts';
import type { PilotEntityType } from '../../../application/sync/pilot';
import { LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';

export async function registerLocalAttachment(
  tx: IDBTransaction,
  type: PilotEntityType,
  source: Readonly<Record<string, unknown>>,
  spaceId: string,
  keyEpoch: number,
  now: string,
  createId: () => string,
): Promise<AttachmentReference | null | undefined> {
  if (type !== 'goal' && type !== 'walk' && type !== 'memory_event') return undefined;
  const store = tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue);
  const current = await request<DurableAttachment[]>(
    store.index('byParentObjectId').getAll(String(source.id)),
  );
  const image = source[type === 'goal' ? 'coverImage' : 'photo'] as
    LocalSyncImage | null | undefined;
  const incoming = attachmentReference(source.syncAttachment);
  // A downloaded reference may still be pending. A metadata-only edit must retain it.
  if (!image && incoming !== null) return incoming;
  const active = current.find((entry) => entry.spaceId === spaceId && entry.deletedAt === null);
  if (
    !image &&
    active &&
    active.localImage === null &&
    !(type === 'memory_event' && source.syncAttachment === null)
  )
    return reference(active);
  if (image && active?.localImage?.dataUrl === image.dataUrl) return reference(active);
  for (const entry of current.filter(
    (entry) => entry.spaceId === spaceId && entry.deletedAt === null,
  )) {
    store.put({ ...entry, deletedAt: now, state: 'tombstoned', updatedAt: now });
  }
  if (!image)
    return current.length > 0 || Object.hasOwn(source, 'syncAttachment') ? null : undefined;
  const entry: DurableAttachment = {
    attachmentId: createId(),
    blobVersion: 1,
    keyEpoch,
    spaceId,
    parentObjectId: String(source.id),
    entityType: type,
    localImage: { dataUrl: image.dataUrl, mimeType: image.mimeType, sizeBytes: image.sizeBytes },
    localUri: '',
    state: 'pending-upload',
    retryCount: 0,
    nextAttemptAt: now,
    leaseUntil: null,
    updatedAt: now,
    deletedAt: null,
    encryptedBlob: null,
    integrity: null,
    lastErrorCode: null,
  };
  store.put(entry);
  return reference(entry);
}

export async function registerRemoteAttachment(
  tx: IDBTransaction,
  type: PilotEntityType,
  record: Readonly<Record<string, unknown>>,
  spaceId: string,
  now: string,
): Promise<Readonly<Record<string, unknown>>> {
  if (
    (type !== 'goal' && type !== 'walk' && type !== 'memory_event') ||
    !Object.hasOwn(record, 'syncAttachment')
  )
    return record;
  const ref = attachmentReference(record.syncAttachment);
  const store = tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue);
  const current = await request<DurableAttachment[]>(
    store.index('byParentObjectId').getAll(String(record.id)),
  );
  for (const old of current.filter(
    (entry) =>
      entry.spaceId === spaceId &&
      entry.attachmentId !== ref?.attachmentId &&
      entry.deletedAt === null,
  )) {
    store.put({ ...old, deletedAt: now, state: 'tombstoned', updatedAt: now });
  }
  let image: LocalSyncImage | null = null;
  if (ref !== null) {
    const existing = await request<DurableAttachment | undefined>(store.get(ref.attachmentId));
    if (
      existing &&
      (existing.spaceId !== spaceId ||
        existing.parentObjectId !== record.id ||
        existing.blobVersion !== ref.blobVersion ||
        existing.keyEpoch !== ref.keyEpoch)
    )
      throw new Error('Attachment identity mismatch.');
    image = existing?.localImage ?? null;
    store.put(
      existing
        ? {
            ...existing,
            deletedAt: null,
            state: image
              ? existing.cloudVerifiedAt
                ? 'available-local'
                : 'pending-upload'
              : 'pending-download',
          }
        : ({
            ...ref,
            spaceId,
            parentObjectId: String(record.id),
            entityType: type,
            localUri: '',
            localImage: null,
            state: 'pending-download',
            retryCount: 0,
            nextAttemptAt: now,
            leaseUntil: null,
            updatedAt: now,
            deletedAt: null,
            encryptedBlob: null,
            integrity: null,
            lastErrorCode: null,
          } satisfies DurableAttachment),
    );
  }
  return { ...record, [type === 'goal' ? 'coverImage' : 'photo']: image };
}
export async function tombstoneParentAttachments(
  tx: IDBTransaction,
  parentObjectId: string,
  now: string,
): Promise<void> {
  const store = tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue);
  const entries = await request<DurableAttachment[]>(
    store.index('byParentObjectId').getAll(parentObjectId),
  );
  for (const entry of entries)
    if (entry.deletedAt === null)
      store.put({
        ...entry,
        state: 'tombstoned',
        deletedAt: now,
        updatedAt: now,
        leaseUntil: null,
      });
}
function reference(entry: AttachmentReference): AttachmentReference {
  return {
    attachmentId: entry.attachmentId,
    blobVersion: entry.blobVersion,
    keyEpoch: entry.keyEpoch,
  };
}
export function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.addEventListener('success', () => resolve(r.result));
    r.addEventListener('error', () => reject(r.error));
  });
}
export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('abort', () => reject(tx.error ?? new Error('Transaction aborted.')));
  });
}
