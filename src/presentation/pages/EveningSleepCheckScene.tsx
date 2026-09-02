import { useEffect, useMemo, useRef, useState } from 'react';
import type { SleepCheckApplicationService } from '../../application';
import {
  SLEEP_CHECK_ANSWER,
  type DayDate,
  type EveningCycle,
  type SleepCheckAnswerValue,
  type SubjectiveRating,
} from '../../domain';
import { SubjectiveRatingScale } from '../components/SubjectiveRatingScale';
import '../styles/evening-sleep-check.css';
import {
  buildEveningSleepCheckModel,
  type EveningSleepCheckModel,
} from './EveningSleepCheckPresentation';

type SleepCheckService = Pick<
  SleepCheckApplicationService,
  | 'getStored'
  | 'setAfterRatings'
  | 'answerQuestion'
  | 'chooseCorrectiveAction'
  | 'completeCorrectiveAction'
  | 'retryQuestion'
  | 'complete'
>;

interface EveningSleepCheckSceneProps {
  readonly cycleDate: DayDate;
  readonly service: SleepCheckService;
  readonly onContinued: () => void;
  readonly readOnly?: boolean;
}

type LoadState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string }>
  | Readonly<{ status: 'ready'; cycle: EveningCycle }>;

export function EveningSleepCheckScene({
  cycleDate,
  service,
  onContinued,
  readOnly = false,
}: EveningSleepCheckSceneProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [calmDraft, setCalmDraft] = useState<SubjectiveRating | null>(null);
  const [readinessDraft, setReadinessDraft] = useState<SubjectiveRating | null>(null);
  const [thoughtDraft, setThoughtDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const retryRef = useRef<(() => Promise<void>) | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void service
      .getStored(cycleDate)
      .then((cycle) => {
        if (cancelled) return;
        if (cycle === null) {
          setState({ status: 'error', message: 'Проверка сна для этого вечера не найдена.' });
          return;
        }
        setState({ status: 'ready', cycle });
      })
      .catch(() => {
        if (!cancelled)
          setState({ status: 'error', message: 'Не удалось загрузить проверку сна.' });
      });
    return () => {
      cancelled = true;
    };
  }, [cycleDate, reloadToken, service]);

  const model = useMemo(
    () => (state.status === 'ready' ? buildEveningSleepCheckModel(state.cycle, readOnly) : null),
    [readOnly, state],
  );

  useEffect(() => {
    if (model !== null) {
      requestAnimationFrame(() =>
        sceneRef.current?.querySelector<HTMLElement>('[data-sleep-focus]')?.focus(),
      );
    }
  }, [model]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  function reload(): void {
    retryRef.current = null;
    setError(null);
    setStale(false);
    setState({ status: 'loading' });
    setReloadToken((value) => value + 1);
  }

  async function run(operation: () => Promise<EveningCycle>, continued = false): Promise<void> {
    if (busy || readOnly) return;
    retryRef.current = () => run(operation, continued);
    setBusy(true);
    setError(null);
    setStale(false);
    try {
      const cycle = await operation();
      setState({ status: 'ready', cycle });
      if (continued) onContinued();
    } catch (reason: unknown) {
      const concurrent =
        typeof reason === 'object' &&
        reason !== null &&
        'code' in reason &&
        reason.code === 'sleep_check.concurrent_change';
      setError(
        concurrent
          ? 'Данные вечера изменились в другом окне. Обновите и повторите.'
          : 'Не удалось сохранить ответ. Проверьте соединение и повторите.',
      );
      setStale(concurrent);
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') return <EveningSleepCheckSceneState status="loading" />;
  if (state.status === 'error') {
    return <EveningSleepCheckSceneState status="error" message={state.message} onRetry={reload} />;
  }

  return (
    <section
      className="evening-sleep-check"
      data-sleep-check-state="ready"
      aria-busy={busy}
      ref={sceneRef}
    >
      <EveningSleepCheckSceneView
        model={model!}
        calmDraft={calmDraft}
        readinessDraft={readinessDraft}
        thoughtDraft={thoughtDraft}
        busy={busy}
        error={error}
        stale={stale}
        errorRef={errorRef}
        onCalmChange={setCalmDraft}
        onReadinessChange={setReadinessDraft}
        onThoughtChange={setThoughtDraft}
        onSaveRatings={() => {
          if (calmDraft !== null && readinessDraft !== null) {
            void run(() => service.setAfterRatings(cycleDate, calmDraft, readinessDraft));
          }
        }}
        onAnswer={(answer) => {
          if (model?.question === null || model === null) return;
          const operation =
            model.phase === 'retry'
              ? () => service.retryQuestion(cycleDate, model.question!.id, answer)
              : () => service.answerQuestion(cycleDate, model.question!.id, answer);
          void run(operation);
        }}
        onCorrectiveAction={() => {
          const action = model?.correctiveAction;
          if (action === null || action === undefined) return;
          void run(
            action.selected
              ? () =>
                  service.completeCorrectiveAction(
                    cycleDate,
                    action.questionId,
                    action.captureRequired ? thoughtDraft : null,
                  )
              : () => service.chooseCorrectiveAction(cycleDate, action.questionId, action.action),
          );
        }}
        onComplete={() => void run(() => service.complete(cycleDate), true)}
        onRetryOperation={() => void retryRef.current?.()}
        onReload={reload}
      />
    </section>
  );
}

export function EveningSleepCheckSceneState({
  status,
  message,
  onRetry,
}: {
  readonly status: 'loading' | 'error';
  readonly message?: string;
  readonly onRetry?: () => void;
}) {
  return (
    <section
      className="evening-sleep-check evening-sleep-check-state"
      data-sleep-check-state={status}
    >
      <p className="evening-sleep-check-kicker">Сон</p>
      <h3>Проверка перед сном</h3>
      {status === 'loading' ? (
        <p>Собираем сохранённое состояние вечера…</p>
      ) : (
        <div role="alert" tabIndex={-1} autoFocus>
          <p>{message}</p>
          {onRetry === undefined ? null : <button onClick={onRetry}>Повторить</button>}
        </div>
      )}
    </section>
  );
}

export function EveningSleepCheckSceneView({
  model,
  calmDraft,
  readinessDraft,
  thoughtDraft,
  busy,
  error,
  stale,
  errorRef,
  onCalmChange,
  onReadinessChange,
  onThoughtChange,
  onSaveRatings,
  onAnswer,
  onCorrectiveAction,
  onComplete,
  onRetryOperation,
  onReload,
}: {
  readonly model: EveningSleepCheckModel;
  readonly calmDraft: SubjectiveRating | null;
  readonly readinessDraft: SubjectiveRating | null;
  readonly thoughtDraft: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly stale: boolean;
  readonly errorRef?: React.RefObject<HTMLDivElement | null>;
  readonly onCalmChange: (value: SubjectiveRating) => void;
  readonly onReadinessChange: (value: SubjectiveRating) => void;
  readonly onThoughtChange: (value: string) => void;
  readonly onSaveRatings: () => void;
  readonly onAnswer: (answer: SleepCheckAnswerValue) => void;
  readonly onCorrectiveAction: () => void;
  readonly onComplete: () => void;
  readonly onRetryOperation: () => void;
  readonly onReload: () => void;
}) {
  if (model.phase === 'legacy') {
    return (
      <article className="evening-sleep-check-focus" data-sleep-phase="legacy">
        <p className="evening-sleep-check-kicker">Сохранённый вечер</p>
        <h3 data-sleep-focus tabIndex={-1}>
          Проверка перед сном
        </h3>
        <p>{model.legacyMessage}</p>
      </article>
    );
  }
  return (
    <article className="evening-sleep-check-focus" data-sleep-phase={model.phase}>
      <header>
        <p className="evening-sleep-check-kicker">{model.readOnly ? 'Сохранённый сон' : 'Сон'}</p>
        <h3
          data-sleep-focus={model.phase === 'after-ratings' ? 'true' : undefined}
          tabIndex={model.phase === 'after-ratings' ? -1 : undefined}
        >
          Проверка перед сном
        </h3>
        {model.progress === null ? null : (
          <p className="evening-sleep-check-progress">{model.progress}</p>
        )}
      </header>
      {busy ? (
        <p className="evening-sleep-check-saving" role="status">
          Сохраняем…
        </p>
      ) : null}
      {error === null ? null : (
        <div className="evening-sleep-check-error" role="alert" tabIndex={-1} ref={errorRef}>
          <p>{error}</p>
          <button type="button" onClick={stale ? onReload : onRetryOperation}>
            {stale ? 'Обновить данные' : 'Повторить'}
          </button>
        </div>
      )}
      {model.phase === 'after-ratings' ? (
        <div className="evening-sleep-check-ratings">
          <SubjectiveRatingScale
            name="calm-after"
            label="Насколько спокойна голова?"
            value={calmDraft}
            disabled={busy}
            onChange={onCalmChange}
          />
          <SubjectiveRatingScale
            name="readiness-after"
            label="Насколько ты готов ко сну?"
            value={readinessDraft}
            disabled={busy}
            onChange={onReadinessChange}
          />
          <button
            className="primary-button"
            type="button"
            disabled={busy || calmDraft === null || readinessDraft === null}
            onClick={onSaveRatings}
          >
            {busy ? 'Сохраняем…' : 'Сохранить оценки'}
          </button>
        </div>
      ) : null}
      {model.phase === 'question' || model.phase === 'retry' ? (
        <div className="evening-sleep-check-question">
          <p className="evening-sleep-check-question-label">
            {model.phase === 'retry' ? 'Проверим ещё раз' : 'Один короткий вопрос'}
          </p>
          <h4 data-sleep-focus tabIndex={-1}>
            {model.question?.prompt}
          </h4>
          {!model.readOnly ? (
            <div className="evening-sleep-check-answers">
              <button
                type="button"
                data-sleep-answer="YES"
                disabled={busy}
                onClick={() => onAnswer(SLEEP_CHECK_ANSWER.yes)}
              >
                Да
              </button>
              <button
                type="button"
                data-sleep-answer="NO"
                disabled={busy}
                onClick={() => onAnswer(SLEEP_CHECK_ANSWER.no)}
              >
                Нет
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {model.phase === 'corrective-action' && model.correctiveAction !== null ? (
        <div className="evening-sleep-check-corrective">
          <h4 data-sleep-focus tabIndex={-1}>
            {model.correctiveAction.label}
          </h4>
          {model.correctiveAction.captureRequired && model.correctiveAction.selected ? (
            <label>
              Что оставить на завтра?
              <textarea
                maxLength={280}
                value={thoughtDraft}
                disabled={busy}
                onChange={(event) => onThoughtChange(event.currentTarget.value)}
              />
            </label>
          ) : null}
          {!model.readOnly ? (
            <button
              className="primary-button"
              type="button"
              disabled={
                busy ||
                (model.correctiveAction.captureRequired &&
                  model.correctiveAction.selected &&
                  thoughtDraft.trim().length === 0)
              }
              onClick={onCorrectiveAction}
            >
              {busy ? 'Сохраняем…' : model.correctiveAction.selected ? 'Готово' : 'Начать'}
            </button>
          ) : null}
        </div>
      ) : null}
      {model.phase === 'summary' ? (
        <div className="evening-sleep-check-summary">
          <h4 data-sleep-focus tabIndex={-1}>
            Вечер можно отпустить
          </h4>
          <dl>
            <div>
              <dt>Спокойствие</dt>
              <dd>
                {model.readOnly ? `${model.calm?.before} → ` : ''}
                {model.calm?.after}/5
              </dd>
            </div>
            <div>
              <dt>Готовность ко сну</dt>
              <dd>
                {model.readOnly ? `${model.sleepReadiness?.before} → ` : ''}
                {model.sleepReadiness?.after}/5
              </dd>
            </div>
          </dl>
          {model.completedActionLabel === null ? null : (
            <p>Завершённое действие: {model.completedActionLabel}</p>
          )}
          {!model.readOnly ? (
            <button className="primary-button" type="button" disabled={busy} onClick={onComplete}>
              {busy ? 'Сохраняем…' : 'Завершить вечер →'}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
