import type { WalkInsight } from '../../application';
import './WalkInsights.css';
import {
  selectVisibleWalkInsights,
  walkConfidenceLabel,
  walkInsightEvidenceText,
  walkInsightSummary,
} from './WalkInsightsPresentation';

export function WalkInsightsPanel({ insights }: { readonly insights: readonly WalkInsight[] }) {
  const visible = selectVisibleWalkInsights(insights);
  return (
    <section className="walk-analytics-panel walk-insights" aria-labelledby="walk-insights-title">
      <h2 id="walk-insights-title">Наблюдения</h2>
      {visible.length === 0 ? (
        <p className="walk-analytics-muted">
          Пока недостаточно сопоставимых данных для персональных наблюдений.
        </p>
      ) : (
        <>
          <div className="walk-insights-grid">
            {visible.map((insight) => (
              <article key={insight.id} data-walk-insight={insight.kind}>
                <p className="walk-insight-confidence">
                  {walkConfidenceLabel(insight.evidence.confidenceLevel)}
                </p>
                <h3>{walkInsightSummary(insight)}</h3>
                <p className="walk-analytics-muted">{walkInsightEvidenceText(insight)}</p>
                {insight.kind === 'timeOfDay' ? (
                  <p className="walk-analytics-muted">
                    Время старта в текущем часовом поясе устройства.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
          <p className="walk-analytics-muted">
            Это не доказывает причинную связь. Предварительные наблюдения основаны на небольшой
            выборке.
          </p>
        </>
      )}
    </section>
  );
}
