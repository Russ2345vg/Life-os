import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import { EntityId, LifeAction, LifeActionTitle, DayDate } from '../../domain';
import { LifeOsIndexedDb, LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import {
  prepareRemotePilotRecord,
  normalizePilotRecord,
} from '../sync/pilot/PilotSyncRegistryAdapters';
describe('planning compatibility', () => {
  it('preserves residual fields through sync, ordinary save and completion transaction', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    try {
      const opened = await db.open(),
        repo = new IndexedDbLifeActionRepository(db),
        action = LifeAction.createDraft({
          id: EntityId.create('a'),
          title: LifeActionTitle.create('Действие'),
          createdAt: new Date('2026-09-14T16:00:00Z'),
          eventId: EntityId.create('created'),
        });
      const raw = {
        ...LifeActionRecordMapper.toRecord(action),
        futureField: { kept: true },
        priority: 'high' as const,
      };
      const wire = normalizePilotRecord('life_action', raw),
        prepared = prepareRemotePilotRecord('life_action', wire);
      expect(prepared.futureField).toEqual({ kept: true });
      await executeIndexedDbRequest(opened, LIFE_OS_STORE.lifeActions, 'readwrite', (s) =>
        s.put(prepared),
      );
      let loaded = (await repo.findById(action.id))!;
      loaded.setPlan(DayDate.create('2026-09-15'), false);
      await repo.save(loaded);
      loaded = (await repo.findById(action.id))!;
      const version = loaded.version;
      loaded.complete(null, new Date('2026-09-15T01:00:00Z'), EntityId.create('done'));
      await new IndexedDbJournalUnitOfWork(db).commit({
        lifeActions: [{ lifeAction: loaded, expectedVersion: version }],
        journalEntries: [],
      });
      const saved = await executeIndexedDbRequest<Record<string, unknown>>(
        opened,
        LIFE_OS_STORE.lifeActions,
        'readonly',
        (s) => s.get('a'),
      );
      expect(saved.futureField).toEqual({ kept: true });
      expect(saved.priority).toBe('high');
      expect(saved.completedOn).toBe(loaded.completedOn);
      const old = { ...raw };
      delete (old as Record<string, unknown>).priority;
      const updated = prepareRemotePilotRecord(
        'life_action',
        normalizePilotRecord('life_action', old),
        saved,
      );
      expect(updated.priority).toBe('high');
    } finally {
      db.close();
    }
  });
});
