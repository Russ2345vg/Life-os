import type { WalkIntent, WalkStateSnapshot } from '../../domain';
import type { WalkAnalytics } from './WalkAnalytics';
import type { WalkConfidenceLevel, WalkInsight } from './WalkInsights';

export interface WalkRecommendation {
  readonly intent: WalkIntent;
  /** Existing editable preparation default, not a personalized duration claim. */
  readonly durationMinutes: 30;
  readonly sampleSize: number;
  readonly confidenceLevel: WalkConfidenceLevel;
  readonly insight: WalkInsight;
  readonly currentState: WalkStateSnapshot | null;
  readonly startDate: string;
  readonly endDate: string;
}
const INTENT_ORDER: Readonly<Record<WalkIntent, number>> = { recovery: 0, reflection: 1, free: 2 };

export function selectWalkRecommendation(
  analytics: Pick<WalkAnalytics, 'insights' | 'startDate' | 'endDate'>,
  currentState: WalkStateSnapshot | null,
): WalkRecommendation | null {
  const contextual =
    currentState !== null && currentState.tension >= 7
      ? analytics.insights.find((i) => i.kind === 'beforeState')
      : undefined;
  const historical = analytics.insights
    .filter((i) => i.kind === 'mode')
    .sort(
      (a, b) =>
        Number(b.evidence.confidenceLevel === 'stable') -
          Number(a.evidence.confidenceLevel === 'stable') ||
        b.evidence.sampleSize - a.evidence.sampleSize ||
        INTENT_ORDER[a.intent] - INTENT_ORDER[b.intent],
    )[0];
  const insight = contextual ?? historical;
  if (insight === undefined) return null;
  return Object.freeze({
    intent: insight.intent,
    durationMinutes: 30,
    sampleSize: insight.evidence.sampleSize,
    confidenceLevel: insight.evidence.confidenceLevel,
    insight,
    currentState: currentState === null ? null : Object.freeze({ ...currentState }),
    startDate: analytics.startDate,
    endDate: analytics.endDate,
  });
}
