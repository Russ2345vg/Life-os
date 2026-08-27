import { useEffect, useState } from 'react';
import type { Decision, Walk } from '../../domain';
import { WALK_IMPACT_OPTIONS } from '../walk/WalkSessionPresentation';
import type { DecisionWalkIntegration } from './DecisionWalkNavigation';

interface DecisionWalkSectionProps {
  readonly decision: Decision;
  readonly readOnly: boolean;
  readonly integration: DecisionWalkIntegration;
}

type OutcomeState =
  | { readonly status: 'loading' | 'error' }
  | { readonly status: 'ready'; readonly walk: Walk | null };

export function DecisionWalkSection({ decision, readOnly, integration }: DecisionWalkSectionProps) {
  const [state, setState] = useState<OutcomeState>({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  const query = integration.getLatestOutcome;
  const id = decision.id;
  useEffect(() => {
    let active = true;
    void query
      .execute(id)
      .then((walk) => {
        if (active) setState({ status: 'ready', walk });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [id, query, retry]);

  return (
    <div className="decision-walk-section">
      {!readOnly && !decision.isDeleted() && !decision.isArchived() ? (
        <button
          className="secondary-button"
          type="button"
          onClick={() => integration.onStart(decision)}
        >
          Обдумать на прогулке
        </button>
      ) : null}
      {state.status === 'loading' ? (
        <small role="status">Проверяем результат прогулки…</small>
      ) : null}
      {state.status === 'error' ? (
        <div role="status">
          <span>Не удалось загрузить результат прогулки.</span>{' '}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить
          </button>
        </div>
      ) : null}
      {state.status === 'ready' && state.walk !== null ? (
        <DecisionWalkOutcome walk={state.walk} />
      ) : null}
    </div>
  );
}

export function DecisionWalkOutcome({ walk }: { readonly walk: Walk }) {
  const impact = WALK_IMPACT_OPTIONS.find((option) => option.value === walk.impact)?.label;
  return (
    <section className="decision-walk-outcome" aria-label="Результат прогулки">
      <h3>Результат прогулки</h3>
      <p className="decision-walk-meta">
        <time dateTime={walk.endedAt?.toISOString()}>{walk.date.toString()}</time>
        {' · '}
        {Math.floor((walk.actualDurationMilliseconds ?? 0) / 60000)} мин
        {impact === undefined ? null : ` · ${impact}`}
      </p>
      <span>Что стало понятнее</span>
      <p>{walk.result ?? 'Текстовый вывод не добавлен.'}</p>
      <small>Контекст прогулки сохранён отдельно. Статус решения не изменён прогулкой.</small>
    </section>
  );
}
