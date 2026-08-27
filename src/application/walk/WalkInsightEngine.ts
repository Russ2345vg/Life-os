import type { WalkIntent } from '../../domain';
import {
  walkConfidenceLevel,
  type WalkDurationBucket,
  type WalkEvidenceSummary,
  type WalkInsight,
  type WalkInsightKind,
  type WalkInsightSegment,
  type WalkObservation,
  type WalkTimeOfDay,
} from './WalkInsights';

const INTENTS: readonly WalkIntent[] = ['recovery', 'reflection', 'free'];

export function walkDurationBucket(milliseconds: number | null): WalkDurationBucket | null {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) return null;
  if (milliseconds < 20 * 60000) return 'short';
  return milliseconds <= 40 * 60000 ? 'medium' : 'long';
}

/** Interpret existing instants in the device timezone; original travel timezone is unknown. */
export function walkTimeOfDay(startedAt: Date | null): WalkTimeOfDay | null {
  if (startedAt === null || !Number.isFinite(startedAt.getTime())) return null;
  const hour = startedAt.getHours();
  if (hour < 6) return null;
  if (hour < 12) return 'morning';
  return hour < 18 ? 'day' : 'evening';
}

export function buildWalkInsights(
  observations: readonly WalkObservation[],
): readonly WalkInsight[] {
  const insights: WalkInsight[] = [];
  for (const intent of INTENTS) {
    const metric = intent === 'recovery' ? 'tension' : 'clarity';
    const source = observations.filter((o) => o.intent === intent);
    const summarize = (items: readonly WalkObservation[]): WalkEvidenceSummary | null => {
      const deltas = items.flatMap((o) => {
        const before = o.beforeState?.[metric];
        const after = o.afterState?.[metric];
        return before === undefined || after === undefined ? [] : [after - before];
      });
      if (deltas.length === 0) return null;
      return Object.freeze({
        sampleSize: deltas.length,
        averageDelta: deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length,
        improvedCount: deltas.filter((delta) => (metric === 'tension' ? delta < 0 : delta > 0))
          .length,
      });
    };
    const qualifies = (summary: WalkEvidenceSummary | null): summary is WalkEvidenceSummary =>
      summary !== null &&
      walkConfidenceLevel(summary.sampleSize) !== null &&
      (metric === 'tension' ? -summary.averageDelta : summary.averageDelta) >= 1 &&
      summary.improvedCount * 2 > summary.sampleSize;
    const add = (
      kind: WalkInsightKind,
      summary: WalkEvidenceSummary,
      segment?: WalkInsightSegment,
      comparison?: WalkEvidenceSummary & { readonly segment: WalkInsightSegment },
    ) => {
      const confidenceLevel = walkConfidenceLevel(
        Math.min(summary.sampleSize, comparison?.sampleSize ?? summary.sampleSize),
      );
      if (confidenceLevel === null) return;
      insights.push(
        Object.freeze({
          id: `${kind}:${intent}:${segment ?? 'all'}:${comparison?.segment ?? 'none'}`,
          kind,
          intent,
          metric,
          ...(segment === undefined ? {} : { segment }),
          evidence: Object.freeze({
            ...summary,
            confidenceLevel,
            ...(comparison === undefined ? {} : { comparison }),
          }),
        }),
      );
    };
    const mode = summarize(source);
    if (qualifies(mode)) add('mode', mode);
    if (intent === 'recovery') {
      const similar = summarize(
        source.filter((o) => o.beforeState !== null && o.beforeState.tension >= 7),
      );
      if (qualifies(similar)) add('beforeState', similar);
    }
    const compare = (
      kind: 'duration' | 'timeOfDay',
      segments: readonly WalkInsightSegment[],
      segmentOf: (o: WalkObservation) => WalkInsightSegment | null,
    ) => {
      const groups = segments.map((segment) => ({
        segment,
        summary: summarize(source.filter((o) => segmentOf(o) === segment)),
      }));
      for (const group of groups) {
        const summary = group.summary;
        if (!qualifies(summary)) continue;
        // Compare with the strongest eligible alternative, not a cherry-picked weak cohort.
        const alternatives = groups
          .filter(
            (other) =>
              other.segment !== group.segment &&
              other.summary !== null &&
              other.summary.sampleSize >= 3,
          )
          .sort(
            (a, b) =>
              b.summary!.improvedCount / b.summary!.sampleSize -
                a.summary!.improvedCount / a.summary!.sampleSize ||
              b.summary!.sampleSize - a.summary!.sampleSize,
          );
        const other = alternatives[0];
        if (
          other?.summary == null ||
          summary.improvedCount * other.summary.sampleSize <=
            other.summary.improvedCount * summary.sampleSize
        )
          continue;
        add(
          kind,
          summary,
          group.segment,
          Object.freeze({ ...other.summary, segment: other.segment }),
        );
      }
    };
    compare('duration', ['short', 'medium', 'long'], (o) =>
      walkDurationBucket(o.durationMilliseconds),
    );
    compare('timeOfDay', ['morning', 'day', 'evening'], (o) => walkTimeOfDay(o.startedAt));
  }
  return Object.freeze(insights);
}
