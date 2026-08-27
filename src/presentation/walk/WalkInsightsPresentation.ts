import type { WalkConfidenceLevel, WalkInsight, WalkInsightSegment } from '../../application';
import { formatWalkAnalyticsValue } from './WalkAnalyticsPresentation';
import { WALK_INTENT_PRESENTATION } from './WalkSessionPresentation';

const SEGMENTS: Readonly<Record<WalkInsightSegment, string>> = {
  short: 'менее 20 минут',
  medium: '20–40 минут',
  long: 'более 40 минут',
  morning: 'утром (06–12)',
  day: 'днём (12–18)',
  evening: 'вечером (18–24)',
};
export function walkConfidenceLabel(level: WalkConfidenceLevel): string {
  return level === 'stable' ? 'Устойчивая закономерность' : 'Предварительное наблюдение';
}
export function walkInsightSummary(insight: WalkInsight): string {
  const change = insight.metric === 'tension' ? 'снижением напряжения' : 'ростом ясности';
  const mode = WALK_INTENT_PRESENTATION[insight.intent].shortLabel;
  if (insight.kind === 'beforeState')
    return `В похожих восстановительных прогулках с напряжением 7–10 перед прогулкой напряжение после обычно было ниже.`;
  if (insight.segment !== undefined)
    return `Прогулки ${SEGMENTS[insight.segment]} в режиме «${mode}» чаще сопровождались ${change}, чем ${SEGMENTS[insight.evidence.comparison!.segment]}.`;
  return `По накопленным данным, прогулки в режиме «${mode}» обычно сопровождались ${change}.`;
}
export function walkInsightEvidenceText(insight: WalkInsight): string {
  const e = insight.evidence;
  const change = insight.metric === 'tension' ? 'Снижение напряжения' : 'Рост ясности';
  const comparison =
    e.comparison === undefined
      ? ''
      : ` Для сравнения: ${e.comparison.improvedCount} из ${e.comparison.sampleSize} (${SEGMENTS[e.comparison.segment]}).`;
  return `${change}: ${e.improvedCount} из ${e.sampleSize}. Среднее изменение: ${formatWalkAnalyticsValue(e.averageDelta, true)} по шкале 0–10.${comparison}`;
}
export function selectVisibleWalkInsights(
  insights: readonly WalkInsight[],
): readonly WalkInsight[] {
  const sorted = [...insights].sort(
    (a, b) =>
      Number(b.evidence.confidenceLevel === 'stable') -
        Number(a.evidence.confidenceLevel === 'stable') ||
      b.evidence.sampleSize - a.evidence.sampleSize ||
      a.id.localeCompare(b.id),
  );
  return (['mode', 'duration', 'timeOfDay', 'beforeState'] as const).flatMap((kind) => {
    const insight = sorted.find((i) => i.kind === kind);
    return insight === undefined ? [] : [insight];
  });
}
