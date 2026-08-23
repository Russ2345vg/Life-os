export interface EveningCycleRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly dayId: string;
  readonly dateKey: string;
  readonly state: string;
  readonly mode: string;
  readonly modeReason?: string | null;
  readonly completion?: string;
  readonly skippedStages?: readonly {
    readonly stage: string;
    readonly reason: string;
    readonly skippedAt: string;
  }[];
  readonly startedAt: string | null;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly decisionIds: readonly string[];
  readonly lifeActionIds: readonly string[];
  readonly openLoopReferences?: readonly {
    readonly entityType: string;
    readonly entityId: string;
    readonly requirement: string;
    readonly sourceVersion?: number | null;
  }[];
  readonly openLoopResolutions?: readonly {
    readonly entityType: string;
    readonly entityId: string;
    readonly resolution: string;
    readonly resolvedAt: string;
    readonly note?: string | null;
  }[];
  readonly reflectionQuestions?: readonly {
    readonly id: string;
    readonly kind: string;
    readonly signal: string;
    readonly type: string;
    readonly prompt: string;
    readonly context: string;
    readonly required: boolean;
    readonly sourceEntityIds: readonly string[];
    readonly options: readonly { readonly value: string; readonly label: string }[];
  }[];
  readonly reflectionResults?: readonly {
    readonly cycleId: string;
    readonly questionId: string;
    readonly questionType: string;
    readonly sourceEntityIds: readonly string[];
    readonly status: string;
    readonly answer: string | readonly string[] | null;
    readonly answeredAt: string;
  }[];
  readonly reflectionSignals?: readonly {
    readonly type: string;
    readonly sourceEntityId: string;
    readonly cycleId: string;
    readonly createdAt: string;
  }[];
  readonly reflectionCorrections?: readonly {
    readonly id: string;
    readonly cycleId: string;
    readonly sourceQuestionId: string;
    readonly sourceEntityIds: readonly string[];
    readonly observation: string;
    readonly action: string;
    readonly createdAt: string;
  }[];
  readonly version: number;
}
