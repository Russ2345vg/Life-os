import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { SyncApplicationService } from '../../application/sync/SyncApplicationService';
import { AccountSyncService } from '../../application/sync/account/AccountSyncService';
import { UnavailableAccountSync } from '../../infrastructure/sync/UnavailableSyncApplication';
import { createLifeOsSyncApplication } from './createLifeOsSyncApplication';

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauri.invoke,
  isTauri: tauri.isTauri,
}));

describe('createLifeOsSyncApplication', () => {
  beforeEach(() => {
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    tauri.isTauri.mockReturnValue(false);
    tauri.invoke.mockReset();
    vi.unstubAllGlobals();
  });

  it('keeps configured sync unavailable outside the Tauri runtime', async () => {
    const applications = createLifeOsSyncApplication({
      database: new LifeOsIndexedDb(new IDBFactory()),
      clock: new FakeClock(new Date('2026-09-04T00:00:00.000Z')),
      idGenerator: new FakeIdGenerator('sync-browser'),
      environment: {
        VITE_LIFEOS_SUPABASE_URL: 'https://example.supabase.co',
        VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-test-value',
      },
    });

    await expect(applications.sync.loadOverview()).rejects.toMatchObject({
      code: 'sync.unavailable',
    });
    await expect(applications.accountSync.load()).resolves.toMatchObject({
      state: 'local_anonymous',
      email: null,
      connection: 'local',
    });
    await expect(applications.accountSync.beginRegistration('person@example.com')).rejects.toMatchObject({
      code: 'account.unavailable',
      message: 'Синхронизация доступна только в приложении LifeOS.',
    });
  });

  it('keeps anonymous sync active while account enrollment is feature-flagged off', async () => {
    tauri.isTauri.mockReturnValue(true);
    const applications = createLifeOsSyncApplication({
      database: new LifeOsIndexedDb(new IDBFactory()),
      clock: new FakeClock(new Date('2026-09-04T00:00:00.000Z')),
      idGenerator: new FakeIdGenerator('sync-flag-off'),
      environment: {
        VITE_LIFEOS_SUPABASE_URL: 'https://example.supabase.co',
        VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-test-value',
      },
    });

    expect(applications.sync).toBeInstanceOf(SyncApplicationService);
    expect(applications.accountSync).toBeInstanceOf(UnavailableAccountSync);
    await applications.sync.close();
  });

  it('constructs one account service on top of the configured sync runtime', async () => {
    tauri.isTauri.mockReturnValue(true);
    const applications = createLifeOsSyncApplication({
      database: new LifeOsIndexedDb(new IDBFactory()),
      clock: new FakeClock(new Date('2026-09-04T00:00:00.000Z')),
      idGenerator: new FakeIdGenerator('sync-account'),
      environment: {
        VITE_LIFEOS_SUPABASE_URL: 'https://example.supabase.co',
        VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-test-value',
        VITE_LIFEOS_ACCOUNT_SYNC_ENABLED: 'true',
      },
    });

    expect(applications.sync).toBeInstanceOf(SyncApplicationService);
    expect(applications.accountSync).toBeInstanceOf(AccountSyncService);
    await applications.sync.close();
  });
});
