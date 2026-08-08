import type { NextActionCardState } from './NextActionCardState';

interface NextActionCardProps {
  readonly state: NextActionCardState | null;
}

export function NextActionCard({ state }: NextActionCardProps) {
  return (
    <section
      className={`next-action-card${state === null ? ' next-action-card-empty' : ''}`}
      aria-labelledby="next-action-card-title"
    >
      <div className="next-action-card-heading">
        <div>
          <p className="section-kicker">Предварительно</p>
          <h3 id="next-action-card-title">Следующее действие</h3>
        </div>
        {state === null ? null : <span className="next-action-status">{state.statusLabel}</span>}
      </div>

      {state === null ? (
        <p className="next-action-empty-copy">
          После текущего действия продолжение пока не запланировано.
        </p>
      ) : (
        <dl className="next-action-facts">
          <div className="next-action-title-row">
            <dt>Название</dt>
            <dd>{state.lifeAction.title.toString()}</dd>
          </div>
          <div>
            <dt>Связанное решение</dt>
            <dd>{state.decisionTitle ?? 'Без связанного решения'}</dd>
          </div>
          <div>
            <dt>Ожидаемый результат</dt>
            <dd>{state.lifeAction.expectedResult?.toString() ?? 'Не указан'}</dd>
          </div>
        </dl>
      )}

      <p className="next-action-note">
        Это предварительная подсказка. Запуск доступен только у текущего действия.
      </p>
    </section>
  );
}
