export interface PreparationItemRecord {
  readonly id: string;
  readonly planId: string;
  readonly key: string;
  readonly category: string;
  readonly title: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly required: boolean;
  readonly status: string;
  readonly active: boolean;
  readonly completedAt: string | null;
  readonly skippedAt: string | null;
  readonly skipReason: string | null;
}

export interface PreparationPlanRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly cycleId: string;
  readonly tomorrowPlanId: string;
  readonly targetDayId: string;
  readonly items: readonly PreparationItemRecord[];
  readonly sourceVersion: number;
  readonly generationSignature: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly version: number;
}
