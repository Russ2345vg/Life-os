export interface WalkRecord {
  readonly deletedAt?: string | null;
  readonly goalLinksVersion?: 1;
  readonly schemaVersion: 1;
  readonly id: string;
  readonly date: string;
  readonly type: string;
  readonly sphereId?: string | null;
  readonly intent?: string | null;
  readonly reflectionTemplate?: string | null;
  readonly reflectionStage?: string | null;
  readonly beforeState?: WalkStateSnapshotRecord | null;
  readonly afterState?: WalkStateSnapshotRecord | null;
  readonly impact?: string | null;
  readonly linkedEntity?: WalkLinkedEntityRecord | null;
  readonly returnContext?: WalkReturnContextRecord | null;
  readonly reentry?: WalkReentryRecord | null;
  readonly status: string;
  readonly mode: string | null;
  readonly startedAt: string | null;
  readonly pausedAt?: string | null;
  readonly pauseIntervals?: readonly WalkPauseIntervalRecord[];
  readonly endedAt: string | null;
  readonly timerTargetMinutes: number | null;
  readonly reflectionQuestion: string | null;
  readonly reflectionNotes?: {
    readonly understood: string | null;
    readonly open: string | null;
    readonly next: string | null;
  } | null;
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

export interface WalkStateSnapshotRecord {
  readonly energy: number;
  readonly tension: number;
  readonly clarity: number;
}

export interface WalkLinkedEntityRecord {
  readonly type: string;
  readonly id: string;
}

export interface WalkReturnContextRecord {
  readonly origin: string;
  readonly entity: WalkLinkedEntityRecord | null;
  readonly nextStep: string | null;
  readonly routineContext?: WalkRoutineContextRecord | null;
}

export interface WalkRoutineOccurrenceReferenceRecord {
  readonly routineBlockId: string;
  readonly occurrenceDate: string;
  readonly effectiveDate: string;
}

export interface WalkRoutineContextRecord {
  readonly source: WalkRoutineOccurrenceReferenceRecord;
  readonly sourceTitle: string;
  readonly next: WalkRoutineOccurrenceReferenceRecord | null;
}

export interface WalkReentryRecord {
  readonly status: string;
  readonly action: WalkReentryActionRecord;
  readonly preparedAt: string;
  readonly resolvedAt: string | null;
}

export interface WalkReentryActionRecord {
  readonly kind: string;
  readonly destination: string;
  readonly entity: WalkLinkedEntityRecord | null;
  readonly nextStep: string | null;
  readonly routineContext?: WalkRoutineContextRecord | null;
}

export interface WalkPauseIntervalRecord {
  readonly startedAt: string;
  readonly endedAt: string;
}
