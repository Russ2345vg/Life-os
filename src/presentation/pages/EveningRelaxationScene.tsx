import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { RelaxationApplicationService, SleepCheckApplicationService } from '../../application';
import {
  RELAXATION_PRACTICE,
  SCREEN_FREE_STATE,
  type DayDate,
  type EveningCycle,
  type RelaxationPractice,
  type SubjectiveRating,
} from '../../domain';
import { SubjectiveRatingScale } from '../components/SubjectiveRatingScale';
import '../styles/evening-relaxation.css';
import {
  RELAXATION_PRACTICE_OPTIONS,
  buildEveningRelaxationModel,
  type EveningRelaxationModel,
} from './EveningRelaxationPresentation';

export type RelaxationSceneAction =
  | 'complete-drink'
  | 'complete-hygiene'
  | 'choose-today'
  | 'choose-default'
  | 'duration'
  | 'start-practice-timer'
  | 'complete-practice'
  | 'start-screen-free'
  | 'shorten-screen-free'
  | 'skip-screen-free'
  | 'before-ratings'
  | 'continue';

type RelaxationService = Pick<
  RelaxationApplicationService,
  | 'getOrInitialize'
  | 'getStored'
  | 'choosePractice'
  | 'setPracticeDuration'
  | 'completeDrink'
  | 'completeHygiene'
  | 'startPracticeTimer'
  | 'completePractice'
  | 'startScreenFree'
  | 'shortenScreenFree'
  | 'skipScreenFree'
  | 'complete'
>;

interface EveningRelaxationSceneProps {
  readonly cycleDate: DayDate;
  readonly service: RelaxationService;
  readonly sleepCheck?: Pick<SleepCheckApplicationService, 'setBeforeRatings'>;
  readonly onContinued: () => void;
  readonly readOnly?: boolean;
}

type LoadState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string }>
  | Readonly<{ status: 'ready'; cycle: EveningCycle }>;

export function EveningRelaxationScene({
  cycleDate,
  service,
  sleepCheck,
  onContinued,
  readOnly = false,
}: EveningRelaxationSceneProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [busyAction, setBusyAction] = useState<RelaxationSceneAction | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationStale, setOperationStale] = useState(false);
  const [durationDraft, setDurationDraft] = useState('15');
  const [practiceDraft, setPracticeDraft] = useState<RelaxationPractice>(
    RELAXATION_PRACTICE.reading,
  );
  const [calmBefore, setCalmBefore] = useState<SubjectiveRating | null>(null);
  const [readinessBefore, setReadinessBefore] = useState<SubjectiveRating | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const busyRef = useRef(false);
  const retryRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = readOnly ? service.getStored(cycleDate) : service.getOrInitialize(cycleDate);
    void load
      .then((cycle) => {
        if (cancelled) return;
        if (cycle === null) {
          setLoadState({ status: 'error', message: 'Расслабление для этого вечера не найдено.' });
          return;
        }
        setLoadState({ status: 'ready', cycle });
        setDurationDraft(String(cycle.relaxation?.practiceDurationMinutes ?? 15));
        setPracticeDraft(cycle.relaxation?.selectedPractice ?? RELAXATION_PRACTICE.reading);
        requestAnimationFrame(focusSceneHeading);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState({ status: 'error', message: 'Не удалось загрузить расслабление.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cycleDate, readOnly, reloadToken, service]);

  const model = useMemo(
    () =>
      loadState.status === 'ready'
        ? buildEveningRelaxationModel(loadState.cycle, now, readOnly)
        : null,
    [loadState, now, readOnly],
  );

  useEffect(() => {
    if (model?.hasActiveClock !== true || readOnly) return undefined;
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, [model?.hasActiveClock, readOnly]);

  useEffect(() => {
    if (operationError !== null) errorRef.current?.focus();
  }, [operationError]);

  function focusSceneHeading(): void {
    sceneRef.current?.querySelector<HTMLElement>('[data-relaxation-focus]')?.focus();
  }

  function reload(): void {
    retryRef.current = null;
    setOperationError(null);
    setOperationStale(false);
    setLoadState({ status: 'loading' });
    setReloadToken((value) => value + 1);
  }

  function acceptCycle(cycle: EveningCycle): void {
    setLoadState({ status: 'ready', cycle });
    setDurationDraft(String(cycle.relaxation?.practiceDurationMinutes ?? 15));
    setPracticeDraft(cycle.relaxation?.selectedPractice ?? RELAXATION_PRACTICE.reading);
    setNow(new Date());
    requestAnimationFrame(focusSceneHeading);
  }

  async function runAction(
    key: RelaxationSceneAction,
    operation: () => Promise<EveningCycle>,
    continued = false,
  ): Promise<void> {
    if (busyRef.current || readOnly) return;
    retryRef.current = () => runAction(key, operation, continued);
    busyRef.current = true;
    setBusyAction(key);
    setOperationError(null);
    setOperationStale(false);
    try {
      const cycle = await operation();
      acceptCycle(cycle);
      if (continued) {
        onContinued();
      }
    } catch (reason: unknown) {
      const concurrent =
        typeof reason === 'object' &&
        reason !== null &&
        'code' in reason &&
        typeof reason.code === 'string' &&
        reason.code.endsWith('.concurrent_change');
      setOperationStale(concurrent);
      setOperationError(
        concurrent
          ? 'Данные вечера изменились в другом окне. Обновите их перед продолжением.'
          : 'Не удалось сохранить действие. Проверьте соединение и повторите.',
      );
    } finally {
      busyRef.current = false;
      setBusyAction(null);
    }
  }

  function handleAction(action: RelaxationSceneAction, value?: number): void {
    if (action === 'complete-drink') {
      void runAction(action, () => service.completeDrink(cycleDate));
    } else if (action === 'complete-hygiene') {
      void runAction(action, () => service.completeHygiene(cycleDate));
    } else if (action === 'choose-today') {
      void runAction(action, () => service.choosePractice(cycleDate, practiceDraft, false));
    } else if (action === 'choose-default') {
      void runAction(action, () => service.choosePractice(cycleDate, practiceDraft, true));
    } else if (action === 'duration') {
      const minutes = value ?? Number(durationDraft);
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 20) {
        setOperationError('Введите целое число от 5 до 20 минут.');
        return;
      }
      void runAction(action, () => service.setPracticeDuration(cycleDate, minutes));
    } else if (action === 'start-practice-timer') {
      void runAction(action, () => service.startPracticeTimer(cycleDate));
    } else if (action === 'complete-practice') {
      void runAction(action, () => service.completePractice(cycleDate));
    } else if (action === 'start-screen-free') {
      void runAction(action, () => service.startScreenFree(cycleDate));
    } else if (action === 'shorten-screen-free') {
      void runAction(action, () => service.shortenScreenFree(cycleDate));
    } else if (action === 'skip-screen-free') {
      void runAction(action, () => service.skipScreenFree(cycleDate));
    } else {
      void runAction(action, () => service.complete(cycleDate), true);
    }
  }

  if (loadState.status === 'loading') {
    return <EveningRelaxationSceneState status="loading" />;
  }
  if (loadState.status === 'error') {
    return (
      <EveningRelaxationSceneState status="error" message={loadState.message} onRetry={reload} />
    );
  }

  if (!readOnly && loadState.cycle.sleepCheck === null) {
    return (
      <EveningBeforeRelaxationRatings
        sceneRef={sceneRef}
        errorRef={errorRef}
        calm={calmBefore}
        readiness={readinessBefore}
        busy={busyAction !== null}
        error={operationError}
        stale={operationStale}
        unavailable={sleepCheck === undefined}
        onCalmChange={setCalmBefore}
        onReadinessChange={setReadinessBefore}
        onSave={() => {
          if (sleepCheck === undefined || calmBefore === null || readinessBefore === null) return;
          void runAction('before-ratings', () =>
            sleepCheck.setBeforeRatings(cycleDate, calmBefore, readinessBefore),
          );
        }}
        onRetry={() => void retryRef.current?.()}
        onReload={reload}
      />
    );
  }

  return (
    <section className="evening-relaxation" data-relaxation-state="ready" ref={sceneRef}>
      <EveningRelaxationSceneView
        model={model!}
        busyAction={busyAction}
        error={operationError}
        stale={operationStale}
        errorRef={errorRef}
        durationDraft={durationDraft}
        practiceDraft={practiceDraft}
        onDurationDraftChange={setDurationDraft}
        onPracticeDraftChange={setPracticeDraft}
        onAction={handleAction}
        onRetry={() => void retryRef.current?.()}
        onReload={reload}
      />
    </section>
  );
}

export function EveningBeforeRelaxationRatings({
  sceneRef,
  errorRef,
  calm,
  readiness,
  busy,
  error,
  stale,
  unavailable,
  onCalmChange,
  onReadinessChange,
  onSave,
  onRetry,
  onReload,
}: {
  readonly sceneRef?: React.RefObject<HTMLElement | null>;
  readonly errorRef?: React.RefObject<HTMLDivElement | null>;
  readonly calm: SubjectiveRating | null;
  readonly readiness: SubjectiveRating | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly stale: boolean;
  readonly unavailable: boolean;
  readonly onCalmChange: (value: SubjectiveRating) => void;
  readonly onReadinessChange: (value: SubjectiveRating) => void;
  readonly onSave: () => void;
  readonly onRetry: () => void;
  readonly onReload: () => void;
}) {
  return (
    <section
      className="evening-relaxation evening-relaxation-before"
      data-relaxation-state="before-ratings"
      ref={sceneRef}
    >
      <p className="evening-relaxation-kicker">Перед расслаблением</p>
      <h3 data-relaxation-focus tabIndex={-1}>
        Как ты сейчас?
      </h3>
      <p>Две короткие оценки помогут увидеть честное состояние до спокойной части вечера.</p>
      <SubjectiveRatingScale
        name="calm-before"
        label="Насколько спокойна голова?"
        value={calm}
        disabled={busy || unavailable}
        onChange={onCalmChange}
      />
      <SubjectiveRatingScale
        name="readiness-before"
        label="Насколько ты готов ко сну?"
        value={readiness}
        disabled={busy || unavailable}
        onChange={onReadinessChange}
      />
      {error === null ? null : (
        <div role="alert" tabIndex={-1} ref={errorRef}>
          <p>{error}</p>
          <button type="button" onClick={stale ? onReload : onRetry}>
            {stale ? 'Обновить данные' : 'Повторить'}
          </button>
        </div>
      )}
      {unavailable ? <p role="alert">Сохранение оценок сейчас недоступно.</p> : null}
      <button
        className="primary-button"
        type="button"
        disabled={busy || unavailable || calm === null || readiness === null}
        onClick={onSave}
      >
        {busy ? 'Сохраняем…' : 'Сохранить и продолжить'}
      </button>
    </section>
  );
}

export function EveningRelaxationSceneState({
  status,
  message,
  onRetry,
}: {
  readonly status: 'loading' | 'error';
  readonly message?: string;
  readonly onRetry?: () => void;
}) {
  return (
    <section className="evening-relaxation evening-relaxation-state" data-relaxation-state={status}>
      <p className="evening-relaxation-kicker">Расслабление</p>
      <h3>Переход к спокойствию</h3>
      {status === 'loading' ? (
        <p>Готовим спокойный ритм вечера…</p>
      ) : (
        <div role="alert" tabIndex={-1}>
          <p>{message}</p>
          {onRetry === undefined ? null : (
            <button type="button" onClick={onRetry}>
              Повторить
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function EveningRelaxationSceneView({
  model,
  busyAction,
  error,
  stale = false,
  errorRef,
  durationDraft,
  practiceDraft = model.selectedPractice ?? RELAXATION_PRACTICE.reading,
  onDurationDraftChange,
  onPracticeDraftChange = () => undefined,
  onAction,
  onRetry,
  onReload,
}: {
  readonly model: EveningRelaxationModel;
  readonly busyAction: RelaxationSceneAction | null;
  readonly error: string | null;
  readonly stale?: boolean;
  readonly errorRef?: React.RefObject<HTMLDivElement | null>;
  readonly durationDraft: string;
  readonly practiceDraft?: RelaxationPractice;
  readonly onDurationDraftChange: (value: string) => void;
  readonly onPracticeDraftChange?: (value: RelaxationPractice) => void;
  readonly onAction: (action: RelaxationSceneAction, value?: number) => void;
  readonly onRetry?: () => void;
  readonly onReload?: () => void;
}) {
  if (!model.available) {
    return (
      <article className="evening-relaxation-legacy" data-relaxation-region="status">
        <p className="evening-relaxation-kicker">Сохранённое расслабление</p>
        <h3 data-relaxation-focus tabIndex={-1}>
          Переход к спокойствию
        </h3>
        <p>{model.legacyMessage}</p>
      </article>
    );
  }

  const busy = busyAction !== null;
  return (
    <div className="evening-relaxation-layout" data-read-only={model.readOnly}>
      <header className="evening-relaxation-status" data-relaxation-region="status">
        <p className="evening-relaxation-kicker">
          {model.readOnly ? 'Сохранённое расслабление' : 'Расслабление'}
        </p>
        <h3 data-relaxation-focus tabIndex={-1}>
          Переход к спокойствию
        </h3>
        <p>
          {model.readOnly
            ? 'Так проходил переход от рабочего ритма к спокойному.'
            : 'Рекомендуемый порядок помогает замедлиться, но действия можно выполнять свободно.'}
        </p>
      </header>

      <section className="evening-relaxation-essentials" data-relaxation-region="essentials">
        {model.shortMode ? null : (
          <RelaxationFact
            title="Напиток"
            complete={model.drinkCompleted}
            actionLabel="Отметить напиток"
            readOnly={model.readOnly}
            disabled={busy}
            onAction={() => onAction('complete-drink')}
          />
        )}
        <RelaxationFact
          title="Гигиена"
          complete={model.hygieneCompleted}
          actionLabel="Отметить гигиену"
          readOnly={model.readOnly}
          disabled={busy}
          onAction={() => onAction('complete-hygiene')}
        />
      </section>

      {model.shortMode ? null : (
        <section className="evening-relaxation-screen-free" data-relaxation-region="screen-free">
          <div>
            <p className="evening-relaxation-kicker">Без экранов</p>
            <h4>{model.screenFree.durationMinutes} минут тишины от экранов</h4>
            <p data-tone={model.screenFree.tone}>{model.screenFree.outcomeLabel}</p>
          </div>
          {model.readOnly ||
          model.screenFree.state === SCREEN_FREE_STATE.skipped ||
          model.screenFree.state === SCREEN_FREE_STATE.completed ||
          model.screenFree.state === 'ELAPSED' ? null : (
            <div className="evening-relaxation-actions">
              {model.screenFree.state === SCREEN_FREE_STATE.pending ? (
                <button type="button" disabled={busy} onClick={() => onAction('start-screen-free')}>
                  Начать без экранов
                </button>
              ) : null}
              {model.screenFree.durationMinutes === 25 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction('shorten-screen-free')}
                >
                  Сократить до 10 минут
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={() => onAction('skip-screen-free')}>
                Пропустить сегодня
              </button>
            </div>
          )}
        </section>
      )}

      <section className="evening-relaxation-practice" data-relaxation-region="practice">
        <div className="evening-relaxation-practice-heading">
          <p className="evening-relaxation-kicker">Практика</p>
          <h4>{model.selectedPracticeLabel}</h4>
          <p>Базовая практика: {model.defaultPracticeLabel}</p>
        </div>
        {model.readOnly ? (
          <dl className="evening-relaxation-history-facts">
            <div>
              <dt>Длительность</dt>
              <dd>{model.practiceDurationMinutes} минут</dd>
            </div>
            <div>
              <dt>Практика</dt>
              <dd>{model.practiceCompleted ? 'Выполнена' : 'Не отмечена'}</dd>
            </div>
          </dl>
        ) : (
          <>
            <label className="evening-relaxation-field">
              <span>Практика на этот вечер</span>
              <select
                aria-label="Практика расслабления"
                value={practiceDraft}
                disabled={busy || model.practiceCompleted}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  onPracticeDraftChange(event.target.value as RelaxationPractice)
                }
              >
                {RELAXATION_PRACTICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="evening-relaxation-actions">
              <button
                type="button"
                disabled={busy || model.practiceCompleted}
                onClick={() => onAction('choose-today')}
              >
                Только сегодня
              </button>
              <button
                type="button"
                disabled={busy || model.practiceCompleted}
                onClick={() => onAction('choose-default')}
              >
                Сделать практикой по умолчанию
              </button>
            </div>
            <div className="evening-relaxation-duration">
              <span>Длительность</span>
              <div className="evening-relaxation-presets">
                {(model.shortMode ? [2, 3, 4, 5] : [5, 10, 15, 20]).map((minutes) => (
                  <button
                    type="button"
                    key={minutes}
                    disabled={busy || model.practiceCompleted}
                    onClick={() => onAction('duration', minutes)}
                  >
                    {minutes} мин
                  </button>
                ))}
              </div>
              <label className="evening-relaxation-manual-duration">
                <span>Вручную</span>
                <input
                  aria-label="Длительность практики в минутах"
                  type="number"
                  min={model.durationRange.min}
                  max={model.durationRange.max}
                  step={1}
                  value={durationDraft}
                  disabled={busy || model.practiceCompleted}
                  onChange={(event) => onDurationDraftChange(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || model.practiceCompleted}
                onClick={() => onAction('duration')}
              >
                Применить длительность
              </button>
            </div>
            <div className="evening-relaxation-timer" aria-live="polite">
              <strong>{model.practiceTimer.label}</strong>
              <div className="evening-relaxation-actions">
                {model.practiceTimer.state === 'NOT_STARTED' ? (
                  <button
                    type="button"
                    disabled={busy || model.practiceCompleted}
                    onClick={() => onAction('start-practice-timer')}
                  >
                    Начать таймер
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy || model.practiceCompleted}
                  onClick={() => onAction('complete-practice')}
                >
                  Отметить выполненным
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {error === null ? null : (
        <div className="evening-relaxation-error" role="alert" tabIndex={-1} ref={errorRef}>
          <p>{error}</p>
          {onRetry === undefined ? null : (
            <button
              type="button"
              onClick={stale && onReload !== undefined ? onReload : onRetry}
              disabled={busy}
            >
              {stale && onReload !== undefined ? 'Обновить данные' : 'Повторить'}
            </button>
          )}
        </div>
      )}

      <footer className="evening-relaxation-continuation" data-relaxation-region="continuation">
        {model.readOnly ? (
          <p>{model.ready ? 'Этап был завершён.' : 'Сохранены доступные факты вечера.'}</p>
        ) : (
          <>
            <button
              type="button"
              disabled={!model.ready || busy}
              onClick={() => onAction('continue')}
            >
              {model.continuationLabel}
            </button>
            {model.disabledReason === null ? null : <p>{model.disabledReason}</p>}
          </>
        )}
      </footer>
    </div>
  );
}

function RelaxationFact({
  title,
  complete,
  actionLabel,
  readOnly,
  disabled,
  onAction,
}: {
  readonly title: string;
  readonly complete: boolean;
  readonly actionLabel: string;
  readonly readOnly: boolean;
  readonly disabled: boolean;
  readonly onAction: () => void;
}) {
  return (
    <article className="evening-relaxation-fact" data-complete={complete}>
      <div>
        <h4>{title}</h4>
        <p>{complete ? 'Выполнено' : 'Ожидает отметки'}</p>
      </div>
      {readOnly || complete ? null : (
        <button type="button" disabled={disabled} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </article>
  );
}
