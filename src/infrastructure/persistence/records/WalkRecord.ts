export interface WalkRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly date: string;
  readonly type: string;
  readonly sphereId?: string | null;
  readonly status: string;
  readonly mode: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly timerTargetMinutes: number | null;
  readonly reflectionQuestion: string | null;
  readonly result: string | null;
  readonly photo: {
    readonly dataUrl: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
