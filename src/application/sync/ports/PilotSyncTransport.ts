import type { PilotCryptoEnvelope } from './SyncCryptoService';

export interface PilotRemoteEvent extends PilotCryptoEnvelope {
  readonly sequence: number;
}

export interface PilotPushAcknowledgement {
  readonly sequence: number;
  readonly isCurrentWinner: boolean;
}

export interface PilotSyncTransport {
  push(envelope: PilotCryptoEnvelope): Promise<PilotPushAcknowledgement>;
  pull(afterSequence: number, limit: number): Promise<readonly PilotRemoteEvent[]>;
  acknowledge(lastSequence: number): Promise<void>;
}
