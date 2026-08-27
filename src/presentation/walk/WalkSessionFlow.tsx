import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  WALK_INTENT,
  WALK_MODE,
  WALK_REFLECTION_TEMPLATE,
  WALK_STATUS,
  type Walk,
  type WalkIntent,
  type WalkReflectionTemplate,
  type WalkStateSnapshot,
} from '../../domain';
import { formatStopwatch } from './WalkTimer';
import {
  WALK_INTENT_OPTIONS,
  WALK_INTENT_PRESENTATION,
  type WalkDurationMinutes,
} from './WalkSessionPresentation';
import { WALK_TYPE_PRESENTATION } from './walkPresentation';
import { WalkReflectionGuidancePanel, WalkReflectionTemplateSelector } from './WalkReflectionFlow';
import type { RoutineWalkLaunchRequest } from '../routine/RoutineWalkNavigation';
import type { DecisionWalkLaunchRequest } from '../decision/DecisionWalkNavigation';
import { DECISION_WALK_DEFAULT_QUESTION } from '../../application';

export interface WalkPreparationDraft {
  readonly intent: WalkIntent;
  readonly durationMinutes: WalkDurationMinutes;
  readonly reflectionQuestion: string;
  readonly reflectionTemplate: WalkReflectionTemplate | null;
  readonly beforeState: WalkStateSnapshot | null;
}

interface WalkCenterPanelProps {
  readonly recommendationEntry?: ReactNode;
  readonly captureEntry?: ReactNode;
  readonly hasActiveWalk: boolean;
  readonly onBegin: () => void;
  readonly onQuickStart: (intent: WalkIntent) => void;
  readonly onReturnToActive?: () => void;
}

export function WalkCenterPanel(props: WalkCenterPanelProps) {
  const titleRef = useInitialFocus<HTMLHeadingElement>();
  return (
    <section
      className="walk-session-center"
      aria-labelledby="walk-session-center-title"
      data-walk-focus-stage
    >
      <div className="walk-session-center-copy">
        <p className="section-page-eyebrow">Пространство для движения</p>
        <h1 id="walk-session-center-title" ref={titleRef} tabIndex={-1}>
          Прогулки
        </h1>
        <p>
          Выберите, что вам сейчас нужнее. LifeOS сохранит подготовку, ход прогулки и ваши мысли —
          без лишнего контроля.
        </p>
        {props.recommendationEntry ?? (
          <button
            className="primary-button walk-session-primary-action"
            type="button"
            onClick={props.hasActiveWalk ? props.onReturnToActive : props.onBegin}
          >
            {props.hasActiveWalk ? 'Вернуться к прогулке' : 'Начать прогулку'}
          </button>
        )}
        {props.captureEntry}
      </div>

      <div className="walk-session-quick-start" aria-label="Выбор режима прогулки">
        <div className="walk-session-quick-heading">
          <span>Выберите режим</span>
          <small>Можно сразу перейти к подготовке</small>
        </div>
        <div className="walk-session-quick-grid">
          {WALK_INTENT_OPTIONS.map((intent) => {
            const presentation = WALK_INTENT_PRESENTATION[intent];
            return (
              <button
                className="walk-session-quick-card"
                type="button"
                key={intent}
                data-walk-quick-intent={intent}
                disabled={props.hasActiveWalk}
                onClick={() => props.onQuickStart(intent)}
              >
                <strong>{presentation.shortLabel}</strong>
                <span>{presentation.description}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface WalkIntentSelectorProps {
  readonly selectedIntent: WalkIntent;
  readonly onSelect: (intent: WalkIntent) => void;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}

export function WalkIntentSelector(props: WalkIntentSelectorProps) {
  const titleRef = useInitialFocus<HTMLHeadingElement>();
  return (
    <section
      className="walk-session-step"
      aria-labelledby="walk-intent-title"
      data-walk-focus-stage
    >
      <div className="walk-session-step-heading">
        <p className="section-page-eyebrow">Шаг 1 из 2</p>
        <h1 id="walk-intent-title" ref={titleRef} tabIndex={-1}>
          Какой будет эта прогулка?
        </h1>
        <p>Намерение задаёт мягкий фокус, но не ограничивает прогулку.</p>
      </div>
      <fieldset className="walk-intent-fieldset">
        <legend className="visually-hidden">Намерение прогулки</legend>
        <div className="walk-intent-grid">
          {WALK_INTENT_OPTIONS.map((intent) => {
            const presentation = WALK_INTENT_PRESENTATION[intent];
            return (
              <label className="walk-intent-option" key={intent}>
                <input
                  type="radio"
                  name="walk-intent"
                  value={intent}
                  checked={props.selectedIntent === intent}
                  onChange={() => props.onSelect(intent)}
                />
                <span className="walk-intent-option-copy">
                  <strong>{presentation.label}</strong>
                  <small>{presentation.description}</small>
                </span>
                <span className="walk-intent-option-mark" aria-hidden="true" />
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="walk-form-actions walk-session-step-actions">
        <button className="secondary-button" type="button" onClick={props.onBack}>
          Назад
        </button>
        <button className="primary-button" type="button" onClick={props.onContinue}>
          Продолжить
        </button>
      </div>
    </section>
  );
}

interface WalkPreparationFormProps {
  readonly currentState?: WalkStateSnapshot | null;
  readonly onStateChange?: (state: WalkStateSnapshot | null) => void;
  readonly decisionLaunchRequest?: DecisionWalkLaunchRequest | null;
  readonly routineLaunchRequest?: RoutineWalkLaunchRequest | null;
  readonly intent: WalkIntent;
  readonly isSaving: boolean;
  readonly onBack: () => void;
  readonly onStart: (draft: WalkPreparationDraft) => void;
}

const WALK_DURATION_OPTIONS: readonly WalkDurationMinutes[] = [20, 30, 40];

export function WalkPreparationForm(props: WalkPreparationFormProps) {
  const titleRef = useInitialFocus<HTMLHeadingElement>();
  const [durationMinutes, setDurationMinutes] = useState<WalkDurationMinutes>(30);
  const [reflectionQuestion, setReflectionQuestion] = useState('');
  const [reflectionTemplate, setReflectionTemplate] = useState<WalkReflectionTemplate>(
    props.decisionLaunchRequest == null
      ? WALK_REFLECTION_TEMPLATE.freeThought
      : WALK_REFLECTION_TEMPLATE.decision,
  );
  const [localState, setLocalState] = useState<WalkStateSnapshot | null>(null);
  const beforeState = props.currentState === undefined ? localState : props.currentState;
  const setBeforeState = props.onStateChange ?? setLocalState;
  const presentation = WALK_INTENT_PRESENTATION[props.intent];

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onStart({
      intent: props.intent,
      durationMinutes,
      reflectionQuestion: reflectionQuestion.trim(),
      reflectionTemplate: props.intent === WALK_INTENT.reflection ? reflectionTemplate : null,
      beforeState,
    });
  }

  return (
    <form
      className="walk-session-step walk-preparation-form"
      data-walk-focus-stage
      onSubmit={submit}
    >
      <div className="walk-session-step-heading">
        <p className="section-page-eyebrow">Шаг 2 из 2 · {presentation.shortLabel}</p>
        <h1 ref={titleRef} tabIndex={-1}>
          Подготовка к прогулке
        </h1>
        <p>Выберите ориентир по времени. Остальное можно оставить пустым.</p>
      </div>

      {props.decisionLaunchRequest == null ? null : (
        <div className="walk-linked-context" aria-label="Связано с решением">
          <span>Связано с решением</span>
          <strong>{props.decisionLaunchRequest.title}</strong>
        </div>
      )}
      {props.routineLaunchRequest == null ? null : (
        <div className="walk-routine-source" aria-label="Из распорядка">
          <span>Из распорядка · {props.routineLaunchRequest.plannedTimeLabel}</span>
          <strong>{props.routineLaunchRequest.sourceTitle}</strong>
          <span>
            {props.routineLaunchRequest.nextStep === null
              ? 'После прогулки — вернуться к распорядку'
              : `Далее: ${props.routineLaunchRequest.nextStep}`}
          </span>
        </div>
      )}

      <fieldset className="walk-preparation-section" disabled={props.isSaving}>
        <legend>Продолжительность</legend>
        <div className="walk-duration-choice-grid">
          {WALK_DURATION_OPTIONS.map((minutes) => (
            <label className="walk-duration-choice" key={minutes}>
              <input
                type="radio"
                name="walk-duration"
                value={minutes}
                checked={durationMinutes === minutes}
                onChange={() => setDurationMinutes(minutes)}
              />
              <span>{minutes} минут</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="walk-preparation-details">
        {props.intent === WALK_INTENT.reflection ? (
          <WalkReflectionTemplateSelector
            selectedTemplate={reflectionTemplate}
            isDisabled={props.isSaving}
            onSelect={setReflectionTemplate}
          />
        ) : null}

        <div className="walk-preparation-personalization">
          {props.intent === WALK_INTENT.reflection ? (
            <label className="walk-reflection-field">
              <span>
                Вопрос для размышления <small>необязательно</small>
              </span>
              <textarea
                rows={2}
                maxLength={500}
                value={reflectionQuestion}
                disabled={props.isSaving}
                placeholder={
                  props.decisionLaunchRequest == null
                    ? presentation.prompt
                    : DECISION_WALK_DEFAULT_QUESTION
                }
                onChange={(event) => setReflectionQuestion(event.currentTarget.value)}
              />
            </label>
          ) : null}

          <WalkBeforeStateInput
            value={beforeState}
            onChange={setBeforeState}
            disabled={props.isSaving}
          />
        </div>
      </div>

      <div className="walk-form-actions walk-session-step-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onBack}
        >
          Назад
        </button>
        <button className="primary-button" type="submit" disabled={props.isSaving}>
          {props.isSaving ? 'Запускаем…' : 'Начать прогулку'}
        </button>
      </div>
    </form>
  );
}

interface WalkStateRangeProps {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}

export function WalkBeforeStateInput({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: WalkStateSnapshot | null;
  readonly onChange: (value: WalkStateSnapshot | null) => void;
  readonly disabled?: boolean;
}) {
  const scores = value ?? { energy: 5, tension: 5, clarity: 5 };
  return (
    <section className="walk-before-state" aria-labelledby="walk-before-state-title">
      <label className="walk-before-state-toggle">
        <input
          type="checkbox"
          checked={value !== null}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked ? scores : null)}
        />
        <span>
          <strong id="walk-before-state-title">Отметить состояние перед прогулкой</strong>
          <small>Три оценки от 0 до 10, только если это сейчас полезно.</small>
        </span>
      </label>
      <fieldset className="walk-before-state-fields" disabled={value === null || disabled}>
        <legend className="visually-hidden">Состояние перед прогулкой</legend>
        <WalkStateRange
          label="Энергия"
          value={scores.energy}
          onChange={(energy) => onChange({ ...scores, energy })}
        />
        <WalkStateRange
          label="Напряжение"
          value={scores.tension}
          onChange={(tension) => onChange({ ...scores, tension })}
        />
        <WalkStateRange
          label="Ясность"
          value={scores.clarity}
          onChange={(clarity) => onChange({ ...scores, clarity })}
        />
      </fieldset>
    </section>
  );
}

function WalkStateRange(props: WalkStateRangeProps) {
  return (
    <label className="walk-state-range">
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

interface WalkActivePanelProps {
  readonly captureControls?: ReactNode;
  readonly decisionTitle?: string | null;
  readonly abandonConfirmationOpen?: boolean;
  readonly onRequestAbandon?: () => void;
  readonly onConfirmAbandon?: () => void;
  readonly walk: Walk;
  readonly now?: Date;
  readonly isSaving: boolean;
  readonly finishConfirmationOpen: boolean;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onRequestFinish: () => void;
  readonly onConfirmFinish: () => void;
  readonly onCancelFinish: () => void;
  readonly onAdvanceReflection: () => void;
  readonly onDisableReflectionGuidance: () => void;
}

export function WalkActivePanel(props: WalkActivePanelProps) {
  const titleRef = useInitialFocus<HTMLHeadingElement>();
  const finishButtonRef = useRef<HTMLButtonElement>(null);
  const abandonButtonRef = useRef<HTMLButtonElement>(null);
  const lastTerminalAction = useRef<'complete' | 'abandon'>('complete');
  const cancelFinishButtonRef = useRef<HTMLButtonElement>(null);
  const finishWasOpenRef = useRef(false);
  const paused = props.walk.status === WALK_STATUS.paused;
  const now = useLiveNow(props.now, !paused);
  const latestActivityAt =
    props.walk.pausedAt ?? props.walk.pauseIntervals.at(-1)?.endedAt ?? props.walk.startedAt;
  const elapsedAt =
    latestActivityAt !== null && now.getTime() < latestActivityAt.getTime()
      ? latestActivityAt
      : now;
  const elapsedSeconds = Math.floor(
    (props.walk.elapsedDurationMilliseconds(elapsedAt) ?? 0) / 1000,
  );
  const activeLabel =
    props.walk.intent === null
      ? WALK_TYPE_PRESENTATION[props.walk.type].label
      : WALK_INTENT_PRESENTATION[props.walk.intent].shortLabel;
  const timerTarget =
    props.walk.mode === WALK_MODE.timer && props.walk.timerTargetMinutes !== null
      ? `${props.walk.timerTargetMinutes} минут`
      : 'Без таймера';

  useEffect(() => {
    if (props.finishConfirmationOpen || props.abandonConfirmationOpen) {
      lastTerminalAction.current = props.abandonConfirmationOpen ? 'abandon' : 'complete';
      finishWasOpenRef.current = true;
      cancelFinishButtonRef.current?.focus();
      return;
    }
    if (finishWasOpenRef.current) {
      finishWasOpenRef.current = false;
      (lastTerminalAction.current === 'abandon'
        ? abandonButtonRef
        : finishButtonRef
      ).current?.focus();
    }
  }, [props.finishConfirmationOpen, props.abandonConfirmationOpen]);

  return (
    <section
      className={`walk-active-panel ${paused ? 'walk-active-panel-paused' : ''}`}
      aria-labelledby="walk-active-title"
      data-walk-focus-stage
    >
      <div className="walk-active-status-row">
        <span className="walk-active-status-dot" aria-hidden="true" />
        <p>{paused ? 'Прогулка на паузе' : 'Прогулка идёт'}</p>
      </div>
      <div className="walk-active-heading">
        <div>
          <p className="section-page-eyebrow">Режим прогулки</p>
          <h1 id="walk-active-title" ref={titleRef} tabIndex={-1}>
            {activeLabel}
          </h1>
        </div>
        <p
          className="walk-active-elapsed"
          role="timer"
          aria-label={`Прошло ${formatStopwatch(elapsedSeconds)}`}
        >
          <span>Прошло</span>
          <strong>{formatStopwatch(elapsedSeconds)}</strong>
        </p>
      </div>

      {props.decisionTitle == null ? null : (
        <div className="walk-linked-context" aria-label="Связано с решением">
          <span>Связано с решением</span>
          <strong>{props.decisionTitle}</strong>
        </div>
      )}
      {props.walk.returnContext?.routineContext == null ? null : (
        <p className="walk-routine-source">
          Из распорядка: {props.walk.returnContext.routineContext.sourceTitle}
        </p>
      )}

      <div className="walk-active-focus">
        <span>Вопрос прогулки</span>
        <blockquote>{props.walk.reflectionQuestion}</blockquote>
      </div>

      <WalkReflectionGuidancePanel
        walk={props.walk}
        isSaving={props.isSaving}
        onAdvance={props.onAdvanceReflection}
        onDisable={props.onDisableReflectionGuidance}
      />

      <dl className="walk-active-details">
        <div>
          <dt>Ориентир</dt>
          <dd>{timerTarget}</dd>
        </div>
        <div>
          <dt>Начало</dt>
          <dd>
            <time dateTime={props.walk.startedAt?.toISOString()}>
              {formatStartedTime(props.walk.startedAt)}
            </time>
          </dd>
        </div>
      </dl>

      {props.captureControls}

      {props.finishConfirmationOpen || props.abandonConfirmationOpen ? (
        <div
          className="walk-finish-confirmation"
          role="group"
          aria-label={
            props.abandonConfirmationOpen ? 'Подтверждение прерывания' : 'Подтверждение завершения'
          }
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            props.onCancelFinish();
          }}
        >
          <div>
            <strong>
              {props.abandonConfirmationOpen ? 'Прервать прогулку?' : 'Завершить прогулку?'}
            </strong>
            <span>
              {props.abandonConfirmationOpen
                ? 'Итог и возвращение не будут созданы.'
                : 'Время прогулки сохранится сразу. Затем останется коротко отметить итог.'}
            </span>
          </div>
          <div className="walk-form-actions">
            <button
              ref={cancelFinishButtonRef}
              className="secondary-button"
              type="button"
              disabled={props.isSaving}
              onClick={props.onCancelFinish}
            >
              Остаться
            </button>
            <button
              className={props.abandonConfirmationOpen ? 'danger-button' : 'primary-button'}
              type="button"
              disabled={props.isSaving}
              onClick={
                props.abandonConfirmationOpen ? props.onConfirmAbandon : props.onConfirmFinish
              }
            >
              {props.isSaving
                ? 'Сохраняем…'
                : props.abandonConfirmationOpen
                  ? 'Прервать'
                  : 'Завершить'}
            </button>
          </div>
        </div>
      ) : (
        <div className="walk-active-actions">
          {paused ? (
            <button
              className="primary-button"
              type="button"
              disabled={props.isSaving}
              onClick={props.onResume}
            >
              Продолжить
            </button>
          ) : (
            <button
              className="secondary-button"
              type="button"
              disabled={props.isSaving}
              onClick={props.onPause}
            >
              Пауза
            </button>
          )}
          <button
            ref={finishButtonRef}
            className="walk-finish-button"
            type="button"
            disabled={props.isSaving}
            onClick={props.onRequestFinish}
          >
            Завершить
          </button>
          {props.onRequestAbandon === undefined ? null : (
            <button
              ref={abandonButtonRef}
              className="secondary-button"
              type="button"
              disabled={props.isSaving}
              onClick={props.onRequestAbandon}
            >
              Прервать
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function useLiveNow(fixedNow: Date | undefined, shouldTick: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (fixedNow !== undefined) return;
    if (!shouldTick) return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [fixedNow, shouldTick]);
  return fixedNow ?? now;
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

function formatStartedTime(value: Date | null): string {
  if (value === null) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}
