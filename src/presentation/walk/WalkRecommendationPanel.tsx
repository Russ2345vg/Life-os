import { useCallback } from 'react';
import './WalkInsights.css';
import type { GetWalkRecommendation, WalkRecommendation } from '../../application';
import type { WalkIntent, WalkStateSnapshot } from '../../domain';
import { useWalkCaptureQuery } from './useWalkCaptureQuery';
import { WalkBeforeStateInput } from './WalkSessionFlow';
import { WALK_INTENT_PRESENTATION } from './WalkSessionPresentation';
import {
  walkConfidenceLabel,
  walkInsightEvidenceText,
  walkInsightSummary,
} from './WalkInsightsPresentation';
import { walkAnalyticsDate } from './WalkAnalyticsPresentation';

interface Actions {
  readonly onChoose: (intent: WalkIntent) => void;
  readonly onOrdinary: () => void;
}
interface Props extends Actions {
  readonly query: Pick<GetWalkRecommendation, 'execute'>;
  readonly currentState: WalkStateSnapshot | null;
  readonly onStateChange: (state: WalkStateSnapshot | null) => void;
}
export function WalkRecommendationPanel(props: Props) {
  const key =
    props.currentState === null
      ? 'unset'
      : `${props.currentState.energy}:${props.currentState.tension}:${props.currentState.clarity}`;
  return (
    <>
      <RecommendationQuery key={key} {...props} />
      <details className="walk-current-state">
        <summary>Указать текущее состояние</summary>
        <p>Необязательно. Оценки сохранятся только после подтверждения запуска прогулки.</p>
        <WalkBeforeStateInput value={props.currentState} onChange={props.onStateChange} />
      </details>
    </>
  );
}
function RecommendationQuery(props: Props) {
  const load = useCallback(
    () => props.query.execute(props.currentState),
    [props.query, props.currentState],
  );
  const { state, reload } = useWalkCaptureQuery(load);
  if (state.status !== 'ready')
    return (
      <div className="walk-recommendation-status">
        {state.status === 'loading' ? (
          <p role="status">Проверяем наблюдения…</p>
        ) : (
          <div role="alert">
            <p>Не удалось загрузить рекомендацию. Можно выбрать режим самостоятельно.</p>
            <button className="secondary-button" type="button" onClick={reload}>
              Повторить
            </button>
          </div>
        )}
        <StartButton onClick={props.onOrdinary} />
      </div>
    );
  return (
    <WalkRecommendationView
      recommendation={state.value}
      onChoose={props.onChoose}
      onOrdinary={props.onOrdinary}
    />
  );
}
export function WalkRecommendationView({
  recommendation,
  onChoose,
  onOrdinary,
}: Actions & { readonly recommendation: WalkRecommendation | null }) {
  if (recommendation === null)
    return (
      <div className="walk-recommendation-neutral">
        <p>Пока недостаточно данных для персональной рекомендации.</p>
        <StartButton onClick={onOrdinary} />
      </div>
    );
  const r = recommendation;
  return (
    <section className="walk-recommendation" aria-labelledby="walk-recommendation-title">
      <p className="walk-recommendation-eyebrow" id="walk-recommendation-title">
        Рекомендация LifeOS
      </p>
      <h2>Можно попробовать: {WALK_INTENT_PRESENTATION[r.intent].shortLabel}</h2>
      <p className="walk-recommendation-duration">30 минут — обычная настройка, можно изменить</p>
      <p className="walk-recommendation-reason">{walkInsightSummary(r.insight)}</p>
      <StartButton onClick={() => onChoose(r.intent)} />
      <div className="walk-recommendation-secondary">
        <details>
          <summary>Почему LifeOS это предлагает?</summary>
          <div className="walk-recommendation-evidence">
            <h3>Текущий контекст</h3>
            <p>
              {r.currentState === null
                ? 'Текущее состояние не указано. Предложение основано только на истории.'
                : `Напряжение ${r.currentState.tension}/10 · Энергия ${r.currentState.energy}/10 · Ясность ${r.currentState.clarity}/10`}
            </p>
            <h3>Историческое наблюдение</h3>
            <p>
              {walkAnalyticsDate(r.startDate)} — {walkAnalyticsDate(r.endDate)} · 30 дней
            </p>
            <p>{walkInsightEvidenceText(r.insight)}</p>
            <p>
              {walkConfidenceLabel(r.confidenceLevel)} · Сопоставимых прогулок: {r.sampleSize}.
            </p>
            <p>
              Это не доказывает причинную связь и не обещает такой же результат.{' '}
              {r.confidenceLevel === 'preliminary'
                ? 'Пока мало данных для устойчивого вывода.'
                : ''}
            </p>
            <p>Вы можете выбрать другой режим или не начинать прогулку.</p>
          </div>
        </details>
        <button className="walk-recommendation-ordinary" type="button" onClick={onOrdinary}>
          Обычный выбор
        </button>
      </div>
    </section>
  );
}
function StartButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <button className="primary-button walk-session-primary-action" type="button" onClick={onClick}>
      Начать прогулку
    </button>
  );
}
