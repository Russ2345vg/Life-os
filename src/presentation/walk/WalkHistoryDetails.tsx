import { useEffect, useRef } from 'react';
import type { WalkHistoryDetail } from '../../application';
import type { WalkLinkedEntityType } from '../../domain';
import type { RoutineWalkDestinationRequest } from '../routine/RoutineWalkNavigation';
import {
  walkHistoryDate,
  walkHistoryImpact,
  walkHistoryLabel,
  walkHistoryRoutineDestination,
  walkHistoryStates,
  walkHistoryTime,
} from './WalkHistoryPresentation';
import { formatActualDuration } from './walkPresentation';

export interface WalkHistoryNavigation {
  readonly onOpenDecision: (id: string) => void;
  readonly onOpenRoutine: (request: RoutineWalkDestinationRequest) => void;
}

interface Props extends WalkHistoryNavigation {
  readonly detail: WalkHistoryDetail;
  readonly onBack: () => void;
}

const SOURCE_LABELS: Readonly<Record<WalkLinkedEntityType, string>> = {
  decision: 'Связано с решением',
  routine: 'Связано с распорядком',
  goal: 'Связано с целью',
  project: 'Связано с целью',
  lifeAction: 'Связано с действием',
};

export function WalkHistoryDetails({ detail, onBack, onOpenDecision, onOpenRoutine }: Props) {
  const { walk, captures, sourceContext } = detail;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest('[data-walk-focus-stage]')?.scrollIntoView({ block: 'start' });
  }, []);
  const source = walk.linkedEntity ?? walk.returnContext?.entity;
  const historicalTitle =
    source?.type === 'routine' ? walk.returnContext?.routineContext?.sourceTitle : null;
  const impact = walkHistoryImpact(walk);
  return (
    <section
      className="walk-history walk-history-detail"
      aria-labelledby="walk-history-detail-title"
      data-walk-focus-stage
    >
      <button type="button" className="secondary-button walk-history-back" onClick={onBack}>
        ← История прогулок
      </button>
      <header className="walk-history-heading">
        <p className="section-page-eyebrow">Завершённая прогулка</p>
        <h1 ref={heading} tabIndex={-1} id="walk-history-detail-title">
          {walkHistoryLabel(walk)}
        </h1>
        <div className="walk-history-facts">
          {walk.startedAt === null ? null : (
            <time dateTime={walk.startedAt.toISOString()}>
              {walkHistoryDate(walk.startedAt)} · {walkHistoryTime(walk.startedAt)}
            </time>
          )}
          <span>
            Фактически: <strong>{formatActualDuration(walk.actualDurationMilliseconds)}</strong>
          </span>
        </div>
      </header>
      <section className="walk-history-section" aria-labelledby="walk-history-context-title">
        <h2 id="walk-history-context-title">Цель и контекст</h2>
        {walk.reflectionQuestion === null ? null : (
          <p className="walk-history-text">{walk.reflectionQuestion}</p>
        )}
        {source == null ? (
          <p className="walk-history-muted">Без связанного контекста</p>
        ) : (
          <div className="walk-history-source">
            <p className="walk-history-muted">{SOURCE_LABELS[source.type]}</p>
            {historicalTitle == null && sourceContext?.label == null ? null : (
              <p className="walk-history-text">{historicalTitle ?? sourceContext?.label}</p>
            )}
            {sourceContext?.availability === 'available' ? (
              source.type === 'decision' ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onOpenDecision(source.id.toString())}
                >
                  Открыть решение
                </button>
              ) : source.type === 'routine' ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onOpenRoutine(walkHistoryRoutineDestination(walk))}
                >
                  Открыть распорядок
                </button>
              ) : null
            ) : source.type === 'decision' || source.type === 'routine' ? (
              <p className="walk-history-muted">
                {source.type === 'decision'
                  ? 'Связанное решение недоступно'
                  : 'Связанный распорядок недоступен'}
              </p>
            ) : (
              <p className="walk-history-muted walk-history-text">ID: {source.id.toString()}</p>
            )}
          </div>
        )}
      </section>
      <section className="walk-history-section" aria-labelledby="walk-history-state-title">
        <div className="walk-history-section-heading">
          <h2 id="walk-history-state-title">Состояние</h2>
          <span className="walk-history-muted">До → После</span>
        </div>
        <dl className="walk-history-states">
          {walkHistoryStates(walk).map((state) => (
            <div key={state.label}>
              <dt>{state.label}</dt>
              <dd>
                <span>{state.before}</span>
                <span aria-hidden="true">→</span>
                <span className="visually-hidden">после</span>
                <span>{state.after}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="walk-history-section" aria-labelledby="walk-history-result-title">
        <h2 id="walk-history-result-title">Результат</h2>
        {impact === null ? null : <p className="walk-history-impact">Самочувствие: {impact}</p>}
        {walk.result === null ? (
          impact === null ? (
            <p className="walk-history-muted">Без итога</p>
          ) : null
        ) : (
          <p className="walk-history-text">{walk.result}</p>
        )}
      </section>
      <section className="walk-history-section" aria-labelledby="walk-history-captures-title">
        <h2 id="walk-history-captures-title">Сохранённые мысли · {captures.length}</h2>
        {captures.length === 0 ? (
          <p className="walk-history-muted">В этой прогулке нет сохранённых мыслей.</p>
        ) : (
          <ul className="walk-history-captures">
            {captures.map((capture) => (
              <li key={capture.id.toString()}>
                <p className="walk-history-text">{capture.content}</p>
                <div className="walk-history-capture-meta">
                  <time dateTime={capture.capturedAt.toISOString()}>
                    {walkHistoryDate(capture.capturedAt)} · {walkHistoryTime(capture.capturedAt)}
                  </time>
                  <span
                    className={
                      capture.status === 'processed' ? 'walk-history-processed' : undefined
                    }
                  >
                    {capture.status === 'processed' ? 'Обработано' : 'Не обработано'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
