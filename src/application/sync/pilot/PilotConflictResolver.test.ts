import { describe, expect, it } from 'vitest';
import { resolvePilotConflict, type PilotVersionMetadata } from './PilotConflictResolver';

const local: PilotVersionMetadata = {
  eventId: 'local',
  revision: 1,
  baseRevision: 0,
  hlcWallTime: 100,
  hlcLogical: 0,
  deviceId: 'device-a',
  operation: 'upsert',
};

describe('PilotConflictResolver', () => {
  it('fast-forwards the next valid revision', () => {
    expect(
      resolvePilotConflict(local, {
        ...local,
        eventId: 'remote',
        baseRevision: 1,
        revision: 2,
        hlcWallTime: 101,
      }),
    ).toEqual({ kind: 'fast_forward', winner: 'incoming' });
  });

  it('converges concurrent edits by HLC and device ID independent of arrival order', () => {
    const remote = { ...local, eventId: 'remote', deviceId: 'device-b' };
    expect(resolvePilotConflict(local, remote)).toEqual({ kind: 'conflict', winner: 'incoming' });
    expect(resolvePilotConflict(remote, local)).toEqual({ kind: 'conflict', winner: 'local' });
  });

  it('does not let an older offline update resurrect a newer tombstone', () => {
    const tombstone = {
      ...local,
      eventId: 'delete',
      revision: 2,
      baseRevision: 1,
      hlcWallTime: 200,
      operation: 'tombstone' as const,
    };
    const stale = { ...local, eventId: 'stale', hlcWallTime: 150 };
    expect(resolvePilotConflict(tombstone, stale)).toEqual({ kind: 'stale', winner: 'local' });
  });

  it('keeps a tombstone when an offline upsert based before deletion has a later HLC', () => {
    const tombstone = {
      ...local,
      eventId: 'delete',
      revision: 2,
      baseRevision: 1,
      hlcWallTime: 200,
      operation: 'tombstone' as const,
    };
    const staleOfflineUpsert = {
      ...local,
      eventId: 'offline-update',
      revision: 2,
      baseRevision: 1,
      hlcWallTime: 300,
    };

    expect(resolvePilotConflict(tombstone, staleOfflineUpsert)).toEqual({
      kind: 'stale',
      winner: 'local',
    });
  });

  it('does not let a later HLC overwrite local revision 7 with an event based on revision 5', () => {
    const localRevisionSeven: PilotVersionMetadata = {
      ...local,
      eventId: 'local-revision-7',
      baseRevision: 6,
      revision: 7,
    };
    const staleRemote: PilotVersionMetadata = {
      ...local,
      eventId: 'remote-based-on-5',
      baseRevision: 5,
      revision: 6,
      hlcWallTime: 300,
      deviceId: 'device-b',
    };

    expect(resolvePilotConflict(localRevisionSeven, staleRemote)).toEqual({
      kind: 'stale',
      winner: 'local',
    });
  });
});
