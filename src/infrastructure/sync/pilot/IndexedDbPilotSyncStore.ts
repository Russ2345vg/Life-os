import {
  registerRemoteAttachment,
  tombstoneParentAttachments,
} from '../attachments/AttachmentRegistration';
import {
  HybridLogicalClock,
  parsePilotSyncPayload,
  serializePilotSyncPayload,
  resolvePilotConflict,
  type PilotConflictDecision,
  type PilotEntityType,
  type PilotSyncPayload,
} from '../../../application/sync/pilot';
import type { PilotCryptoEnvelope } from '../../../application/sync/ports/SyncCryptoService';
import type { PilotRemoteEvent } from '../../../application/sync/ports/PilotSyncTransport';
import { DomainError } from '../../../shared/errors/DomainError';
import { LIFE_OS_SYNC_STORE, LifeOsIndexedDb } from '../../persistence/indexed-db/LifeOsIndexedDb';
import type {
  SyncAppliedEventRecord,
  SyncConflictRecord,
  SyncCursorRecord,
  SyncObjectMetaRecord,
  SyncOutboxRecord,
  SyncPilotClockRecord,
  SyncQuarantineRecord,
  SyncSettingsRecord,
} from '../../persistence/records/SyncStoreRecords';
import {
  haveSamePilotSemanticContent,
  PILOT_RUNTIME_REGISTRY,
  pilotRelationshipReferences,
  pilotRegistrationFor,
  pilotStoreFor,
  prepareRemotePilotRecord,
} from './PilotSyncRegistryAdapters';
import {
  canonicalSyncRecord,
  IDENTITY_READ_STORES,
  isDateSingleton,
  rememberSyncIdentity,
  resolveSyncIdentity,
  translateSyncRecord,
} from './StructuredSyncIdentity';

export interface PilotLocalState {
  readonly meta: SyncObjectMetaRecord | null;
  readonly record: Readonly<Record<string, unknown>> | null;
}

interface MeaningfulSettingsRemoteApply {
  stageRemote(transaction: IDBTransaction, value: Readonly<Record<string, unknown>>): boolean;
  materializeRemote(): Promise<boolean>;
}

export class IndexedDbPilotSyncStore {
  public constructor(
    private readonly indexedDb: LifeOsIndexedDb,
    private readonly createId: () => string = () => globalThis.crypto.randomUUID(),
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = () => Math.random(),
    private readonly settingsSync: MeaningfulSettingsRemoteApply | null = null,
  ) {}

  public async installation(): Promise<SyncSettingsRecord | null> {
    const database = await this.indexedDb.open();
    return (await one<SyncSettingsRecord>(database, LIFE_OS_SYNC_STORE.settings, 'sync')) ?? null;
  }

  public async counts(): Promise<{
    readonly pending: number;
    readonly conflicts: number;
    readonly quarantined: number;
  }> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      [LIFE_OS_SYNC_STORE.outbox, LIFE_OS_SYNC_STORE.conflicts, LIFE_OS_SYNC_STORE.quarantine],
      'readonly',
    );
    const [outbox, conflicts, quarantine] = await Promise.all([
      request<SyncOutboxRecord[]>(transaction.objectStore(LIFE_OS_SYNC_STORE.outbox).getAll()),
      request<SyncConflictRecord[]>(transaction.objectStore(LIFE_OS_SYNC_STORE.conflicts).getAll()),
      request<SyncQuarantineRecord[]>(
        transaction.objectStore(LIFE_OS_SYNC_STORE.quarantine).getAll(),
      ),
    ]);
    await done(transaction);
    return {
      pending: outbox.filter(({ state }) => state !== 'quarantined').length,
      conflicts: conflicts.filter(({ resolutionStatus }) => resolutionStatus === 'unresolved')
        .length,
      quarantined:
        outbox.filter(({ state }) => state === 'quarantined').length +
        quarantine.filter(({ state }) => state === 'attention').length,
    };
  }

  public async lease(limit = 25, leaseMs = 30_000): Promise<readonly SyncOutboxRecord[]> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_SYNC_STORE.outbox);
    const records = await request<SyncOutboxRecord[]>(store.getAll());
    const now = this.now();
    const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    const eligible = records
      .filter((record) => record.state !== 'quarantined')
      .filter((record) => record.nextAttemptAt <= now.toISOString())
      .filter(
        (record) =>
          record.state === 'pending' ||
          record.leaseUntil === null ||
          record.leaseUntil <= now.toISOString(),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit)
      .map((record) => ({
        ...record,
        state: 'sending' as const,
        leaseUntil,
        updatedAt: now.toISOString(),
      }));
    for (const record of eligible) store.put(record);
    await done(transaction);
    return eligible;
  }

  public async prepareOutboxForInstallation(input: {
    readonly deviceId: string;
    readonly keyEpoch: number;
  }): Promise<void> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      [LIFE_OS_SYNC_STORE.outbox, LIFE_OS_SYNC_STORE.objectMeta],
      'readwrite',
    );
    const outboxStore = transaction.objectStore(LIFE_OS_SYNC_STORE.outbox);
    const metaStore = transaction.objectStore(LIFE_OS_SYNC_STORE.objectMeta);
    const records = await request<SyncOutboxRecord[]>(outboxStore.getAll());
    const timestamp = this.now().toISOString();
    for (const record of records) {
      let payload: PilotSyncPayload;
      try {
        payload = parsePilotSyncPayload(record.serializedPayload);
      } catch {
        outboxStore.put({
          ...record,
          state: 'quarantined',
          leaseUntil: null,
          lastErrorCode: 'sync.pilot_payload_invalid',
          updatedAt: timestamp,
        });
        continue;
      }
      if (!outboxMatchesPayload(record, payload)) {
        outboxStore.put({
          ...record,
          state: 'quarantined',
          leaseUntil: null,
          lastErrorCode: 'sync.pilot_payload_invalid',
          updatedAt: timestamp,
        });
        continue;
      }
      if (payload.originDeviceId === input.deviceId && payload.keyEpoch === input.keyEpoch) {
        continue;
      }
      if ((record.encryptedPayload === null) !== (record.encryptedNonce === null)) {
        outboxStore.put({
          ...record,
          state: 'quarantined',
          leaseUntil: null,
          lastErrorCode: 'sync.pilot_payload_invalid',
          updatedAt: timestamp,
        });
        continue;
      }
      if (record.encryptedPayload !== null) {
        outboxStore.put({
          ...record,
          state: 'pending',
          retryCount: 0,
          nextAttemptAt: timestamp,
          leaseUntil: null,
          lastErrorCode: null,
          updatedAt: timestamp,
        });
        continue;
      }
      const updated = rematerializeOutboxRecord(record, payload, input, timestamp);
      outboxStore.put(updated);
      const meta = await request<SyncObjectMetaRecord | undefined>(metaStore.get(record.objectId));
      if (meta?.eventId === record.eventId) {
        metaStore.put(rematerializedMeta(meta, input));
      }
    }
    await done(transaction);
  }

  public async rematerializeOutboxEvent(
    eventId: string,
    input: { readonly deviceId: string; readonly keyEpoch: number },
  ): Promise<SyncOutboxRecord> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      [LIFE_OS_SYNC_STORE.outbox, LIFE_OS_SYNC_STORE.objectMeta],
      'readwrite',
    );
    const outboxStore = transaction.objectStore(LIFE_OS_SYNC_STORE.outbox);
    const metaStore = transaction.objectStore(LIFE_OS_SYNC_STORE.objectMeta);
    const record = await required<SyncOutboxRecord>(outboxStore, eventId);
    const timestamp = this.now().toISOString();
    let payload: PilotSyncPayload;
    try {
      payload = parsePilotSyncPayload(record.serializedPayload);
    } catch (error: unknown) {
      transaction.abort();
      await doneAfterAbort(transaction);
      throw error;
    }
    if (!outboxMatchesPayload(record, payload)) {
      transaction.abort();
      await doneAfterAbort(transaction);
      throw new DomainError(
        'sync.pilot_payload_invalid',
        'Outbox metadata does not match its canonical payload.',
      );
    }
    const updated = rematerializeOutboxRecord(record, payload, input, timestamp);
    outboxStore.put(updated);
    const meta = await request<SyncObjectMetaRecord | undefined>(metaStore.get(record.objectId));
    if (meta?.eventId === record.eventId) {
      metaStore.put(rematerializedMeta(meta, input));
    }
    await done(transaction);
    return updated;
  }

  public async saveEncrypted(
    eventId: string,
    envelope: PilotCryptoEnvelope,
  ): Promise<SyncOutboxRecord> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_SYNC_STORE.outbox);
    const record = await required<SyncOutboxRecord>(store, eventId);
    if (record.encryptedPayload !== null || record.encryptedNonce !== null) {
      if (
        record.encryptedPayload !== envelope.ciphertext ||
        record.encryptedNonce !== envelope.nonce
      ) {
        transaction.abort();
        throw new Error('Immutable pilot ciphertext mismatch.');
      }
      await doneAfterAbort(transaction);
      return record;
    }
    const updated = {
      ...record,
      encryptedPayload: envelope.ciphertext,
      encryptedNonce: envelope.nonce,
      updatedAt: this.now().toISOString(),
    };
    store.put(updated);
    await done(transaction);
    return updated;
  }

  public async acknowledgePush(
    eventId: string,
    sequence: number,
    isCurrentWinner: boolean,
  ): Promise<void> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      [LIFE_OS_SYNC_STORE.outbox, LIFE_OS_SYNC_STORE.objectMeta, LIFE_OS_SYNC_STORE.appliedEvents],
      'readwrite',
    );
    const outbox = transaction.objectStore(LIFE_OS_SYNC_STORE.outbox);
    const record = await request<SyncOutboxRecord | undefined>(outbox.get(eventId));
    if (record === undefined) {
      await done(transaction);
      return;
    }
    outbox.delete(eventId);
    transaction.objectStore(LIFE_OS_SYNC_STORE.appliedEvents).put({
      eventId,
      objectId: record.objectId,
      revision: record.proposedRevision,
      sequence,
      appliedAt: this.now().toISOString(),
    } satisfies SyncAppliedEventRecord);
    const metaStore = transaction.objectStore(LIFE_OS_SYNC_STORE.objectMeta);
    const meta = await request<SyncObjectMetaRecord | undefined>(metaStore.get(record.objectId));
    if (meta?.revision === record.proposedRevision) {
      metaStore.put({
        ...meta,
        lastSyncedRevision: record.proposedRevision,
        syncStatus: isCurrentWinner ? 'synced' : 'attention',
      });
    }
    await done(transaction);
  }

  public async retry(eventId: string, errorCode: string): Promise<void> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_SYNC_STORE.outbox);
    const record = await request<SyncOutboxRecord | undefined>(store.get(eventId));
    if (record !== undefined) {
      const retryCount = record.retryCount + 1;
      const exponentialDelay = Math.min(60_000, 1_000 * 2 ** Math.min(retryCount, 6));
      const delay = Math.round(exponentialDelay * (0.75 + this.random() * 0.5));
      store.put({
        ...record,
        state: 'pending',
        retryCount,
        nextAttemptAt: new Date(this.now().getTime() + delay).toISOString(),
        leaseUntil: null,
        lastErrorCode: errorCode,
        updatedAt: this.now().toISOString(),
      });
    }
    await done(transaction);
  }

  public async quarantineOutbox(eventId: string, errorCode: string): Promise<void> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_SYNC_STORE.outbox);
    const record = await request<SyncOutboxRecord | undefined>(store.get(eventId));
    if (record !== undefined) {
      store.put({
        ...record,
        state: 'quarantined',
        leaseUntil: null,
        lastErrorCode: errorCode,
        updatedAt: this.now().toISOString(),
      });
    }
    await done(transaction);
  }

  public async localState(
    entityType: PilotEntityType,
    objectId: string,
    incomingRecord?: Readonly<Record<string, unknown>> | null,
  ): Promise<PilotLocalState> {
    const database = await this.indexedDb.open();
    const storeName = localStateStoreFor(entityType);
    const transaction = database.transaction(
      [...new Set([storeName, LIFE_OS_SYNC_STORE.objectMeta, ...IDENTITY_READ_STORES])],
      'readonly',
    );
    const identity = await resolveSyncIdentity(transaction, entityType, objectId, incomingRecord);
    const record = identity.existing;
    const meta = await request<SyncObjectMetaRecord | undefined>(
      transaction.objectStore(LIFE_OS_SYNC_STORE.objectMeta).get(identity.localObjectId),
    );
    await done(transaction);
    return { record: record ?? null, meta: meta ?? null };
  }

  public async hasApplied(eventId: string): Promise<boolean> {
    const database = await this.indexedDb.open();
    return (await one(database, LIFE_OS_SYNC_STORE.appliedEvents, eventId)) !== undefined;
  }

  public async hasSameSemanticContent(
    entityType: PilotEntityType,
    local: Readonly<Record<string, unknown>>,
    incoming: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const tx = database.transaction(IDENTITY_READ_STORES, 'readonly');
    const same = await sameCanonicalContent(tx, entityType, local, incoming);
    await done(tx);
    return same;
  }

  public async cursor(spaceId: string): Promise<number> {
    const database = await this.indexedDb.open();
    return (
      (await one<SyncCursorRecord>(database, LIFE_OS_SYNC_STORE.cursor, spaceId))?.lastSequence ?? 0
    );
  }

  public async advanceAppliedDuplicate(spaceId: string, sequence: number): Promise<void> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.cursor, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_SYNC_STORE.cursor);
    const current = await request<SyncCursorRecord | undefined>(store.get(spaceId));
    store.put({
      spaceId,
      lastSequence: Math.max(sequence, current?.lastSequence ?? 0),
      updatedAt: this.now().toISOString(),
    } satisfies SyncCursorRecord);
    await done(transaction);
  }

  public async deferRemoteEvent(spaceId: string, event: PilotRemoteEvent): Promise<void> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      [LIFE_OS_SYNC_STORE.quarantine, LIFE_OS_SYNC_STORE.cursor],
      'readwrite',
    );
    transaction.objectStore(LIFE_OS_SYNC_STORE.quarantine).put({
      quarantineId: deferredId(spaceId, event.sequence),
      entityType: 'pilot_encrypted',
      objectId: event.metadata.objectId,
      reason: 'sync.pilot_dependency_missing',
      encryptedPayload: event.ciphertext,
      sequence: event.sequence,
      state: 'deferred',
      createdAt: this.now().toISOString(),
      spaceId,
      deferredEvent: event,
    } satisfies SyncQuarantineRecord);
    const cursorStore = transaction.objectStore(LIFE_OS_SYNC_STORE.cursor);
    const current = await request<SyncCursorRecord | undefined>(cursorStore.get(spaceId));
    cursorStore.put({
      spaceId,
      lastSequence: Math.max(event.sequence, current?.lastSequence ?? 0),
      updatedAt: this.now().toISOString(),
    } satisfies SyncCursorRecord);
    await done(transaction);
  }

  public async deferredRemoteEvents(spaceId: string): Promise<readonly PilotRemoteEvent[]> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.quarantine, 'readonly');
    const records = await request<SyncQuarantineRecord[]>(
      transaction.objectStore(LIFE_OS_SYNC_STORE.quarantine).getAll(),
    );
    await done(transaction);
    return records
      .filter(
        (record): record is SyncQuarantineRecord & { readonly deferredEvent: PilotRemoteEvent } =>
          record.state === 'deferred' &&
          record.spaceId === spaceId &&
          record.deferredEvent !== undefined &&
          record.deferredEvent !== null,
      )
      .map(({ deferredEvent }) => deferredEvent)
      .sort((left, right) => left.sequence - right.sequence);
  }

  public async removeDeferredRemoteEvent(spaceId: string, sequence: number): Promise<void> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.quarantine, 'readwrite');
    transaction.objectStore(LIFE_OS_SYNC_STORE.quarantine).delete(deferredId(spaceId, sequence));
    await done(transaction);
  }

  public async applyPulled(
    spaceId: string,
    sequence: number,
    incomingPayload: PilotSyncPayload,
    transportObjectId: string,
    decision: PilotConflictDecision,
  ): Promise<void> {
    let payload = incomingPayload;
    const database = await this.indexedDb.open();
    const registration = pilotRegistrationFor(payload.entityType);
    const domainStoreName =
      registration.storageKind === 'local_storage'
        ? LIFE_OS_SYNC_STORE.settings
        : registration.storeName;
    const storeNames = new Set<string>([
      ...PILOT_RUNTIME_REGISTRY.filter(
        ({ registration }) => registration.storageKind === 'indexed_db',
      ).map(({ registration }) => registration.storeName),
      domainStoreName,
      LIFE_OS_SYNC_STORE.objectMeta,
      LIFE_OS_SYNC_STORE.appliedEvents,
      LIFE_OS_SYNC_STORE.cursor,
      LIFE_OS_SYNC_STORE.conflicts,
      LIFE_OS_SYNC_STORE.settings,
      LIFE_OS_SYNC_STORE.attachmentQueue,
    ]);
    const transaction = await this.indexedDb.withMutationCaptureSuppressed(async () =>
      database.transaction([...storeNames], 'readwrite'),
    );
    const completion = done(transaction);
    // Observe abort immediately, including while a mapper/dependency check is awaiting a request.
    void completion.catch(() => undefined);
    try {
      const domainStore = transaction.objectStore(domainStoreName);
      const identity = await resolveSyncIdentity(
        transaction,
        payload.entityType,
        payload.objectId,
        payload.record,
      );
      const existingRecord = identity.existing;
      const metaStore = transaction.objectStore(LIFE_OS_SYNC_STORE.objectMeta);
      const localMeta = await request<SyncObjectMetaRecord | undefined>(
        metaStore.get(identity.localObjectId),
      );
      {
        const equivalent =
          payload.record !== null &&
          existingRecord !== undefined &&
          (await sameCanonicalContent(
            transaction,
            payload.entityType,
            existingRecord,
            payload.record,
          ));
        if (
          isDateSingleton(payload.entityType) &&
          existingRecord !== undefined &&
          localMeta === undefined &&
          !equivalent
        ) {
          throw new DomainError(
            'sync.pilot_dependency_missing',
            'Local singleton requires bootstrap metadata before conflict resolution.',
          );
        }
        decision = equivalent
          ? { kind: 'equivalent' }
          : resolvePilotConflict(
              localMeta === undefined
                ? null
                : {
                    eventId: localMeta.eventId,
                    revision: localMeta.revision,
                    baseRevision: localMeta.baseRevision,
                    hlcWallTime: localMeta.hlcWallTime,
                    hlcLogical: localMeta.hlcLogical,
                    deviceId: localMeta.modifiedByDevice ?? '',
                    operation: localMeta.deleted ? 'tombstone' : 'upsert',
                  },
              {
                eventId: payload.eventId,
                revision: payload.revision,
                baseRevision: payload.baseRevision,
                hlcWallTime: payload.hlc.wallTime,
                hlcLogical: payload.hlc.logical,
                deviceId: payload.originDeviceId,
                operation: payload.operation,
              },
            );
      }
      payload = {
        ...payload,
        objectId: identity.localObjectId,
        record:
          payload.record === null
            ? null
            : await translateSyncRecord(
                transaction,
                payload.entityType,
                payload.record,
                'local',
                identity.localObjectId,
              ),
      };
      await rememberSyncIdentity(
        transaction,
        payload.entityType,
        incomingPayload.objectId,
        identity.logicalObjectId,
        identity.localObjectId,
      );
      const incomingWins =
        decision.kind === 'fast_forward' ||
        (decision.kind === 'equivalent' && localMeta === undefined) ||
        (decision.kind === 'conflict' && decision.winner === 'incoming');
      if (decision.kind === 'conflict') {
        const losingPayload = incomingWins ? (existingRecord ?? null) : incomingPayload.record;
        transaction.objectStore(LIFE_OS_SYNC_STORE.conflicts).put({
          conflictId: this.createId(),
          spaceId,
          entityType: payload.entityType,
          objectId: payload.objectId,
          winningRevision: incomingWins ? payload.revision : (localMeta?.revision ?? 0),
          losingRevision: incomingWins ? (localMeta?.revision ?? 0) : payload.revision,
          winningEventId: incomingWins ? payload.eventId : (localMeta?.eventId ?? 'local'),
          winningDeviceId: incomingWins
            ? payload.originDeviceId
            : (localMeta?.modifiedByDevice ?? 'local'),
          losingDeviceId: incomingWins
            ? (localMeta?.modifiedByDevice ?? 'local')
            : payload.originDeviceId,
          losingPayload,
          payloadIdentity: incomingWins ? 'local' : 'logical',
          resolutionStatus: 'unresolved',
          createdAt: this.now().toISOString(),
          resolvedAt: null,
        } satisfies SyncConflictRecord);
      }
      if (incomingWins) {
        await assertRelationshipSafety(transaction, payload);
        if (payload.operation === 'tombstone') {
          if (registration.storageKind === 'local_storage') {
            throw new DomainError(
              'sync.pilot_payload_invalid',
              'Meaningful settings use versioned upserts and cannot be tombstoned.',
            );
          }
          domainStore.delete(payload.objectId);
          await tombstoneParentAttachments(transaction, payload.objectId, this.now().toISOString());
        } else if (payload.record !== null) {
          let prepared = prepareRemotePilotRecord(
            payload.entityType,
            payload.record,
            existingRecord,
          );
          prepared = await registerRemoteAttachment(
            transaction,
            payload.entityType,
            prepared,
            spaceId,
            this.now().toISOString(),
          );
          if (registration.storageKind === 'local_storage') {
            if (
              this.settingsSync === null ||
              !this.settingsSync.stageRemote(transaction, prepared)
            ) {
              throw new DomainError(
                'sync.pilot_payload_invalid',
                'Meaningful settings could not be applied locally.',
              );
            }
          }
          domainStore.put(prepared);
        }
        metaStore.put({
          retainedRecord:
            payload.operation === 'tombstone'
              ? (existingRecord ?? localMeta?.retainedRecord ?? null)
              : payload.record,
          logicalObjectId: identity.logicalObjectId,
          objectId: payload.objectId,
          transportObjectId,
          eventId: payload.eventId,
          entityType: payload.entityType,
          schemaVersion: payload.schemaVersion,
          revision: payload.revision,
          baseRevision: payload.baseRevision,
          lastSyncedRevision: payload.revision,
          modifiedAt: this.now().toISOString(),
          modifiedByDevice: payload.originDeviceId,
          keyEpoch: payload.keyEpoch,
          deleted: payload.operation === 'tombstone',
          hlcWallTime: payload.hlc.wallTime,
          hlcLogical: payload.hlc.logical,
          syncStatus: 'synced',
        } satisfies SyncObjectMetaRecord);
      } else if (decision.kind === 'equivalent' && localMeta !== undefined) {
        const advancesRevision =
          payload.baseRevision === localMeta.revision &&
          payload.revision === localMeta.revision + 1;
        metaStore.put({
          ...(advancesRevision
            ? {
                ...localMeta,
                eventId: payload.eventId,
                revision: payload.revision,
                baseRevision: payload.baseRevision,
                modifiedAt: this.now().toISOString(),
                modifiedByDevice: payload.originDeviceId,
                keyEpoch: payload.keyEpoch,
                hlcWallTime: payload.hlc.wallTime,
                hlcLogical: payload.hlc.logical,
                syncStatus: 'synced' as const,
              }
            : localMeta),
          logicalObjectId: identity.logicalObjectId,
          transportObjectId:
            localMeta.transportObjectId.localeCompare(transportObjectId) <= 0
              ? localMeta.transportObjectId
              : transportObjectId,
          lastSyncedRevision: Math.max(localMeta.lastSyncedRevision, payload.revision),
        } satisfies SyncObjectMetaRecord);
      }
      transaction.objectStore(LIFE_OS_SYNC_STORE.appliedEvents).put({
        eventId: payload.eventId,
        objectId: payload.objectId,
        revision: payload.revision,
        sequence,
        appliedAt: this.now().toISOString(),
      } satisfies SyncAppliedEventRecord);
      const cursorStore = transaction.objectStore(LIFE_OS_SYNC_STORE.cursor);
      const currentCursor = await request<SyncCursorRecord | undefined>(cursorStore.get(spaceId));
      cursorStore.put({
        spaceId,
        lastSequence: Math.max(sequence, currentCursor?.lastSequence ?? 0),
        updatedAt: this.now().toISOString(),
      } satisfies SyncCursorRecord);
      await this.mergeClock(transaction, payload.hlc);
      if (incomingWins) await this.indexedDb.refreshBalanceSnapshots(transaction);
      await completion;
      if (registration.storageKind === 'local_storage' && incomingWins) {
        if (!(await this.settingsSync?.materializeRemote())) {
          throw new DomainError(
            'sync.pilot_payload_invalid',
            'Meaningful settings await local materialization.',
          );
        }
      }
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // A failed IndexedDB request may already have aborted the transaction.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }

  public async quarantine(
    sequence: number,
    reason: string,
    encryptedPayload: string,
  ): Promise<void> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.quarantine, 'readwrite');
    transaction.objectStore(LIFE_OS_SYNC_STORE.quarantine).put({
      quarantineId: this.createId(),
      entityType: 'pilot_encrypted',
      objectId: null,
      reason,
      encryptedPayload,
      sequence,
      state: 'attention',
      createdAt: this.now().toISOString(),
      spaceId: null,
      deferredEvent: null,
    } satisfies SyncQuarantineRecord);
    await done(transaction);
  }

  private async mergeClock(
    transaction: IDBTransaction,
    remote: PilotSyncPayload['hlc'],
  ): Promise<void> {
    const store = transaction.objectStore(LIFE_OS_SYNC_STORE.settings);
    const current = await request<SyncPilotClockRecord | undefined>(store.get('pilot-clock'));
    const clock = new HybridLogicalClock(
      current === undefined ? { wallTime: 0, logical: 0 } : current,
    );
    const merged = clock.merge(remote, this.now().getTime());
    store.put({
      id: 'pilot-clock',
      ...merged,
      updatedAt: this.now().toISOString(),
    } satisfies SyncPilotClockRecord);
  }
}

function outboxMatchesPayload(record: SyncOutboxRecord, payload: PilotSyncPayload): boolean {
  return (
    payload.entityType === record.entityType &&
    payload.objectId === (record.logicalObjectId ?? record.objectId) &&
    payload.eventId === record.eventId &&
    payload.operation === record.operation &&
    payload.keyEpoch === record.keyEpoch &&
    payload.baseRevision === record.baseRevision &&
    payload.revision === record.proposedRevision &&
    payload.hlc.wallTime === record.hlcWallTime &&
    payload.hlc.logical === record.hlcLogical
  );
}

async function sameCanonicalContent(
  tx: IDBTransaction,
  type: PilotEntityType,
  local: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
): Promise<boolean> {
  const left = { ...(await canonicalSyncRecord(tx, type, local)) };
  const right = { ...(await canonicalSyncRecord(tx, type, incoming)) };
  if (type === 'preparation_plan') {
    // Receiver-local optimistic versions and regeneration fingerprints are not user content.
    left.sourceVersion = right.sourceVersion = 1;
    left.generationSignature = right.generationSignature = 'sync-semantic';
    for (const record of [left, right]) {
      if (Array.isArray(record.items))
        record.items = record.items.map((item) => ({ ...item, id: `item:${String(item.key)}` }));
    }
  }
  return haveSamePilotSemanticContent(type, left, right);
}

function rematerializeOutboxRecord(
  record: SyncOutboxRecord,
  payload: PilotSyncPayload,
  input: { readonly deviceId: string; readonly keyEpoch: number },
  timestamp: string,
): SyncOutboxRecord {
  return {
    ...record,
    keyEpoch: input.keyEpoch,
    serializedPayload: serializePilotSyncPayload({
      ...payload,
      originDeviceId: input.deviceId,
      keyEpoch: input.keyEpoch,
    }),
    encryptedPayload: null,
    encryptedNonce: null,
    state: 'pending',
    retryCount: 0,
    nextAttemptAt: timestamp,
    leaseUntil: null,
    lastErrorCode: null,
    updatedAt: timestamp,
  };
}

function rematerializedMeta(
  meta: SyncObjectMetaRecord,
  input: { readonly deviceId: string; readonly keyEpoch: number },
): SyncObjectMetaRecord {
  return {
    ...meta,
    modifiedByDevice: input.deviceId,
    keyEpoch: input.keyEpoch,
    syncStatus: 'pending',
  };
}

function deferredId(spaceId: string, sequence: number): string {
  return `deferred:${spaceId}:${sequence}`;
}

function localStateStoreFor(entityType: PilotEntityType): string {
  const registration = pilotRegistrationFor(entityType);
  return registration.storageKind === 'local_storage'
    ? LIFE_OS_SYNC_STORE.settings
    : registration.storeName;
}

async function assertRelationshipSafety(
  transaction: IDBTransaction,
  payload: PilotSyncPayload,
): Promise<void> {
  if (payload.operation === 'upsert' && payload.record !== null) {
    for (const reference of pilotRelationshipReferences(payload.entityType, payload.record)) {
      if (reference.required) {
        const parent = await request<IDBValidKey | undefined>(
          transaction.objectStore(pilotStoreFor(reference.entityType)).getKey(reference.objectId),
        );
        if (parent === undefined) {
          throw dependencyMissing('Structured parent has not arrived yet.');
        }
      }
    }
  }
  if (payload.operation === 'tombstone') {
    for (const runtime of PILOT_RUNTIME_REGISTRY) {
      if (
        runtime.registration.storageKind !== 'indexed_db' ||
        !runtime.registration.dependencies.includes(payload.entityType)
      ) {
        continue;
      }
      const children = await request<Readonly<Record<string, unknown>>[]>(
        transaction.objectStore(runtime.registration.storeName).getAll(),
      );
      if (
        children.some((child) =>
          pilotRelationshipReferences(runtime.registration.entityType, child).some(
            (reference) =>
              reference.required &&
              reference.entityType === payload.entityType &&
              reference.objectId === payload.objectId,
          ),
        )
      ) {
        throw dependencyMissing('Structured parent still has local dependants.');
      }
    }
  }
}

function dependencyMissing(message: string): DomainError {
  return new DomainError('sync.pilot_dependency_missing', message);
}

async function one<T>(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const transaction = database.transaction(storeName, 'readonly');
  const result = await request<T | undefined>(transaction.objectStore(storeName).get(key));
  await done(transaction);
  return result;
}
async function required<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T> {
  const result = await request<T | undefined>(store.get(key));
  if (result === undefined) throw new Error('Required pilot sync record is missing.');
  return result;
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
async function doneAfterAbort(transaction: IDBTransaction): Promise<void> {
  try {
    await done(transaction);
  } catch {
    /* Expected abort. */
  }
}
