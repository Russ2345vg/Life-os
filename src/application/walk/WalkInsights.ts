import type { WalkIntent, WalkStateSnapshot } from '../../domain';

export type WalkConfidenceLevel = 'preliminary' | 'stable';
export type WalkInsightKind = 'mode' | 'duration' | 'timeOfDay' | 'beforeState';
export type WalkDurationBucket = 'short' | 'medium' | 'long';
export type WalkTimeOfDay = 'morning' | 'day' | 'evening';
export type WalkInsightSegment = WalkDurationBucket | WalkTimeOfDay;

/** Ephemeral input from the existing completed-Walk projection, never persisted. */
export interface WalkObservation {
  readonly intent: WalkIntent | null;
  readonly durationMilliseconds: number | null;
  readonly startedAt: Date | null;
  readonly beforeState: WalkStateSnapshot | null;
  readonly afterState: WalkStateSnapshot | null;
}
export interface WalkEvidenceSummary {
  readonly sampleSize: number;
  readonly averageDelta: number;
  readonly improvedCount: number;
}
export interface WalkInsightEvidence extends WalkEvidenceSummary {
  readonly confidenceLevel: WalkConfidenceLevel;
  readonly comparison?: WalkEvidenceSummary & { readonly segment: WalkInsightSegment };
}
export interface WalkInsight {
  readonly id: string;
  readonly kind: WalkInsightKind;
  readonly intent: WalkIntent;
  readonly metric: 'tension' | 'clarity';
  readonly segment?: WalkInsightSegment;
  readonly evidence: WalkInsightEvidence;
}

/** Product sample thresholds from WALK-12; these are not statistical probabilities. */
export function walkConfidenceLevel(sampleSize: number): WalkConfidenceLevel | null {
  if (sampleSize < 3) return null;
  return sampleSize < 8 ? 'preliminary' : 'stable';
}
