export interface RecommendationApplicationRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly status: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly resultMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly appliedAt: string | null;
  readonly dismissedAt: string | null;
  readonly version: number;
}
