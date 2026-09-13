import type { PilotSyncTransport } from '../ports/PilotSyncTransport';
import type { PilotRemoteEvent } from '../ports/PilotSyncTransport';
import type { SyncCryptoService } from '../ports/SyncCryptoService';
import { DomainError } from '../../../shared/errors/DomainError';
import { parsePilotSyncPayload } from './PilotSyncProtocol';
import { resolvePilotConflict, type PilotVersionMetadata } from './PilotConflictResolver';
import type { PilotSyncStore } from '../ports/PilotSyncStore';

export interface PilotPullResult {
  readonly applied: number;
  readonly quarantined: number;
}

export class PilotPullEngine {
  public constructor(
    private readonly store: PilotSyncStore,
    private readonly crypto: SyncCryptoService,
    private readonly transport: PilotSyncTransport,
  ) {}

  public async run(limit = 100, maxPages = 5): Promise<PilotPullResult> {
    const installation = await this.store.installation();
    if (
      installation?.setupState !== 'configured' ||
      installation.membershipStatus !== 'active' ||
      installation.spaceId === null
    )
      return { applied: 0, quarantined: 0 };
    let cursor = await this.store.cursor(installation.spaceId);
    const initialDeferred = await this.retryDeferred(installation.spaceId);
    let applied = initialDeferred.applied;
    let quarantined = initialDeferred.quarantined;
    for (let page = 0; page < maxPages; page += 1) {
      const events = await this.transport.pull(cursor, limit);
      for (const event of events) {
        if (event.sequence <= cursor) continue;
        try {
          if (await this.applyRemoteEvent(installation.spaceId, event)) applied += 1;
          cursor = event.sequence;
          const retried = await this.retryDeferred(installation.spaceId);
          applied += retried.applied;
          quarantined += retried.quarantined;
        } catch (error: unknown) {
          if (isDependencyMissing(error)) {
            await this.store.deferRemoteEvent(installation.spaceId, event);
            cursor = event.sequence;
            continue;
          }
          await this.store.quarantine(event.sequence, 'pilot_event_invalid', event.ciphertext);
          return { applied, quarantined: quarantined + 1 };
        }
      }
      if (events.length < limit) break;
    }
    if (cursor > 0) await this.transport.acknowledge(cursor);
    return { applied, quarantined };
  }

  private async applyRemoteEvent(spaceId: string, event: PilotRemoteEvent): Promise<boolean> {
    if (await this.store.hasApplied(event.metadata.eventId)) {
      await this.store.advanceAppliedDuplicate(spaceId, event.sequence);
      return false;
    }
    const plaintext = await this.crypto.decryptPilotPayload(event);
    const payload = parsePilotSyncPayload(plaintext);
    assertBindings(payload, event.metadata, spaceId);
    const local = await this.store.localState(payload.entityType, payload.objectId, payload.record);
    const localVersion: PilotVersionMetadata | null =
      local.meta === null
        ? null
        : {
            eventId: local.meta.eventId,
            revision: local.meta.revision,
            baseRevision: local.meta.baseRevision,
            hlcWallTime: local.meta.hlcWallTime,
            hlcLogical: local.meta.hlcLogical,
            deviceId: local.meta.modifiedByDevice ?? '',
            operation: local.meta.deleted ? 'tombstone' : 'upsert',
          };
    const sameSemanticContent =
      payload.operation === 'upsert' &&
      payload.record !== null &&
      local.record !== null &&
      (await this.store.hasSameSemanticContent(payload.entityType, local.record, payload.record));
    const decision = sameSemanticContent
      ? ({ kind: 'equivalent' } as const)
      : resolvePilotConflict(localVersion, {
          eventId: payload.eventId,
          revision: payload.revision,
          baseRevision: payload.baseRevision,
          hlcWallTime: payload.hlc.wallTime,
          hlcLogical: payload.hlc.logical,
          deviceId: payload.originDeviceId,
          operation: payload.operation,
        });
    await this.store.applyPulled(
      spaceId,
      event.sequence,
      payload,
      event.metadata.objectId,
      decision,
    );
    return true;
  }

  private async retryDeferred(spaceId: string): Promise<PilotPullResult> {
    let applied = 0;
    let quarantined = 0;
    for (const event of await this.store.deferredRemoteEvents(spaceId)) {
      try {
        if (await this.applyRemoteEvent(spaceId, event)) applied += 1;
        await this.store.removeDeferredRemoteEvent(spaceId, event.sequence);
      } catch (error: unknown) {
        if (isDependencyMissing(error)) continue;
        await this.store.quarantine(event.sequence, 'pilot_event_invalid', event.ciphertext);
        await this.store.removeDeferredRemoteEvent(spaceId, event.sequence);
        quarantined += 1;
      }
    }
    return { applied, quarantined };
  }
}

function isDependencyMissing(error: unknown): boolean {
  return error instanceof DomainError && error.code === 'sync.pilot_dependency_missing';
}

function assertBindings(
  payload: ReturnType<typeof parsePilotSyncPayload>,
  metadata: Parameters<SyncCryptoService['decryptPilotPayload']>[0]['metadata'],
  spaceId: string,
): void {
  if (
    metadata.spaceId !== spaceId ||
    payload.eventId !== metadata.eventId ||
    payload.originDeviceId !== metadata.originDeviceId ||
    payload.keyEpoch !== metadata.keyEpoch ||
    payload.operation !== metadata.operation ||
    payload.baseRevision !== metadata.baseRevision ||
    payload.revision !== metadata.revision ||
    payload.hlc.wallTime !== metadata.hlcWallTime ||
    payload.hlc.logical !== metadata.hlcLogical
  ) {
    throw new Error('Pilot payload binding mismatch.');
  }
}
