import type { WalkCaptureStatus } from '../../../domain';

export interface WalkCaptureRecord {
  readonly resultActionId?: string | null;
  readonly schemaVersion: 1;
  readonly id: string;
  readonly walkId: string;
  readonly type: 'text';
  readonly content: string;
  readonly promptStage?: string | null;
  readonly capturedAt: string;
  readonly walkElapsedMs: number;
  readonly status: WalkCaptureStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
