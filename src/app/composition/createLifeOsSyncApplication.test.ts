import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { createLifeOsSyncApplication } from './createLifeOsSyncApplication';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => false,
}));

describe('createLifeOsSyncApplication', () => {
  it('keeps configured sync unavailable outside the Tauri runtime', async () => {
    const sync = createLifeOsSyncApplication({
      database: new LifeOsIndexedDb(new IDBFactory()),
      clock: new FakeClock(new Date('2026-09-04T00:00:00.000Z')),
      idGenerator: new FakeIdGenerator('sync-browser'),
      environment: {
        VITE_LIFEOS_SUPABASE_URL: 'https://example.supabase.co',
        VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-test-value',
      },
    });

    await expect(sync.loadOverview()).rejects.toMatchObject({ code: 'sync.unavailable' });
  });
});
