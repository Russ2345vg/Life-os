export interface MorningCycleRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly dayId: string;
  readonly dateKey: string;
  readonly state: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly startState?: MorningStartStateRecord | null;
  readonly shortenedMode: boolean;
  readonly shortenedModeState?: string;
  readonly shortenedConfiguration?: MorningShortenedConfigurationRecord | null;
  readonly stageStates: ReadonlyArray<MorningStageStateRecord>;
  readonly waterCompletedAt: string | null;
  readonly waterAmountMl: number | null;
  readonly physicalStatus: string;
  readonly physicalUpdatedAt: string | null;
  readonly physicalPlanItems?: ReadonlyArray<MorningPhysicalPlanItemRecord> | null;
  readonly physicalExecution?: MorningPhysicalExecutionRecord | null;
  readonly physicalRecommendation?: MorningPhysicalRecommendationRecord | null;
  readonly updatedAt: string;
  readonly version: number;
}

export interface MorningPhysicalRecommendationRecord {
  readonly status: 'PENDING' | 'ACCEPTED' | 'DISMISSED';
  readonly planItems: ReadonlyArray<MorningPhysicalPlanItemRecord>;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

export interface MorningPhysicalExecutionRecord {
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly pausedAt: string | null;
  readonly pauseIntervals: ReadonlyArray<MorningPhysicalPauseIntervalRecord>;
  readonly activeSetIndex: number;
  readonly sets: ReadonlyArray<MorningPhysicalSetExecutionRecord>;
  readonly suppressedSetIndexes?: ReadonlyArray<number>;
  readonly pendingRemainingSetStrategy?: 'keep' | 'shorten' | 'skip' | null;
}

export interface MorningStartStateRecord {
  readonly energy: number;
  readonly clarity: number;
  readonly mood: string;
  readonly recordedAt: string;
}

export interface MorningShortenedConfigurationRecord {
  readonly coldShower: 'keep' | 'skip';
  readonly physical: 'keep' | 'shorten' | 'skip';
  readonly mirror: 'keep' | 'skip';
}

export interface MorningPhysicalPauseIntervalRecord {
  readonly startedAt: string;
  readonly endedAt: string;
}

interface MorningPhysicalSetExecutionRecordCommon {
  readonly exerciseDefinitionId: string;
  readonly setNumber: number;
  readonly measurementType: 'REPETITIONS' | 'DURATION';
}

export type MorningPhysicalSetExecutionRecord =
  | (MorningPhysicalSetExecutionRecordCommon & {
      readonly measurementType: 'REPETITIONS';
      readonly status: 'PENDING';
      readonly actualReps: null;
      readonly resolvedAt: null;
    })
  | (MorningPhysicalSetExecutionRecordCommon & {
      readonly measurementType: 'REPETITIONS';
      readonly status: 'COMPLETED';
      readonly actualReps: number;
      readonly resolvedAt: string;
    })
  | (MorningPhysicalSetExecutionRecordCommon & {
      readonly measurementType: 'DURATION';
      readonly status: 'PENDING';
      readonly actualDurationSeconds: null;
      readonly resolvedAt: null;
    })
  | (MorningPhysicalSetExecutionRecordCommon & {
      readonly measurementType: 'DURATION';
      readonly status: 'COMPLETED';
      readonly actualDurationSeconds: number;
      readonly resolvedAt: string;
    })
  | (MorningPhysicalSetExecutionRecordCommon & {
      readonly status: 'SKIPPED';
      readonly resolvedAt: string;
    });

export type MorningPhysicalPlanItemRecord =
  | {
      readonly exerciseDefinitionId: string;
      readonly measurementType: 'REPETITIONS';
      readonly sets: number;
      readonly targetReps: number;
    }
  | {
      readonly exerciseDefinitionId: string;
      readonly measurementType: 'DURATION';
      readonly sets: number;
      readonly targetDurationSeconds: number;
    };

export interface MorningStageStateRecord {
  readonly stageId: string;
  readonly status: string;
  readonly updatedAt: string | null;
}
