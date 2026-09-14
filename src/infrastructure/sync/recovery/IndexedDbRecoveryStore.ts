import type {
  RecoveryDataStore,
  RecoveryHistoryItem,
  RecoveryItem,
  RecoverySnapshot,
  RecoveryState,
} from '../../../application/sync/recovery/SyncRecovery';
import { normalizeGoalRecoveryState } from './normalizeGoalRecoveryState';
import type { DurableAttachment } from '../../../application/sync/attachments/AttachmentContracts';
import { attachmentReference } from '../../../application/sync/attachments/AttachmentContracts';
import type { PilotEntityType } from '../../../application/sync/pilot';
import {
  LIFE_OS_SYNC_STORE,
  type LifeOsIndexedDb,
} from '../../persistence/indexed-db/LifeOsIndexedDb';
import type {
  SyncConflictRecord,
  SyncObjectMetaRecord,
  SyncSettingsRecord,
} from '../../persistence/records/SyncStoreRecords';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../pilot/IndexedDbPilotMutationRecorder';
import {
  PILOT_RUNTIME_REGISTRY,
  normalizePilotRecord,
  pilotRelationshipReferences,
  prepareRemotePilotRecord,
  shouldSyncPilotRecord,
} from '../pilot/PilotSyncRegistryAdapters';
import {
  canonicalSyncRecord,
  resolveSyncIdentity,
  translateSyncRecord,
} from '../pilot/StructuredSyncIdentity';
import { done, request, registerRemoteAttachment } from '../attachments/AttachmentRegistration';
import type { MeaningfulLocalSettingsSync } from '../MeaningfulLocalSettingsSync';

const stores = [
  ...new Set([
    ...PILOT_MUTATION_STORES,
    LIFE_OS_SYNC_STORE.conflicts,
    ...PILOT_RUNTIME_REGISTRY.filter((r) => r.registration.storageKind === 'indexed_db').map(
      (r) => r.registration.storeName,
    ),
  ]),
];

export class IndexedDbRecoveryStore implements RecoveryDataStore {
  public normalize(state: RecoveryState): RecoveryState {
    return normalizeGoalRecoveryState(state);
  }
  public constructor(
    private readonly db: LifeOsIndexedDb,
    private readonly recorder: IndexedDbPilotMutationRecorder,
    private readonly settings: MeaningfulLocalSettingsSync | null = null,
    private readonly now = () => new Date(),
  ) {}
  public async context() {
    const db = await this.db.open();
    const tx = db.transaction(LIFE_OS_SYNC_STORE.settings, 'readonly');
    const value = await request<SyncSettingsRecord | undefined>(
      tx.objectStore(LIFE_OS_SYNC_STORE.settings).get('sync'),
    );
    if (
      value?.setupState !== 'configured' ||
      value.membershipStatus !== 'active' ||
      !value.spaceId ||
      !value.currentKeyEpoch
    )
      throw new Error('Настройте защищённую синхронизацию.');
    return { spaceId: value.spaceId, keyEpoch: value.currentKeyEpoch };
  }
  public async attachments(): Promise<DurableAttachment[]> {
    return this.all(LIFE_OS_SYNC_STORE.attachmentQueue);
  }
  public async snapshots(): Promise<RecoverySnapshot[]> {
    return (await this.all<RecoverySnapshot>(LIFE_OS_SYNC_STORE.snapshotMeta))
      .filter((s) => s.metadata?.purpose === 'snapshot')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  public async saveSnapshot(value: RecoverySnapshot): Promise<void> {
    const db = await this.db.open();
    const tx = db.transaction(LIFE_OS_SYNC_STORE.snapshotMeta, 'readwrite');
    const completion = done(tx);
    tx.objectStore(LIFE_OS_SYNC_STORE.snapshotMeta).put(value);
    await completion;
  }
  private async all<T>(name: string): Promise<T[]> {
    const db = await this.db.open();
    return request<T[]>(db.transaction(name, 'readonly').objectStore(name).getAll());
  }

  public async readState(): Promise<RecoveryState> {
    const db = await this.db.open();
    const tx = db.transaction(stores, 'readonly');
    const completion = done(tx);
    const state = await this.readTransaction(tx);
    await completion;
    return state;
  }
  private async readTransaction(tx: IDBTransaction): Promise<RecoveryState> {
    const items: RecoveryItem[] = [];
    const files = await request<DurableAttachment[]>(
      tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue).getAll(),
    );
    for (const { registration } of PILOT_RUNTIME_REGISTRY) {
      const { entityType } = registration;
      if (entityType === 'project') continue;
      const values =
        registration.storageKind === 'local_storage'
          ? [
              this.settings?.readCurrentForRecovery() ??
                (await request<Record<string, unknown> | undefined>(
                  tx.objectStore(LIFE_OS_SYNC_STORE.settings).get('lifeos-user-settings'),
                )),
            ].filter((r) => r !== undefined)
          : await request<Record<string, unknown>[]>(
              tx.objectStore(registration.storeName).getAll(),
            );
      for (const source of values) {
        if (!shouldSyncPilotRecord(entityType, source)) continue;
        let record = await canonicalSyncRecord(tx, entityType, source);
        if (entityType === 'goal' || entityType === 'walk') {
          const file = files.find((f) => f.parentObjectId === source.id && f.deletedAt === null);
          const image = source[entityType === 'goal' ? 'coverImage' : 'photo'];
          record = {
            ...record,
            syncAttachment: file
              ? {
                  attachmentId: file.attachmentId,
                  blobVersion: file.blobVersion,
                  keyEpoch: file.keyEpoch,
                }
              : (source.syncAttachment ?? null),
          };
          // Offline/unverified files have no guaranteed remote immutable version yet.
          if (image && !file?.cloudVerifiedAt) record = { ...record, syncSnapshotImage: image };
        }
        items.push({ entityType, record });
      }
    }
    return { schemaVersion: 1, items };
  }
  public validate(value: unknown): asserts value is RecoveryState {
    if (
      !value ||
      typeof value !== 'object' ||
      !('schemaVersion' in value) ||
      value.schemaVersion !== 1 ||
      !('items' in value) ||
      !Array.isArray(value.items)
    )
      throw new Error('Версия снимка не поддерживается.');
    const seen = new Set<string>();
    for (const candidate of value.items as unknown[]) {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        !('entityType' in candidate) ||
        !('record' in candidate) ||
        typeof candidate.entityType !== 'string'
      )
        throw new Error('Invalid recovery record.');
      const type = candidate.entityType as PilotEntityType;
      const record = normalizePilotRecord(type, candidate.record);
      const key = `${type}:${String(record.id)}`;
      if (seen.has(key)) throw new Error('Duplicate snapshot object.');
      seen.add(key);
      if (
        typeof candidate.record === 'object' &&
        candidate.record !== null &&
        'syncAttachment' in candidate.record
      )
        attachmentReference(candidate.record.syncAttachment);
    }
  }
  public async apply(
    state: RecoveryState,
    expected: string,
    exact: boolean,
    history?: { readonly kind: 'conflicts' | 'deleted'; readonly id: string },
  ): Promise<void> {
    this.validate(state);
    state = this.normalize(state);
    const context = await this.context();
    const db = await this.db.open();
    const tx = await this.db.withMutationCaptureSuppressed(async () =>
      db.transaction(stores, 'readwrite'),
    );
    const completion = done(tx);
    void completion.catch(() => undefined);
    try {
      const current = await this.readTransaction(tx);
      if (JSON.stringify(current) !== expected)
        throw new Error('Данные изменились. Откройте предпросмотр заново.');
      const intended = exact
        ? state.items
        : [
            ...current.items.filter((item) => !state.items.some((next) => same(item, next))),
            ...state.items,
          ];
      if (
        intended.filter(
          (i) => i.entityType === 'walk' && ['running', 'paused'].includes(String(i.record.status)),
        ).length > 1
      )
        throw new Error(
          'Восстановление создаёт больше одной активной прогулки. Сначала завершите текущую.',
        );
      if (
        intended.filter(
          (i) => i.entityType === 'routine_occurrence_execution' && i.record.status === 'running',
        ).length > 1
      )
        throw new Error(
          'Восстановление создаёт больше одной активной рутины. Сначала завершите текущую.',
        );
      for (const item of intended)
        for (const ref of pilotRelationshipReferences(item.entityType, item.record)) {
          if (
            ref.required &&
            !intended.some((p) => p.entityType === ref.entityType && p.record.id === ref.objectId)
          ) {
            const system =
              ref.entityType === 'exercise_definition'
                ? await request<Record<string, unknown> | undefined>(
                    tx.objectStore('exerciseDefinitions').get(ref.objectId),
                  )
                : undefined;
            if (system?.source !== 'SYSTEM')
              throw new Error('Restore requires a missing related record.');
          }
        }
      for (const { registration } of PILOT_RUNTIME_REGISTRY) {
        for (const item of state.items.filter((i) => i.entityType === registration.entityType)) {
          const id = await resolveSyncIdentity(
            tx,
            item.entityType,
            String(item.record.id),
            item.record,
          );
          const translated = await translateSyncRecord(
            tx,
            item.entityType,
            item.record,
            'local',
            id.localObjectId,
          );
          let prepared = prepareRemotePilotRecord(item.entityType, translated, id.existing);
          prepared = await registerRemoteAttachment(
            tx,
            item.entityType,
            prepared,
            context.spaceId,
            this.now().toISOString(),
          );
          if (
            item.record.syncSnapshotImage &&
            (item.entityType === 'goal' || item.entityType === 'walk')
          )
            prepared = {
              ...prepared,
              [item.entityType === 'goal' ? 'coverImage' : 'photo']: item.record.syncSnapshotImage,
            };
          const storeName =
            registration.storageKind === 'local_storage'
              ? LIFE_OS_SYNC_STORE.settings
              : registration.storeName;
          if (registration.storageKind === 'local_storage') {
            const prior = current.items.find((i) => i.entityType === 'user_settings')?.record;
            if (
              JSON.stringify(this.settings?.readCurrentForRecovery()) !== JSON.stringify(prior) ||
              !this.settings?.stageRemote(tx, prepared)
            )
              throw new Error('Settings changed during restore.');
          }
          tx.objectStore(storeName).put(prepared);
          if (!(await this.recorder.recordUpsert(tx, item.entityType, prepared)))
            throw new Error('Restore mutation not recorded.');
        }
      }
      if (exact)
        for (const { registration } of [...PILOT_RUNTIME_REGISTRY].reverse()) {
          for (const old of current.items.filter(
            (i) =>
              i.entityType === registration.entityType &&
              !state.items.some((target) => same(i, target)),
          )) {
            if (registration.storageKind === 'local_storage')
              throw new Error('Snapshot missing required settings.');
            const id = await resolveSyncIdentity(
              tx,
              old.entityType,
              String(old.record.id),
              old.record,
            );
            await this.recorder.recordTombstone(tx, old.entityType, id.localObjectId, id.existing);
            tx.objectStore(registration.storeName).delete(id.localObjectId);
          }
        }
      const snapshots = tx.objectStore('balanceMonthlySnapshots');
      const beforeBalance = await request<Readonly<Record<string, unknown>>[]>(snapshots.getAll());
      await this.db.refreshBalanceSnapshots(tx);
      const afterBalance = await request<Readonly<Record<string, unknown>>[]>(snapshots.getAll());
      for (const snapshot of afterBalance) {
        const previous = beforeBalance.find((old) => old.id === snapshot.id);
        if (
          JSON.stringify(previous) !== JSON.stringify(snapshot) &&
          !(await this.recorder.recordUpsert(tx, 'balance_monthly_snapshot', snapshot))
        )
          throw new Error('Balance history restore mutation not recorded.');
      }
      if (history?.kind === 'conflicts') {
        const conflict = await request<SyncConflictRecord | undefined>(
          tx.objectStore(LIFE_OS_SYNC_STORE.conflicts).get(history.id),
        );
        if (!conflict || conflict.spaceId !== context.spaceId)
          throw new Error('Conflict no longer available.');
        tx.objectStore(LIFE_OS_SYNC_STORE.conflicts).put({
          ...conflict,
          resolutionStatus: 'resolved',
          resolvedAt: this.now().toISOString(),
        });
      }
      await completion;
      this.recorder.notifyCommitted(true);
      if (this.settings && !(await this.settings.materializeRemote()))
        throw new Error('Settings restore is pending local materialization.');
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already completed/aborted. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }
  public async history(kind: 'conflicts' | 'deleted'): Promise<readonly RecoveryHistoryItem[]> {
    const context = await this.context();
    if (kind === 'conflicts')
      return (await this.all<SyncConflictRecord>(LIFE_OS_SYNC_STORE.conflicts))
        .filter((c) => c.spaceId === context.spaceId)
        .map((c) => ({
          id: c.conflictId,
          entityType: c.entityType as PilotEntityType,
          objectId: c.objectId,
          createdAt: c.createdAt,
          expiresAt: null,
          recoverable: c.losingPayload !== null,
          label: recordLabel(c.losingPayload),
          resolvedAt: c.resolvedAt,
        }));
    return (await this.all<SyncObjectMetaRecord>(LIFE_OS_SYNC_STORE.objectMeta))
      .filter((m) => m.deleted)
      .map((m) => {
        const expiresAt = new Date(Date.parse(m.modifiedAt) + 30 * 86400000).toISOString();
        return {
          id: m.objectId,
          objectId: m.objectId,
          entityType: m.entityType as PilotEntityType,
          createdAt: m.modifiedAt,
          expiresAt,
          recoverable: !!m.retainedRecord && Date.parse(expiresAt) > this.now().getTime(),
          label: recordLabel(m.retainedRecord ?? null),
        };
      });
  }
  public async inspect(kind: 'conflicts' | 'deleted', id: string): Promise<RecoveryItem> {
    const history = (await this.history(kind)).find((h) => h.id === id && h.recoverable);
    if (!history) throw new Error('Предыдущая версия недоступна для восстановления.');
    const db = await this.db.open();
    const tx = db.transaction(stores, 'readonly');
    const completion = done(tx);
    let record: Readonly<Record<string, unknown>>;
    let logical = false;
    if (kind === 'conflicts') {
      const conflict = await request<SyncConflictRecord>(
        tx.objectStore(LIFE_OS_SYNC_STORE.conflicts).get(id),
      );
      record = conflict.losingPayload!;
      logical = conflict.payloadIdentity === 'logical';
      // Legacy entries carry no format marker. Existing aliases safely canonicalize local/logical IDs.
    } else {
      const meta = await request<SyncObjectMetaRecord>(
        tx.objectStore(LIFE_OS_SYNC_STORE.objectMeta).get(id),
      );
      record = meta.retainedRecord!;
    }
    let normalized = logical
      ? normalizePilotRecord(history.entityType, record)
      : await canonicalSyncRecord(tx, history.entityType, record);
    const image = record[history.entityType === 'goal' ? 'coverImage' : 'photo'];
    if (history.entityType === 'goal' || history.entityType === 'walk')
      normalized = {
        ...normalized,
        syncAttachment: record.syncAttachment ?? null,
        ...(image ? { syncSnapshotImage: image } : {}),
      };
    await completion;
    return { entityType: history.entityType, record: normalized };
  }
}
function same(a: RecoveryItem, b: RecoveryItem): boolean {
  return a.entityType === b.entityType && a.record.id === b.record.id;
}
function recordLabel(record: Readonly<Record<string, unknown>> | null): string | null {
  if (!record) return null;
  for (const key of ['title', 'name', 'result', 'date']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.slice(0, 160);
  }
  return null;
}
