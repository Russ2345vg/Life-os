export interface MorningCycleRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly dayId: string;
  readonly dateKey: string;
  readonly state: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly shortenedMode: boolean;
  readonly stageStates: ReadonlyArray<MorningStageStateRecord>;
  readonly waterCompletedAt: string | null;
  readonly waterAmountMl: number | null;
  readonly physicalStatus: string;
  readonly physicalUpdatedAt: string | null;
  readonly updatedAt: string;
  readonly version: number;
}

export interface MorningStageStateRecord {
  readonly stageId: string;
  readonly status: string;
  readonly updatedAt: string | null;
}
