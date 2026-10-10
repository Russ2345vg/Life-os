import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbAutopilotSettingsStore } from '../../infrastructure/persistence/IndexedDbAutopilotSettingsStore';
import { AutopilotSettingsService } from './AutopilotSettingsService';

describe('autopilot settings service', () => {
  it('shows editable defaults without inventing the range or walk start', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const service = new AutopilotSettingsService(new IndexedDbAutopilotSettingsStore(db));
    expect((await service.getPreferences()).value).toMatchObject({
      maxActions: 5,
      morningMinutes: 30,
      eveningMinutes: 45,
      walk: { minutes: 30, startMinute: null },
    });
    expect((await service.getDraft('2026-10-10')).value).toMatchObject({
      date: '2026-10-10',
      wishes: '',
      startMinute: null,
      endMinute: null,
    });
    db.close();
  });
  it('does not overwrite the first saved draft when a second editor saves a stale version', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const service = new AutopilotSettingsService(new IndexedDbAutopilotSettingsStore(db));
    const draft = await service.getDraft('2026-10-10');
    const saved = await service.saveDraft({ ...draft.value, wishes: 'Порядок' }, draft.version);
    await expect(
      service.saveDraft({ ...draft.value, wishes: 'Старый текст' }, draft.version),
    ).rejects.toThrow();
    expect((await service.getDraft('2026-10-10')).value.wishes).toBe('Порядок');
    expect((await service.getDraft('2026-10-11')).value.wishes).toBe('');
    await expect(
      service.savePreferences({ ...(await service.getPreferences()).value, maxActions: 13 }, 0),
    ).rejects.toThrow();
    expect(saved.version).toBe(1);
    db.close();
  });
});
