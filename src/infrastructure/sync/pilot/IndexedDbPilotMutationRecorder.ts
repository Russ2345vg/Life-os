import {
  HybridLogicalClock,
  serializePilotSyncPayload,
  type PilotEntityType,
  type PilotOperation,
  type PilotSyncPayload,
} from '../../../application/sync/pilot';
import {
  LIFE_OS_SYNC_STORE,
  SINGLETON_SYNC_STORES,
} from '../../persistence/indexed-db/LifeOsIndexedDb';
import {
  canonicalSyncRecord,
  logicalIdentity,
  rememberSyncIdentity,
} from './StructuredSyncIdentity';
import type {
  SyncObjectMetaRecord,
  SyncOutboxRecord,
  SyncPilotClockRecord,
  SyncSettingsRecord,
} from '../../persistence/records/SyncStoreRecords';
import { pilotRegistrationFor, shouldSyncPilotRecord } from './PilotSyncRegistryAdapters';
import {
  registerLocalAttachment,
  tombstoneParentAttachments,
} from '../attachments/AttachmentRegistration';

export const PILOT_MUTATION_STORES = Object.freeze([
  ...SINGLETON_SYNC_STORES,
  LIFE_OS_SYNC_STORE.settings,
  LIFE_OS_SYNC_STORE.objectMeta,
  LIFE_OS_SYNC_STORE.outbox,
  LIFE_OS_SYNC_STORE.attachmentQueue,
] as const);

export interface PilotMutationRecorderDependencies {
  readonly createId?: () => string;
  readonly now?: () => Date;
  readonly notify?: () => void;
}

export class IndexedDbPilotMutationRecorder {
  readonly #createId: () => string;
  readonly #now: () => Date;
  #notify: () => void;

  public constructor(dependencies: PilotMutationRecorderDependencies = {}) {
    this.#createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.#now = dependencies.now ?? (() => new Date());
    this.#notify = dependencies.notify ?? (() => undefined);
  }

  public async recordUpsert<TRecord extends object>(
    transaction: IDBTransaction,
    entityType: PilotEntityType,
    record: Readonly<TRecord>,
  ): Promise<boolean> {
    return this.record(transaction, entityType, 'upsert', record);
  }

  public async recordTombstone(
    transaction: IDBTransaction,
    entityType: PilotEntityType,
    objectId: string,
    previous?: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    return this.record(transaction, entityType, 'tombstone', previous ?? { id: objectId });
  }

  public notifyCommitted(recorded: boolean): void {
    if (!recorded) return;
    try {
      this.#notify();
    } catch {
      // The durable outbox is already committed. Lifecycle wakeups can retry delivery.
    }
  }

  public setNotify(notify: () => void): void {
    this.#notify = notify;
  }

  private async record(
    transaction: IDBTransaction,
    entityType: PilotEntityType,
    operation: PilotOperation,
    sourceRecord: Readonly<object>,
  ): Promise<boolean> {
    const settings = await request<SyncSettingsRecord | undefined>(
      transaction.objectStore(LIFE_OS_SYNC_STORE.settings).get('sync'),
    );
    if (!isActiveInstallation(settings)) return false;

    const objectId = 'id' in sourceRecord ? sourceRecord.id : undefined;
    if (typeof objectId !== 'string' || objectId.length === 0) {
      throw new Error('Pilot mutation requires a stable object ID.');
    }
    if (operation === 'upsert' && !shouldSyncPilotRecord(entityType, sourceRecord)) return false;
    const currentMeta = await request<SyncObjectMetaRecord | undefined>(
      transaction.objectStore(LIFE_OS_SYNC_STORE.objectMeta).get(objectId),
    );
    const storedClock = await request<SyncPilotClockRecord | undefined>(
      transaction.objectStore(LIFE_OS_SYNC_STORE.settings).get('pilot-clock'),
    );
    const now = this.#now();
    const clock = new HybridLogicalClock(
      storedClock === undefined
        ? { wallTime: 0, logical: 0 }
        : { wallTime: storedClock.wallTime, logical: storedClock.logical },
    );
    const hlc = clock.tick(now.getTime());
    const baseRevision = currentMeta?.revision ?? 0;
    const revision = baseRevision + 1;
    const transportObjectId = currentMeta?.transportObjectId ?? this.#createId();
    const eventId = this.#createId();
    const registration = pilotRegistrationFor(entityType);
    const schemaVersion = registration.recordSchemaVersion ?? 1;
    let record =
      operation === 'upsert'
        ? await canonicalSyncRecord(
            transaction,
            entityType,
            sourceRecord as Readonly<Record<string, unknown>>,
          )
        : null;
    if (record !== null) {
      const ref = await registerLocalAttachment(
        transaction,
        entityType,
        sourceRecord as Readonly<Record<string, unknown>>,
        settings.spaceId!,
        settings.currentKeyEpoch,
        now.toISOString(),
        this.#createId,
      );
      if (ref !== undefined) record = { ...record, syncAttachment: ref };
    }
    const logicalObjectId =
      record === null
        ? (currentMeta?.logicalObjectId ??
          (await logicalIdentity(transaction, entityType, objectId)))
        : String(record.id);
    await rememberSyncIdentity(transaction, entityType, objectId, logicalObjectId, objectId);
    const payload: PilotSyncPayload = {
      protocolVersion: 1,
      schemaVersion: 1,
      entityType,
      operation,
      objectId: logicalObjectId,
      eventId,
      originDeviceId: settings.deviceId,
      keyEpoch: settings.currentKeyEpoch,
      baseRevision,
      revision,
      hlc,
      record,
    };
    const serializedPayload = serializePilotSyncPayload(payload);
    const timestamp = now.toISOString();
    if (operation === 'tombstone')
      await tombstoneParentAttachments(transaction, objectId, timestamp);
    const outbox: SyncOutboxRecord = {
      logicalObjectId,
      eventId,
      entityType,
      objectId,
      transportObjectId,
      baseRevision,
      proposedRevision: revision,
      operation,
      keyEpoch: settings.currentKeyEpoch,
      hlcWallTime: hlc.wallTime,
      hlcLogical: hlc.logical,
      serializedPayload,
      encryptedPayload: null,
      encryptedNonce: null,
      state: 'pending',
      retryCount: 0,
      nextAttemptAt: timestamp,
      leaseUntil: null,
      lastErrorCode: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const meta: SyncObjectMetaRecord = {
      retainedRecord:
        operation === 'upsert' || Object.keys(sourceRecord).length > 1
          ? (sourceRecord as Readonly<Record<string, unknown>>)
          : (currentMeta?.retainedRecord ?? null),
      logicalObjectId,
      objectId,
      transportObjectId,
      eventId,
      entityType,
      schemaVersion,
      revision,
      baseRevision,
      lastSyncedRevision: currentMeta?.lastSyncedRevision ?? 0,
      modifiedAt: timestamp,
      modifiedByDevice: settings.deviceId,
      keyEpoch: settings.currentKeyEpoch,
      deleted: operation === 'tombstone',
      hlcWallTime: hlc.wallTime,
      hlcLogical: hlc.logical,
      syncStatus: 'pending',
    };
    const clockRecord: SyncPilotClockRecord = {
      id: 'pilot-clock',
      wallTime: hlc.wallTime,
      logical: hlc.logical,
      updatedAt: timestamp,
    };
    await Promise.all([
      request(transaction.objectStore(LIFE_OS_SYNC_STORE.outbox).add(outbox)),
      request(transaction.objectStore(LIFE_OS_SYNC_STORE.objectMeta).put(meta)),
      request(transaction.objectStore(LIFE_OS_SYNC_STORE.settings).put(clockRecord)),
    ]);
    return true;
  }
}

function isActiveInstallation(
  settings: SyncSettingsRecord | undefined,
): settings is SyncSettingsRecord & { readonly currentKeyEpoch: number } {
  return (
    (settings?.setupState === 'configured' || settings?.setupState === 'rotation_pending') &&
    settings.membershipStatus === 'active' &&
    settings.spaceId !== null &&
    settings.currentKeyEpoch !== null
  );
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error));
  });
}
