import type { WalkCapture } from '../../domain/walk-capture/WalkCapture';
import type { WalkRequest, WalkTransaction } from './WalkUnitOfWork';
export interface WalkCaptureTransaction extends WalkTransaction {
  getCapture(id: string): Promise<WalkCapture | null>;
  saveCapture(capture: WalkCapture, expectedVersion: number | null): Promise<void>;
}
export interface WalkCaptureRepository {
  runCapture(
    input: WalkRequest,
    change: (transaction: WalkCaptureTransaction) => Promise<WalkCapture>,
  ): Promise<WalkCapture>;
  listCaptures(walkId?: string): Promise<readonly WalkCapture[]>;
}
