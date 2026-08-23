import type {
  RecommendationApplication,
  RecommendationApplicationStatus,
} from '../recommendations/RecommendationApplication';

export interface RecommendationApplicationRepository {
  findByRecommendationId(recommendationId: string): Promise<RecommendationApplication | null>;
  findByRecommendationIds(
    recommendationIds: readonly string[],
  ): Promise<readonly RecommendationApplication[]>;
  createIfAbsent(application: RecommendationApplication): Promise<RecommendationApplication>;
  saveIfStatusMatches(
    application: RecommendationApplication,
    expectedStatus: RecommendationApplicationStatus,
  ): Promise<boolean>;
}
