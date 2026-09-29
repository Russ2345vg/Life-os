import { describe, expect, it } from 'vitest';
import type { SyncStatusSnapshot } from '../../application/sync/SyncStatus';
import { presentAttachment, presentSyncStatus } from './syncStatusPresentation';

const data: SyncStatusSnapshot = {
  accountState: 'ready',
  accountEmail: 'person@example.com',
  configured: true,
  pending: 0,
  conflicts: 0,
  quarantined: 0,
  deferred: 0,
  attachments: [],
  pendingBackups: 0,
  failedBackups: 0,
};
const pilot = {
  state: 'idle' as const,
  pendingCount: 0,
  conflictCount: 0,
  lastSuccessfulSyncAt: null,
};
describe('final Sync status', () => {
  it('never claims green success for unavailable, first run, queued or deferred content', () => {
    expect(presentSyncStatus(pilot, null, true).state).toBe('local');
    expect(presentSyncStatus(pilot, data, true).state).toBe('pending');
    expect(
      presentSyncStatus(
        { ...pilot, lastSuccessfulSyncAt: '2026-09-08' },
        { ...data, pending: 2 },
        true,
      ).label,
    ).toContain('2 изменений');
    expect(presentSyncStatus(pilot, { ...data, deferred: 1 }, true).state).toBe('pending');
  });
  it('keeps offline calm and separates retained conflicts from errors', () => {
    expect(presentSyncStatus(pilot, { ...data, pending: 2 }, false).state).toBe('offline');
    expect(
      presentSyncStatus(
        { ...pilot, state: 'attention', lastSuccessfulSyncAt: '2026-09-08' },
        { ...data, conflicts: 7 },
        true,
      ).state,
    ).toBe('synced');
    expect(presentSyncStatus(pilot, { ...data, quarantined: 1 }, true).state).toBe('error');
  });
  it('asks for an update when synchronized data uses a newer client contract', () => {
    expect(
      presentSyncStatus(
        pilot,
        { ...data, setupIssue: 'client-update-required', quarantined: 1 },
        true,
      ),
    ).toMatchObject({
      state: 'attention',
      label: 'Обновите LifeOS для синхронизации новых данных',
    });
  });
  it('does not present a pending remote attachment as missing content', () => {
    expect(
      presentAttachment(
        {
          attachmentId: 'file',
          parentObjectId: 'goal',
          entityType: 'goal',
          state: 'pending-download',
          localAvailable: false,
        },
        false,
      ),
    ).toContain('сохранено');
    expect(presentAttachment(undefined, false)).toBeNull();
  });
});
