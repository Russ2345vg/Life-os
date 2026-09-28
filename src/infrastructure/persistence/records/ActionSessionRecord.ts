export interface PauseIntervalRecord {
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface ActionSessionRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly lifeActionId: string;
  readonly goalIdAtStart?: string | null;
  readonly status: 'running' | 'paused' | 'completed';
  readonly startedAt: string;
  readonly pausedAt: string | null;
  readonly completedAt: string | null;
  readonly completionKind: 'completed' | 'interrupted' | null;
  readonly resultNote: string | null;
  readonly pauseIntervals: readonly PauseIntervalRecord[];
  readonly version: number;
}
