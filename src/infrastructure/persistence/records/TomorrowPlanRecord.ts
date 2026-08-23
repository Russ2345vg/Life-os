export interface TomorrowPlanRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly cycleId: string;
  readonly sourceDayId: string;
  readonly targetDayId: string;
  readonly targetDateKey: string;
  readonly directionId: string | null;
  readonly vector: string | null;
  readonly primaryDecisionId: string | null;
  readonly minimumOutcome: string | null;
  readonly targetOutcome: string | null;
  readonly stretchOutcome: string | null;
  readonly firstActionId: string | null;
  readonly firstAttentionItem?: string | null;
  readonly planningQuality?: string;
  readonly supportingDecisionIds: readonly string[];
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly version: number;
}
