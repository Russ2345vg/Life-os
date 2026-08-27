import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  WALK_INTENT,
  WALK_TYPE,
  type Walk,
  type WalkImpact,
  type WalkStateSnapshot,
} from '../../domain';
import {
  getWalkReentryPresentation,
  WALK_IMPACT_OPTIONS,
  WALK_INTENT_PRESENTATION,
} from './WalkSessionPresentation';
import { WALK_TYPE_PRESENTATION } from './walkPresentation';
import { decisionWalkReturnId, type DecisionWalkContext } from '../decision/DecisionWalkNavigation';

export interface WalkOutcomeDraft {
  readonly afterState: WalkStateSnapshot;
  readonly impact: WalkImpact;
  readonly reflection: string;
}

interface WalkQuickCompletionPanelProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onSave: (draft: WalkOutcomeDraft) => void;
}

export function WalkQuickCompletionPanel(props: WalkQuickCompletionPanelProps) {
  const titleRef = useInitialFocus<HTMLHeadingElement>();
  const initialState = props.walk.beforeState ?? { energy: 5, tension: 5, clarity: 5 };
  const [energy, setEnergy] = useState(initialState.energy);
  const [tension, setTension] = useState(initialState.tension);
  const [clarity, setClarity] = useState(initialState.clarity);
  const [impact, setImpact] = useState<WalkImpact | null>(null);
  const [reflection, setReflection] = useState('');
  const reflectionPrompt =
    props.walk.intent === WALK_INTENT.reflection ||
    (props.walk.intent === null && props.walk.type === WALK_TYPE.reflection)
      ? 'Что стало понятнее?'
      : 'Что изменилось?';

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (impact === null) return;
    props.onSave({
      afterState: { energy, tension, clarity },
      impact,
      reflection: reflection.trim(),
    });
  }

  return (
    <form
      className="walk-completion-panel"
      data-walk-focus-stage
      aria-labelledby="walk-completion-title"
      onSubmit={submit}
    >
      <header className="walk-completion-heading">
        <div>
          <p className="section-page-eyebrow">Прогулка завершена</p>
          <h1 id="walk-completion-title" ref={titleRef} tabIndex={-1}>
            Быстрый итог
          </h1>
        </div>
        <span className="walk-completion-mode">{getWalkLabel(props.walk)}</span>
      </header>

      <dl className="walk-completion-summary">
        <div>
          <dt>Фактическая длительность</dt>
          <dd>{formatDuration(props.walk.actualDurationMilliseconds)}</dd>
        </div>
        <div>
          <dt>Начало</dt>
          <dd>
            <time dateTime={props.walk.startedAt?.toISOString()}>
              {formatTime(props.walk.startedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Завершение</dt>
          <dd>
            <time dateTime={props.walk.endedAt?.toISOString()}>
              {formatTime(props.walk.endedAt)}
            </time>
          </dd>
        </div>
      </dl>

      {props.walk.beforeState === null ? null : (
        <section className="walk-completion-before" aria-labelledby="walk-completion-before-title">
          <h2 id="walk-completion-before-title">До прогулки</h2>
          <StateSnapshot snapshot={props.walk.beforeState} />
        </section>
      )}

      <fieldset className="walk-completion-state" disabled={props.isSaving}>
        <legend>После прогулки</legend>
        <div className="walk-completion-state-grid">
          <StateRange label="Энергия" value={energy} onChange={setEnergy} />
          <StateRange label="Напряжение" value={tension} onChange={setTension} />
          <StateRange label="Ясность" value={clarity} onChange={setClarity} />
        </div>
      </fieldset>

      <fieldset className="walk-completion-impact" disabled={props.isSaving}>
        <legend>Как прогулка повлияла?</legend>
        <div className="walk-completion-impact-grid">
          {WALK_IMPACT_OPTIONS.map((option) => (
            <label key={option.value} className="walk-completion-impact-option">
              <input
                type="radio"
                name="walk-impact"
                value={option.value}
                checked={impact === option.value}
                onChange={() => setImpact(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="walk-completion-reflection">
        <span>
          {reflectionPrompt} <small>необязательно</small>
        </span>
        <textarea
          rows={3}
          maxLength={1000}
          value={reflection}
          disabled={props.isSaving}
          onChange={(event) => setReflection(event.currentTarget.value)}
        />
      </label>

      {props.error === null ? null : (
        <p className="walk-completion-error" role="alert">
          {props.error}
        </p>
      )}

      <button
        className="primary-button walk-completion-submit"
        type="submit"
        disabled={props.isSaving || impact === null}
      >
        {props.isSaving ? 'Сохраняем…' : 'Сохранить итог'}
      </button>
    </form>
  );
}

interface WalkReentryPanelProps {
  readonly decisionContext?: DecisionWalkContext;
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onPrimary: () => void;
  readonly onCloseWithoutContinuation: () => void;
}

export function WalkReentryPanel(props: WalkReentryPanelProps) {
  const titleRef = useInitialFocus<HTMLHeadingElement>();
  const reentry = props.walk.reentry;
  if (reentry === null) {
    return (
      <section
        className="walk-reentry-panel"
        data-walk-focus-stage
        aria-labelledby="walk-reentry-title"
      >
        <div className="walk-reentry-heading">
          <p className="section-page-eyebrow">Возвращение</p>
          <h1 id="walk-reentry-title" ref={titleRef} tabIndex={-1}>
            Возвращение не подготовлено
          </h1>
        </div>
        <p className="walk-completion-error" role="alert">
          Обновите раздел и повторите действие.
        </p>
      </section>
    );
  }
  const presentation = getWalkReentryPresentation(reentry.action);
  const returnsToDecision = decisionWalkReturnId(props.walk) !== null;
  const unavailable = returnsToDecision && props.decisionContext?.status === 'unavailable';
  const loadingDecision = returnsToDecision && props.decisionContext?.status === 'loading';
  const nextStep = reentry.action.nextStep?.trim() ?? '';
  const impactLabel = WALK_IMPACT_OPTIONS.find(
    (option) => option.value === props.walk.impact,
  )?.label;

  return (
    <section
      className="walk-reentry-panel"
      data-walk-focus-stage
      aria-labelledby="walk-reentry-title"
    >
      <div className="walk-reentry-success" role="status">
        <span aria-hidden="true">✓</span>
        <p>Прогулка завершена</p>
      </div>
      <div className="walk-reentry-heading">
        <p className="section-page-eyebrow">Возвращение</p>
        <h1 id="walk-reentry-title" ref={titleRef} tabIndex={-1}>
          Что дальше?
        </h1>
        <h2>
          {unavailable
            ? 'Связанное решение больше недоступно'
            : returnsToDecision
              ? 'Продолжить работу с решением'
              : presentation.title}
        </h2>
        <p>
          {unavailable
            ? 'Итог прогулки сохранён. Можно перейти к списку решений.'
            : returnsToDecision
              ? 'Итог сохранён отдельно. Прогулка не меняет статус решения.'
              : presentation.description}
        </p>
        {returnsToDecision && props.decisionContext?.status === 'ready' ? (
          <p>{props.decisionContext.title}</p>
        ) : null}
      </div>
      {impactLabel === undefined && props.walk.result === null ? null : (
        <dl className="walk-reentry-summary">
          {impactLabel === undefined ? null : (
            <div>
              <dt>Эффект прогулки</dt>
              <dd>{impactLabel}</dd>
            </div>
          )}
          {props.walk.result === null ? null : (
            <div>
              <dt>Сохранённый вывод</dt>
              <dd>{props.walk.result}</dd>
            </div>
          )}
        </dl>
      )}
      {nextStep.length === 0 ? null : (
        <div className="walk-reentry-next-step">
          <span>Следующий шаг</span>
          <strong>{nextStep}</strong>
        </div>
      )}
      {props.error === null ? null : (
        <p className="walk-completion-error" role="alert">
          {props.error}
        </p>
      )}
      <div className="walk-reentry-actions">
        <button
          className="primary-button"
          type="button"
          disabled={props.isSaving || loadingDecision}
          onClick={props.onPrimary}
        >
          {unavailable
            ? 'Перейти в Решения'
            : loadingDecision
              ? 'Проверяем решение…'
              : returnsToDecision
                ? 'Вернуться к решению'
                : presentation.primaryLabel}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onCloseWithoutContinuation}
        >
          Закрыть без продолжения
        </button>
      </div>
    </section>
  );
}

interface StateRangeProps {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}

function StateRange(props: StateRangeProps) {
  return (
    <label className="walk-completion-state-range">
      <span>
        {props.label} <strong>{props.value}</strong>
      </span>
      <input
        type="range"
        min="0"
        max="10"
        step="1"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function StateSnapshot({ snapshot }: { readonly snapshot: WalkStateSnapshot }) {
  return (
    <dl className="walk-completion-before-values">
      <div>
        <dt>Энергия</dt>
        <dd>{snapshot.energy}</dd>
      </div>
      <div>
        <dt>Напряжение</dt>
        <dd>{snapshot.tension}</dd>
      </div>
      <div>
        <dt>Ясность</dt>
        <dd>{snapshot.clarity}</dd>
      </div>
    </dl>
  );
}

function getWalkLabel(walk: Walk): string {
  return walk.intent === null
    ? WALK_TYPE_PRESENTATION[walk.type].label
    : WALK_INTENT_PRESENTATION[walk.intent].shortLabel;
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} ч ${String(minutes).padStart(2, '0')} мин`;
  if (minutes > 0) return `${minutes} мин`;
  return `${seconds} сек`;
}

function formatTime(value: Date | null): string {
  if (value === null) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function useInitialFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const target = ref.current;
    if (target === null) return;
    target.focus({ preventScroll: true });
    target.closest('[data-walk-focus-stage]')?.scrollIntoView({ block: 'start' });
  }, []);
  return ref;
}
