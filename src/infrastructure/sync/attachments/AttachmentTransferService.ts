import { protect, unprotect } from '../../../application/sync/attachments/ProtectedPayload';
import { validateMemoryPhoto } from '../../../domain/memory';
import type {
  DurableAttachment,
  EncryptedBlobTransport,
  LocalSyncImage,
  SyncBinaryCrypto,
} from '../../../application/sync/attachments/AttachmentContracts';
import {
  binaryMetadata,
  binaryPath,
} from '../../../application/sync/attachments/AttachmentContracts';
import {
  LIFE_OS_SYNC_STORE,
  type LifeOsIndexedDb,
} from '../../persistence/indexed-db/LifeOsIndexedDb';
import { done, request } from './AttachmentRegistration';

export class AttachmentTransferService {
  #running: Promise<void> | null = null;
  #rerun = false;
  public constructor(
    private readonly db: LifeOsIndexedDb,
    private readonly crypto: SyncBinaryCrypto,
    private readonly transport: EncryptedBlobTransport,
    private readonly now = () => new Date(),
  ) {}

  public async list(): Promise<DurableAttachment[]> {
    const db = await this.db.open();
    const tx = db.transaction(LIFE_OS_SYNC_STORE.attachmentQueue, 'readonly');
    return (
      await request<DurableAttachment[]>(
        tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue).getAll(),
      )
    ).filter((item) => item.spaceId !== undefined);
  }
  public run(spaceId: string): Promise<void> {
    if (this.#running) {
      this.#rerun = true;
      return this.#running;
    }
    this.#running = this.execute(spaceId).finally(() => {
      this.#running = null;
      if (this.#rerun) {
        this.#rerun = false;
        void this.run(spaceId).catch(() => undefined);
      }
    });
    return this.#running;
  }
  private async execute(spaceId: string): Promise<void> {
    // Bounded foreground batch. Structured sync never awaits file I/O.
    const due = (await this.list())
      .filter(
        (entry) =>
          entry.spaceId === spaceId &&
          entry.deletedAt === null &&
          [
            'pending-upload',
            'retry-upload',
            'uploading',
            'pending-download',
            'retry-download',
            'downloading',
          ].includes(entry.state) &&
          Date.parse(entry.nextAttemptAt) <= this.now().getTime() &&
          (!entry.leaseUntil || Date.parse(entry.leaseUntil) <= this.now().getTime()),
      )
      .slice(0, 4);
    for (const candidate of due) {
      const entry = await this.claim(candidate.attachmentId);
      if (entry === null) continue;
      const upload = entry.localImage !== null;
      let authenticationPhase = false;
      try {
        const metadata = binaryMetadata(spaceId, entry);
        let encrypted = entry.encryptedBlob;
        if (upload) {
          if (encrypted === null)
            encrypted = await protect(this.crypto, metadata, entry.localImage);
          await this.update(entry.attachmentId, { encryptedBlob: encrypted });
          await this.transport.upload('lifeos-attachments', binaryPath(metadata), encrypted);
        }
        const downloaded = await this.transport.download(
          'lifeos-attachments',
          binaryPath(metadata),
        );
        authenticationPhase = true;
        if (upload && downloaded !== encrypted)
          throw new Error('Immutable blob verification failed.');
        const value = await unprotect(this.crypto, metadata, downloaded);
        const image =
          entry.entityType === 'memory_event' ? validateMemoryPhoto(value) : validateImage(value);
        await this.materialize(entry, image, downloaded);
      } catch {
        const retryCount = entry.retryCount + 1;
        await this.update(entry.attachmentId, {
          state: authenticationPhase ? 'quarantined' : upload ? 'retry-upload' : 'retry-download',
          retryCount,
          leaseUntil: null,
          lastErrorCode: authenticationPhase ? 'integrity-failed' : 'transfer-unavailable',
          nextAttemptAt: new Date(
            this.now().getTime() +
              Math.min(300_000, 2000 * 2 ** Math.min(retryCount, 7)) * (0.75 + Math.random() * 0.5),
          ).toISOString(),
        });
      }
    }
  }
  public async retry(attachmentId: string): Promise<void> {
    const db = await this.db.open();
    const tx = db.transaction(
      [LIFE_OS_SYNC_STORE.attachmentQueue, LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    const completion = done(tx);
    const store = tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue);
    const [entry, installation] = await Promise.all([
      request<DurableAttachment | undefined>(store.get(attachmentId)),
      request<{ spaceId: string; membershipStatus: string; setupState: string } | undefined>(
        tx.objectStore(LIFE_OS_SYNC_STORE.settings).get('sync'),
      ),
    ]);
    if (
      !entry ||
      entry.deletedAt !== null ||
      !['retry-upload', 'retry-download', 'quarantined'].includes(entry.state) ||
      installation?.membershipStatus !== 'active' ||
      installation.setupState !== 'configured' ||
      installation.spaceId !== entry.spaceId
    ) {
      await completion;
      return;
    }
    store.put({
      ...entry,
      state: entry.localImage ? 'pending-upload' : 'pending-download',
      leaseUntil: null,
      nextAttemptAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });
    await completion;
  }
  private async claim(id: string): Promise<DurableAttachment | null> {
    const db = await this.db.open();
    const tx = db.transaction(LIFE_OS_SYNC_STORE.attachmentQueue, 'readwrite');
    const completion = done(tx);
    const store = tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue);
    const entry = await request<DurableAttachment | undefined>(store.get(id));
    if (
      !entry ||
      entry.deletedAt !== null ||
      (entry.leaseUntil && Date.parse(entry.leaseUntil) > this.now().getTime())
    ) {
      await completion;
      return null;
    }
    store.put({
      ...entry,
      state: entry.localImage ? 'uploading' : 'downloading',
      leaseUntil: new Date(this.now().getTime() + 120_000).toISOString(),
    });
    await completion;
    return entry;
  }
  private async update(id: string, patch: Partial<DurableAttachment>): Promise<void> {
    const db = await this.db.open();
    const tx = db.transaction(LIFE_OS_SYNC_STORE.attachmentQueue, 'readwrite');
    const completion = done(tx);
    const store = tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue);
    const entry = await request<DurableAttachment | undefined>(store.get(id));
    if (entry && entry.deletedAt === null)
      store.put({ ...entry, ...patch, updatedAt: this.now().toISOString() });
    await completion;
  }
  private async materialize(
    entry: DurableAttachment,
    image: LocalSyncImage,
    encryptedBlob: string,
  ): Promise<void> {
    const db = await this.db.open();
    const parentStore =
      entry.entityType === 'goal'
        ? 'goals'
        : entry.entityType === 'walk'
          ? 'walks'
          : 'memoryEvents';
    const tx = await this.db.withMutationCaptureSuppressed(async () =>
      db.transaction(
        [parentStore, LIFE_OS_SYNC_STORE.attachmentQueue, LIFE_OS_SYNC_STORE.objectMeta],
        'readwrite',
      ),
    );
    const completion = done(tx);
    const queue = tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue);
    const current = await request<DurableAttachment | undefined>(queue.get(entry.attachmentId));
    if (current?.deletedAt !== null) {
      await completion;
      return;
    }
    queue.put({
      ...current,
      localImage: image,
      encryptedBlob,
      integrity: null,
      cloudVerifiedAt: this.now().toISOString(),
      state: entry.localImage ? 'uploaded' : 'available-local',
      leaseUntil: null,
      lastErrorCode: null,
      updatedAt: this.now().toISOString(),
    });
    const parent = await request<Record<string, unknown> | undefined>(
      tx.objectStore(parentStore).get(entry.parentObjectId),
    );
    if (
      parent &&
      (!Object.hasOwn(parent, 'syncAttachment') ||
        (typeof parent.syncAttachment === 'object' &&
          parent.syncAttachment !== null &&
          'attachmentId' in parent.syncAttachment &&
          parent.syncAttachment.attachmentId === entry.attachmentId))
    ) {
      tx.objectStore(parentStore).put({
        ...parent,
        [entry.entityType === 'goal' ? 'coverImage' : 'photo']: image,
      });
    }
    await completion;
  }
}

function validateImage(value: unknown): LocalSyncImage {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid image.');
  const image = value as LocalSyncImage;
  if (
    typeof image.mimeType !== 'string' ||
    !/^image\/[a-z0-9.+-]+$/i.test(image.mimeType) ||
    typeof image.dataUrl !== 'string' ||
    !image.dataUrl.startsWith(`data:${image.mimeType};base64,`)
  )
    throw new Error('Invalid image.');
  const bytes = atob(image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)).length;
  if (bytes !== image.sizeBytes || bytes < 1 || bytes > 5 * 1024 * 1024)
    throw new Error('Invalid image size.');
  return { dataUrl: image.dataUrl, mimeType: image.mimeType, sizeBytes: bytes };
}
