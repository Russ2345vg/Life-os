import type { RecommendationApplicationRepository } from '../ports/RecommendationApplicationRepository';
import {
  buildEveningRecommendationCards,
  type EveningRecommendationCard,
} from '../recommendations/RecommendationApplicationService';
import { detectEveningPatterns, type EveningPattern } from './DetectEveningPatterns';
import { getEveningRecommendations, type EveningRecommendation } from './GetEveningRecommendations';
import {
  type EveningHistoryRange,
  type EveningHistoryResult,
  type GetEveningHistory,
} from './GetEveningHistory';
import { summarizeEveningHistory, type EveningHistorySummary } from './GetEveningHistorySummary';
import { getEveningSignals, type EveningSignal } from './GetEveningSignals';

export interface EveningAnalyticsResult {
  readonly history: EveningHistoryResult;
  readonly summary: EveningHistorySummary;
  readonly patterns: readonly EveningPattern[];
  readonly signals: readonly EveningSignal[];
  readonly recommendations: readonly EveningRecommendation[];
  readonly recommendationCards: readonly EveningRecommendationCard[];
}

/**
 * Builds the complete analytics projection from one history snapshot. This
 * keeps IndexedDB reads out of React and prevents nested analytical queries
 * from re-reading the same repositories for one screen load.
 */
export class GetEveningAnalytics {
  public constructor(
    private readonly history: Pick<GetEveningHistory, 'execute'>,
    private readonly applications: Pick<
      RecommendationApplicationRepository,
      'findByRecommendationIds'
    >,
  ) {}

  public async execute(range: EveningHistoryRange): Promise<EveningAnalyticsResult> {
    const history = await this.history.execute(range);
    const summary = summarizeEveningHistory(history);
    const patterns = detectEveningPatterns(history, summary).patterns;
    const signals = getEveningSignals(patterns);
    const recommendations = getEveningRecommendations(signals);
    const applications = await this.applications.findByRecommendationIds(
      recommendations.map((recommendation) => recommendation.id),
    );

    return Object.freeze({
      history,
      summary,
      patterns,
      signals,
      recommendations,
      recommendationCards: buildEveningRecommendationCards(recommendations, applications),
    });
  }
}
