import type {
  EncryptedBlobTransport,
  SyncBinaryCrypto,
  SyncBinaryEnvelope,
} from '../attachments/AttachmentContracts';
import { binaryPath } from '../attachments/AttachmentContracts';
import { protect, sha256, unprotect } from '../attachments/ProtectedPayload';
import { DomainError } from '../../../shared/errors/DomainError';
import type {
  RecoveryDataStore,
  RecoverySnapshot,
  RecoverySnapshotKind,
  RecoveryState,
  RestorePreview,
  SyncRecovery,
} from './SyncRecovery';

export class SyncRecoveryService implements SyncRecovery {
  #maintenance: Promise<void> | null = null;
  #creation: Promise<RecoverySnapshot> | null = null;
  public constructor(
    private readonly store: RecoveryDataStore,
    private readonly crypto: SyncBinaryCrypto,
    private readonly transport: EncryptedBlobTransport,
    private readonly transfers: { retry(id: string): Promise<void> },
    private readonly now = () => new Date(),
  ) {}

  public listHistory(kind: 'conflicts' | 'deleted') {
    return this.store.history(kind);
  }
  public inspect(kind: 'conflicts' | 'deleted', id: string) {
    return this.store.inspect(kind, id);
  }
  public async listSnapshots() {
    const { spaceId } = await this.store.context();
    return (await this.store.snapshots()).filter((s) => s.spaceId === spaceId);
  }
  public async listAttachments() {
    const { spaceId } = await this.store.context();
    return (await this.store.attachments()).filter((s) => s.spaceId === spaceId);
  }
  public async retryAttachment(id: string): Promise<void> {
    const file = (await this.listAttachments()).find((a) => a.attachmentId === id);
    if (
      !file ||
      file.deletedAt !== null ||
      !['retry-upload', 'retry-download', 'quarantined'].includes(file.state)
    )
      return;
    await this.transfers.retry(id);
  }

  public async createSnapshot(kind: RecoverySnapshotKind = 'manual'): Promise<RecoverySnapshot> {
    // Serialize creation, including automatic and pre-restore snapshots.
    while (this.#creation) await this.#creation.catch(() => undefined);
    const pending = this.create(kind);
    this.#creation = pending;
    try {
      return await pending;
    } finally {
      if (this.#creation === pending) this.#creation = null;
    }
  }
  private async create(kind: RecoverySnapshotKind): Promise<RecoverySnapshot> {
    const context = await this.store.context();
    const createdAt = this.now().toISOString();
    if (kind === 'daily' || kind === 'weekly') {
      const existing = (await this.store.snapshots()).find(
        (s) =>
          s.spaceId === context.spaceId &&
          s.kind === kind &&
          s.verifiedAt &&
          period(s.createdAt, kind) === period(createdAt, kind),
      );
      if (existing) return existing;
    }
    const snapshotId = globalThis.crypto.randomUUID();
    const state = await this.store.readState();
    this.store.validate(state);
    const metadata = {
      protocolVersion: 1 as const,
      purpose: 'snapshot' as const,
      spaceId: context.spaceId,
      objectId: snapshotId,
      keyEpoch: context.keyEpoch,
      blobVersion: 1,
      snapshotKind: kind,
      schemaVersion: 1,
    };
    const encryptedBlob = await protect(this.crypto, metadata, { state, createdAt, kind });
    const snapshot: RecoverySnapshot = {
      snapshotId,
      kind,
      spaceId: context.spaceId,
      createdAt,
      metadata,
      encryptedBlob,
      sha256: await sha256(encryptedBlob),
      verifiedAt: null,
      cloudVerifiedAt: null,
      retainedUntil:
        kind === 'manual'
          ? null
          : new Date(
              this.now().getTime() +
                (kind === 'weekly' || kind === 'pre-sign-out' ? 84 : 30) * 86400000,
            ).toISOString(),
      nextAttemptAt: createdAt,
      retryCount: 0,
    };
    await this.store.saveSnapshot(snapshot);
    const saved = (await this.store.snapshots()).find((s) => s.snapshotId === snapshotId);
    if (!saved) throw new Error('Snapshot persistence verification failed.');
    await this.decode(saved);
    const verified = { ...saved, verifiedAt: this.now().toISOString() };
    await this.store.saveSnapshot(verified);
    return verified;
  }
  private async decode(snapshot: RecoverySnapshot): Promise<RecoveryState> {
    const { spaceId } = await this.store.context();
    if (
      snapshot.spaceId !== spaceId ||
      snapshot.metadata.spaceId !== spaceId ||
      snapshot.metadata.objectId !== snapshot.snapshotId ||
      snapshot.metadata.schemaVersion !== 1 ||
      snapshot.metadata.snapshotKind !== snapshot.kind ||
      (await sha256(snapshot.encryptedBlob)) !== snapshot.sha256
    )
      throw new Error('Snapshot verification failed.');
    const value = (await unprotect(this.crypto, snapshot.metadata, snapshot.encryptedBlob)) as {
      state: unknown;
      createdAt: string;
      kind: string;
    };
    if (value.createdAt !== snapshot.createdAt || value.kind !== snapshot.kind)
      throw new Error('Snapshot manifest mismatch.');
    this.store.validate(value.state);
    return this.store.normalize?.(value.state) ?? value.state;
  }
  public async preview(snapshotId: string): Promise<RestorePreview> {
    const snapshot = (await this.store.snapshots()).find(
      (s) => s.snapshotId === snapshotId && s.verifiedAt !== null,
    );
    if (!snapshot) throw new Error('Verified snapshot required.');
    const target = await this.decode(snapshot);
    const current = await this.store.readState();
    const previous = new Map(
      current.items.map((item) => [identity(item), JSON.stringify(item.record)]),
    );
    const counts: Record<string, number> = {};
    let added = 0;
    let changed = 0;
    let attachments = 0;
    let availableAttachments = 0;
    const local = await this.store.attachments();
    for (const item of target.items) {
      counts[item.entityType] = (counts[item.entityType] ?? 0) + 1;
      if (!previous.has(identity(item))) added++;
      else if (previous.get(identity(item)) !== JSON.stringify(item.record)) changed++;
      previous.delete(identity(item));
      if (item.record.syncAttachment) {
        attachments++;
        const ref = item.record.syncAttachment as { attachmentId: string };
        if (
          item.record.syncSnapshotImage ||
          local.some(
            (entry) => entry.attachmentId === ref.attachmentId && entry.localImage !== null,
          )
        )
          availableAttachments++;
      }
    }
    return {
      snapshot,
      currentFingerprint: JSON.stringify(current),
      schemaCompatible: true,
      entityCounts: counts,
      added,
      changed,
      deleted: previous.size,
      attachments,
      availableAttachments,
    };
  }
  public async restore(preview: RestorePreview): Promise<void> {
    // Re-read the trusted local restore point; never use a caller-supplied payload.
    const target = (await this.store.snapshots()).find(
      (s) => s.snapshotId === preview.snapshot.snapshotId && s.verifiedAt !== null,
    );
    if (!target) throw new Error('Verified snapshot required.');
    const state = await this.decode(target);
    if (JSON.stringify(await this.store.readState()) !== preview.currentFingerprint)
      throw new Error('Данные изменились. Откройте предпросмотр заново.');
    await this.createSnapshot('pre-restore');
    await this.store.apply(state, preview.currentFingerprint, true);
  }
  public async restoreHistory(kind: 'conflicts' | 'deleted', id: string): Promise<void> {
    const item = await this.store.inspect(kind, id);
    const current = await this.store.readState();
    await this.createSnapshot('pre-restore');
    await this.store.apply({ schemaVersion: 1, items: [item] }, JSON.stringify(current), false, {
      kind,
      id,
    });
  }
  public runMaintenance(): Promise<void> {
    if (this.#maintenance) return this.#maintenance;
    this.#maintenance = this.maintain().finally(() => {
      this.#maintenance = null;
    });
    return this.#maintenance;
  }
  public async ensureCloudVerified(snapshotId: string): Promise<RecoverySnapshot> {
    await this.runMaintenance();
    const snapshot = (await this.store.snapshots()).find(
      (candidate) => candidate.snapshotId === snapshotId,
    );
    if (
      snapshot === undefined ||
      snapshot.verifiedAt === null ||
      snapshot.cloudVerifiedAt === null
    ) {
      throw new DomainError(
        'sync.backup_not_verified',
        'Облачная резервная копия ещё не подтверждена.',
      );
    }
    return snapshot;
  }
  private async maintain(): Promise<void> {
    await this.createSnapshot('daily');
    await this.createSnapshot('weekly');
    const context = await this.store.context();
    for (const snapshot of (await this.store.snapshots())
      .filter(
        (s) =>
          s.spaceId === context.spaceId &&
          s.verifiedAt !== null &&
          s.cloudVerifiedAt === null &&
          Date.parse(s.nextAttemptAt) <= this.now().getTime(),
      )
      .slice(0, 2)) {
      try {
        await this.transport.upload(
          'lifeos-snapshots',
          binaryPath(snapshot.metadata),
          snapshot.encryptedBlob,
        );
        const encryptedBlob = await this.transport.download(
          'lifeos-snapshots',
          binaryPath(snapshot.metadata),
        );
        if (encryptedBlob !== snapshot.encryptedBlob)
          throw new Error('Snapshot remote integrity failed.');
        await this.decode({ ...snapshot, encryptedBlob });
        await this.store.saveSnapshot({ ...snapshot, cloudVerifiedAt: this.now().toISOString() });
      } catch {
        const retryCount = snapshot.retryCount + 1;
        await this.store.saveSnapshot({
          ...snapshot,
          retryCount,
          nextAttemptAt: new Date(
            this.now().getTime() +
              Math.min(3600000, 5000 * 2 ** Math.min(retryCount, 10)) *
                (0.75 + Math.random() * 0.5),
          ).toISOString(),
        });
      }
    }
    // Discovery is ciphertext-only and restores historical epoch metadata from authenticated manifests.
    const known = new Set((await this.store.snapshots()).map((s) => binaryPath(s.metadata)));
    for (const path of (await this.transport.listSnapshots(context.spaceId))
      .filter((p) => !known.has(p))
      .slice(0, 10)) {
      try {
        const encryptedBlob = await this.transport.download('lifeos-snapshots', path);
        const envelope = JSON.parse(encryptedBlob) as SyncBinaryEnvelope;
        if (
          envelope.metadata.spaceId !== context.spaceId ||
          envelope.metadata.purpose !== 'snapshot' ||
          binaryPath(envelope.metadata) !== path
        )
          throw new Error('Snapshot identity mismatch.');
        const value = (await unprotect(this.crypto, envelope.metadata, encryptedBlob)) as {
          state: unknown;
          createdAt: string;
          kind: RecoverySnapshotKind;
        };
        this.store.validate(value.state);
        if (
          !['manual', 'daily', 'weekly', 'pre-restore', 'pre-sign-out'].includes(value.kind) ||
          envelope.metadata.snapshotKind !== value.kind ||
          !Number.isFinite(Date.parse(value.createdAt))
        )
          throw new Error('Invalid snapshot manifest.');
        await this.store.saveSnapshot({
          snapshotId: envelope.metadata.objectId,
          kind: value.kind,
          spaceId: context.spaceId,
          createdAt: value.createdAt,
          metadata: envelope.metadata,
          encryptedBlob,
          sha256: await sha256(encryptedBlob),
          verifiedAt: this.now().toISOString(),
          cloudVerifiedAt: this.now().toISOString(),
          retainedUntil: null,
          retryCount: 0,
          nextAttemptAt: this.now().toISOString(),
        });
      } catch {
        /* An invalid cloud point never becomes an offered restore point. */
      }
    }
  }
}
function identity(item: RecoveryState['items'][number]): string {
  return `${item.entityType}:${String(item.record.id)}`;
}
function period(date: string, kind: 'daily' | 'weekly'): number {
  const days = Math.floor(Date.parse(date) / 86400000);
  return kind === 'daily' ? days : Math.floor((days + 3) / 7);
}
