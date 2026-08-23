export type GoalProgressRecord =
  | {
      readonly type: 'metric';
      readonly current: number;
      readonly target: number;
      readonly unit: string;
    }
  | {
      readonly type: 'milestones';
      readonly completed: number;
      readonly total: number;
    }
  | {
      readonly type: 'qualitative';
      readonly stage: string;
    };

export interface GoalRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly whyImportant: string | null;
  readonly whyNow: string | null;
  readonly status: string;
  readonly stage: string;
  readonly intentionLevel: string | null;
  readonly horizon: string | null;
  readonly progressType: string | null;
  readonly progress: GoalProgressRecord | null;
  readonly achievementCriteria: string | null;
  readonly nextProgress: string | null;
  readonly coverImage: {
    readonly dataUrl: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly version: number;
}
