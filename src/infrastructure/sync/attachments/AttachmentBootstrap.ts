import type { LifeOsIndexedDb } from '../../persistence/indexed-db/LifeOsIndexedDb';
import { LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncSettingsRecord } from '../../persistence/records/SyncStoreRecords';
import type { DurableAttachment } from '../../../application/sync/attachments/AttachmentContracts';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../pilot/IndexedDbPilotMutationRecorder';
import { done, request } from './AttachmentRegistration';

export async function bootstrapAttachments(
  database: LifeOsIndexedDb,
  recorder: IndexedDbPilotMutationRecorder,
): Promise<void> {
  const db = await database.open();
  const tx = db.transaction(
    [...new Set(['goals', 'walks', 'memoryEvents', ...PILOT_MUTATION_STORES])],
    'readwrite',
  );
  const completion = done(tx);
  void completion.catch(() => undefined);
  try {
    const settings = tx.objectStore(LIFE_OS_SYNC_STORE.settings);
    const installation = await request<SyncSettingsRecord | undefined>(settings.get('sync'));
    if (
      installation?.setupState !== 'configured' ||
      installation.membershipStatus !== 'active' ||
      !installation.spaceId
    ) {
      await completion;
      return;
    }
    const groups = [
      {
        checkpoint: `attachment-bootstrap:${installation.spaceId}`,
        types: ['goal', 'walk'] as const,
      },
      {
        checkpoint: `attachment-bootstrap:memory-v1:${installation.spaceId}`,
        types: ['memory_event'] as const,
      },
    ];
    for (const { checkpoint, types } of groups) {
      if (await request(settings.get(checkpoint))) continue;
      for (const type of types) {
        const records = await request<Record<string, unknown>[]>(
          tx
            .objectStore(type === 'goal' ? 'goals' : type === 'walk' ? 'walks' : 'memoryEvents')
            .getAll(),
        );
        for (const record of records) {
          const queued = await request<DurableAttachment[]>(
            tx
              .objectStore(LIFE_OS_SYNC_STORE.attachmentQueue)
              .index('byParentObjectId')
              .getAll(String(record.id)),
          );
          if (
            record[type === 'goal' ? 'coverImage' : 'photo'] &&
            !queued.some(
              (entry) => entry.spaceId === installation.spaceId && entry.deletedAt === null,
            )
          )
            await recorder.recordUpsert(tx, type, record);
        }
      }
      settings.put({ id: checkpoint, completedAt: new Date().toISOString() });
    }
    await completion;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already aborted. */
    }
    await completion.catch(() => undefined);
    throw error;
  }
}
