export const RECOMMENDATION_APPLICATION_STATUS = {
  pending: 'PENDING',
  applied: 'APPLIED',
  dismissed: 'DISMISSED',
} as const;

export type RecommendationApplicationStatus =
  (typeof RECOMMENDATION_APPLICATION_STATUS)[keyof typeof RECOMMENDATION_APPLICATION_STATUS];

export const RECOMMENDATION_APPLICATION_TARGET_TYPE = {
  tomorrowPlan: 'TOMORROW_PLAN',
  decision: 'DECISION',
  preparationPlan: 'PREPARATION_PLAN',
  eveningProcess: 'EVENING_PROCESS',
} as const;

export type RecommendationApplicationTargetType =
  (typeof RECOMMENDATION_APPLICATION_TARGET_TYPE)[keyof typeof RECOMMENDATION_APPLICATION_TARGET_TYPE];

export interface RecommendationApplication {
  readonly recommendationId: string;
  readonly status: RecommendationApplicationStatus;
  readonly targetType: RecommendationApplicationTargetType | null;
  readonly targetId: string | null;
  readonly resultMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly appliedAt: Date | null;
  readonly dismissedAt: Date | null;
  readonly version: number;
}

export function pendingRecommendationApplication(
  recommendationId: string,
  now: Date,
): RecommendationApplication {
  return Object.freeze({
    recommendationId,
    status: RECOMMENDATION_APPLICATION_STATUS.pending,
    targetType: null,
    targetId: null,
    resultMessage: null,
    createdAt: new Date(now.getTime()),
    updatedAt: new Date(now.getTime()),
    appliedAt: null,
    dismissedAt: null,
    version: 1,
  });
}

export function applyRecommendationApplication(
  application: RecommendationApplication,
  targetType: RecommendationApplicationTargetType,
  targetId: string | null,
  resultMessage: string,
  now: Date,
): RecommendationApplication {
  return Object.freeze({
    ...application,
    status: RECOMMENDATION_APPLICATION_STATUS.applied,
    targetType,
    targetId,
    resultMessage,
    updatedAt: new Date(now.getTime()),
    appliedAt: new Date(now.getTime()),
    dismissedAt: null,
    version: application.version + 1,
  });
}

export function dismissRecommendationApplication(
  application: RecommendationApplication,
  now: Date,
): RecommendationApplication {
  return Object.freeze({
    ...application,
    status: RECOMMENDATION_APPLICATION_STATUS.dismissed,
    resultMessage: null,
    updatedAt: new Date(now.getTime()),
    appliedAt: null,
    dismissedAt: new Date(now.getTime()),
    version: application.version + 1,
  });
}

export function isRecommendationApplicationStatus(
  value: string,
): value is RecommendationApplicationStatus {
  return Object.values(RECOMMENDATION_APPLICATION_STATUS).some((status) => status === value);
}

export function isRecommendationApplicationTargetType(
  value: string,
): value is RecommendationApplicationTargetType {
  return Object.values(RECOMMENDATION_APPLICATION_TARGET_TYPE).some((type) => type === value);
}
