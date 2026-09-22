import type {
  SyncApplication,
  SyncOverview,
  SyncPairingInvitation,
} from '../../application/sync/SyncApplicationService';
import type { PilotSyncRunResult } from '../../application/sync/pilot/PilotSyncCoordinator';
import { DomainError } from '../../shared/errors/DomainError';

export class UnavailableSyncApplication implements SyncApplication {
  public constructor(private readonly message: string) {}

  public loadOverview(): Promise<SyncOverview> {
    return this.reject();
  }
  public setupFirstSpace(): Promise<{
    readonly overview: SyncOverview;
    readonly recoveryMaterial: string;
  }> {
    return this.reject();
  }
  public confirmRecoverySaved(): Promise<SyncOverview> {
    return this.reject();
  }
  public exportRecoveryMaterial(): Promise<string> {
    return this.reject();
  }
  public createPairingInvitation(): Promise<SyncPairingInvitation> {
    return this.reject();
  }
  public cancelPairingInvitation(): Promise<void> {
    return this.reject();
  }
  public fulfillPendingPairings(): Promise<number> {
    return this.reject();
  }
  public claimPairingPayload(): Promise<SyncOverview> {
    return this.reject();
  }
  public completePendingPairing(): Promise<boolean> {
    return this.reject();
  }
  public recover(): Promise<SyncOverview> {
    return this.reject();
  }
  public revokeDevice(): Promise<SyncOverview> {
    return this.reject();
  }
  public retryPendingRotation(): Promise<SyncOverview> {
    return this.reject();
  }
  public updateDeviceName(): Promise<SyncOverview> {
    return this.reject();
  }
  public pilotStatus() {
    return {
      state: 'idle' as const,
      pendingCount: 0,
      conflictCount: 0,
      lastSuccessfulSyncAt: null,
    };
  }
  public subscribePilotStatus(
    listener: (status: ReturnType<UnavailableSyncApplication['pilotStatus']>) => void,
  ) {
    listener(this.pilotStatus());
    return () => undefined;
  }
  public syncPilotNow(): Promise<PilotSyncRunResult> {
    return this.reject();
  }
  public notifyPilotMutation(): void {}
  public async close(): Promise<void> {}

  private reject<T>(): Promise<T> {
    return Promise.reject(new DomainError('sync.unavailable', this.message));
  }
}
