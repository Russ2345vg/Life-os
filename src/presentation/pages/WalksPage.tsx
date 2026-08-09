import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AbandonWalk,
  CompleteWalk,
  CreateWalk,
  DeleteWalk,
  GetRunningWalk,
  GetWalkStatistics,
  GetWalksForDate,
  GetSpheres,
  StartWalk,
  UpdateWalkPhoto,
  UpdateWalkSphere,
  type SpheresSnapshot,
  WALK_STATISTICS_PERIOD,
  type WalkStatistics,
  type WalkStatisticsPeriod,
} from '../../application';
import {
  MAX_WALK_PHOTO_BYTES,
  MAX_WALK_RESULT_LENGTH,
  WALK_MODE,
  WALK_STATUS,
  WALK_TYPE,
  EntityId,
  type DayDate,
  type Walk,
  type WalkMode,
  type WalkPhoto,
  type WalkType,
} from '../../domain';
import { SectionDateNavigator } from '../components/SectionDateNavigator';
import { SphereBadge, SphereSelect } from '../components/SphereReference';
import {
  SPHERE_FILTER_ALL,
  SPHERE_FILTER_NONE,
  useSpheres,
} from '../components/sphereReferenceModel';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { useDateQuery } from '../date/useDateQuery';
import { WalkSubmissionGuard } from '../walk/WalkSubmissionGuard';
import { formatStopwatch, formatTimer, getWalkTimeSnapshot } from '../walk/WalkTimer';
import {
  WALK_TYPE_OPTIONS,
  WALK_TYPE_PRESENTATION,
  formatStatisticsDuration,
} from '../walk/walkPresentation';

interface WalksPageProps {
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly onDateChange: (date: DayDate) => void;
  readonly createWalk: Pick<CreateWalk, 'execute'>;
  readonly completeWalk: Pick<CompleteWalk, 'execute'>;
  readonly abandonWalk: Pick<AbandonWalk, 'execute'>;
  readonly deleteWalk: Pick<DeleteWalk, 'execute'>;
  readonly getWalkStatistics: Pick<GetWalkStatistics, 'execute'>;
  readonly getWalksForDate: Pick<GetWalksForDate, 'execute'>;
  readonly getRunningWalk: Pick<GetRunningWalk, 'execute'>;
  readonly startWalk: Pick<StartWalk, 'execute'>;
  readonly updateWalkPhoto: Pick<UpdateWalkPhoto, 'execute'>;
  readonly updateWalkSphere: Pick<UpdateWalkSphere, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
}

type WalkStatisticsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: WalkStatistics }
  | { readonly status: 'error' };

const WALK_STATISTICS_PERIOD_OPTIONS: readonly {
  readonly period: WalkStatisticsPeriod;
  readonly label: string;
}[] = [
  { period: WALK_STATISTICS_PERIOD.last7Days, label: '7 дней' },
  { period: WALK_STATISTICS_PERIOD.last30Days, label: '30 дней' },
  { period: WALK_STATISTICS_PERIOD.allTime, label: 'Всё время' },
];

export function WalksPage(props: WalksPageProps) {
  const { state, reload } = useDateQuery(props.selectedDate, props.getWalksForDate);
  const spheres = useSpheres(props.getSpheres);
  const [runningWalk, setRunningWalk] = useState<Walk | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<WalkType>(WALK_TYPE.restorative);
  const [selectedSphereId, setSelectedSphereId] = useState<string | null>(null);
  const [sphereFilter, setSphereFilter] = useState(SPHERE_FILTER_ALL);
  const [startTarget, setStartTarget] = useState<Walk | null>(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statisticsPeriod, setStatisticsPeriod] = useState<WalkStatisticsPeriod>(
    WALK_STATISTICS_PERIOD.last7Days,
  );
  const [statisticsState, setStatisticsState] = useState<WalkStatisticsState>({
    status: 'loading',
  });
  const submissionGuard = useRef(new WalkSubmissionGuard());

  const reloadRunning = useCallback(async (): Promise<void> => {
    setRunningWalk(await props.getRunningWalk.execute());
  }, [props.getRunningWalk]);

  const reloadStatistics = useCallback(async (): Promise<void> => {
    try {
      setStatisticsState({
        status: 'ready',
        value: await props.getWalkStatistics.execute(statisticsPeriod),
      });
    } catch {
      setStatisticsState({ status: 'error' });
    }
  }, [props.getWalkStatistics, statisticsPeriod]);

  useEffect(() => {
    let active = true;
    void props.getRunningWalk
      .execute()
      .then((walk) => {
        if (active) setRunningWalk(walk);
      })
      .catch(() => {
        if (active) setError('Не удалось восстановить текущую прогулку. Повторите попытку.');
      });
    return () => {
      active = false;
    };
  }, [props.getRunningWalk]);

  useEffect(() => {
    let active = true;
    void props.getWalkStatistics
      .execute(statisticsPeriod)
      .then((statistics) => {
        if (active) setStatisticsState({ status: 'ready', value: statistics });
      })
      .catch(() => {
        if (active) setStatisticsState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [props.getWalkStatistics, statisticsPeriod]);

  function changeStatisticsPeriod(period: WalkStatisticsPeriod): void {
    if (period === statisticsPeriod) return;
    setStatisticsState({ status: 'loading' });
    setStatisticsPeriod(period);
  }

  function changeDate(date: DayDate): void {
    setFormOpen(false);
    setStartTarget(null);
    setCompletionOpen(false);
    setMessage(null);
    setError(null);
    props.onDateChange(date);
  }

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await props.createWalk.execute({
        date: props.selectedDate,
        type: selectedType,
        sphereId: selectedSphereId === null ? null : EntityId.create(selectedSphereId),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setFormOpen(false);
      setMessage('Прогулка запланирована.');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось запланировать прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function start(walk: Walk, mode: WalkMode, timerTargetMinutes?: number): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await props.startWalk.execute(
        mode === WALK_MODE.timer
          ? { walkId: walk.id, mode, timerTargetMinutes: timerTargetMinutes ?? Number.NaN }
          : { walkId: walk.id, mode },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStartTarget(null);
      setMessage('Прогулка началась.');
      await Promise.all([reload(), reloadRunning(), reloadStatistics()]);
    } catch {
      setError('Не удалось начать прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function remove(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setDeletingId(walk.id.toString());
    setMessage(null);
    setError(null);
    try {
      const result = await props.deleteWalk.execute({ id: walk.id, expectedVersion: walk.version });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMessage('Прогулка удалена.');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось удалить прогулку. Повторите попытку.');
    } finally {
      setDeletingId(null);
      submissionGuard.current.release();
    }
  }

  async function complete(walk: Walk, result: string, photo: WalkPhoto | null): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const completed = await props.completeWalk.execute({
        walkId: walk.id,
        result,
        ...(photo === null ? {} : { photo }),
      });
      if (!completed.ok) {
        setError(completed.error.message);
        return;
      }
      setCompletionOpen(false);
      setRunningWalk(null);
      setMessage('Прогулка завершена.');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось завершить прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function abandon(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const abandoned = await props.abandonWalk.execute({ walkId: walk.id });
      if (!abandoned.ok) {
        setError(abandoned.error.message);
        return;
      }
      setCompletionOpen(false);
      setRunningWalk(null);
      setMessage('Прогулка прервана.');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось прервать прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function updatePhoto(walk: Walk, photo: WalkPhoto | null): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await props.updateWalkPhoto.execute({ walkId: walk.id, photo });
      if (!updated.ok) {
        setError(updated.error.message);
        return;
      }
      setMessage(photo === null ? 'Фото удалено.' : 'Фото сохранено.');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось изменить фото. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function updateSphere(walk: Walk, sphereId: string | null): Promise<void> {
    const result = await props.updateWalkSphere.execute({
      walkId: walk.id,
      expectedVersion: walk.version,
      sphereId: sphereId === null ? null : EntityId.create(sphereId),
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await reload();
  }

  return (
    <main className="section-page walks-page">
      <SectionPageHeader
        eyebrow="Этап 14.4"
        title="Прогулки"
        description="Запланируйте прогулку, выберите секундомер или таймер и отправляйтесь гулять."
        action={
          <button className="primary-button" type="button" onClick={() => setFormOpen(true)}>
            Запланировать прогулку
          </button>
        }
      />
      <WalkStatisticsPanel
        state={statisticsState}
        period={statisticsPeriod}
        onPeriodChange={changeStatisticsPeriod}
        onRetry={() => void reloadStatistics()}
      />
      <SectionDateNavigator
        currentDate={props.currentDate}
        selectedDate={props.selectedDate}
        onDateChange={changeDate}
      />

      {runningWalk === null ? null : (
        <>
          <WalkRunningPanel
            walk={runningWalk}
            isSaving={isSaving}
            onComplete={() => setCompletionOpen(true)}
            onAbandon={() => void abandon(runningWalk)}
          />
          {completionOpen ? (
            <WalkCompletionForm
              walk={runningWalk}
              isSaving={isSaving}
              onCancel={() => setCompletionOpen(false)}
              onComplete={complete}
            />
          ) : null}
        </>
      )}
      {formOpen ? (
        <WalkTypeForm
          selectedType={selectedType}
          isSaving={isSaving}
          spheres={spheres}
          sphereId={selectedSphereId}
          onSphereChange={setSelectedSphereId}
          onSelectType={setSelectedType}
          onCancel={() => setFormOpen(false)}
          onSubmit={create}
        />
      ) : null}
      {startTarget === null ? null : (
        <WalkStartForm
          walk={startTarget}
          isSaving={isSaving}
          onCancel={() => setStartTarget(null)}
          onStart={start}
        />
      )}

      {message === null ? null : (
        <p className="walks-message" role="status">
          {message}
        </p>
      )}
      {error === null ? null : (
        <p className="walks-message error" role="alert">
          {error}
        </p>
      )}

      {state.status === 'loading' ? (
        <p className="section-page-message">Загружаем прогулки…</p>
      ) : null}
      {state.status === 'error' ? (
        <section className="section-page-message section-page-error" role="alert">
          <p>Не удалось загрузить прогулки.</p>
          <button className="secondary-button" type="button" onClick={() => void reload()}>
            Повторить
          </button>
        </section>
      ) : null}
      {state.status === 'ready' ? (
        <>
          <label className="walk-sphere-filter action-filter-field">
            <span>Сфера</span>
            <select
              value={sphereFilter}
              onChange={(event) => setSphereFilter(event.currentTarget.value)}
            >
              <option value={SPHERE_FILTER_ALL}>Все сферы</option>
              <option value={SPHERE_FILTER_NONE}>Без сферы</option>
              {[...spheres.active, ...spheres.archived].map((sphere) => (
                <option key={sphere.id.toString()} value={sphere.id.toString()}>
                  {sphere.name}
                  {sphere.status === 'archived' ? ' · Архивная' : ''}
                </option>
              ))}
            </select>
          </label>
          <WalkList
            walks={state.value.filter(
              (walk) =>
                walk.status === WALK_STATUS.planned && matchesSphereFilter(walk, sphereFilter),
            )}
            spheres={spheres}
            currentDate={props.currentDate}
            selectedDate={props.selectedDate}
            deletingId={deletingId}
            onDelete={remove}
            onStart={setStartTarget}
            onSphereChange={(walk, sphereId) => void updateSphere(walk, sphereId)}
          />
          <WalkResultList
            walks={state.value.filter(
              (walk) =>
                (walk.status === WALK_STATUS.completed || walk.status === WALK_STATUS.abandoned) &&
                matchesSphereFilter(walk, sphereFilter),
            )}
            spheres={spheres}
            onSphereChange={(walk, sphereId) => void updateSphere(walk, sphereId)}
            isSaving={isSaving}
            onPhotoChange={updatePhoto}
            onError={setError}
          />
        </>
      ) : null}
    </main>
  );
}

interface WalkStatisticsPanelProps {
  readonly state: WalkStatisticsState;
  readonly period: WalkStatisticsPeriod;
  readonly onPeriodChange: (period: WalkStatisticsPeriod) => void;
  readonly onRetry: () => void;
}

export function WalkStatisticsPanel(props: WalkStatisticsPanelProps) {
  const statistics = props.state.status === 'ready' ? props.state.value : null;

  return (
    <section className="walk-statistics" aria-labelledby="walk-statistics-title">
      <div className="walk-statistics-heading">
        <h2 id="walk-statistics-title">Сводка прогулок</h2>
        <div className="walk-statistics-period" aria-label="Период сводки">
          {WALK_STATISTICS_PERIOD_OPTIONS.map(({ period, label }) => (
            <button
              className="walk-statistics-period-button"
              type="button"
              key={period}
              aria-pressed={props.period === period}
              onClick={() => props.onPeriodChange(period)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {props.state.status === 'loading' ? (
        <p className="walk-statistics-message" role="status">
          Считаем сводку…
        </p>
      ) : null}
      {props.state.status === 'error' ? (
        <div className="walk-statistics-message" role="alert">
          <span>Не удалось загрузить сводку.</span>
          <button className="secondary-button" type="button" onClick={props.onRetry}>
            Повторить
          </button>
        </div>
      ) : null}
      {statistics === null ? null : (
        <>
          <dl className="walk-statistics-metrics">
            <div>
              <dt>Прогулок</dt>
              <dd>{statistics.completedCount}</dd>
            </div>
            <div>
              <dt>Всего времени</dt>
              <dd>{formatStatisticsDuration(statistics.totalDurationMilliseconds)}</dd>
            </div>
            <div>
              <dt>Средняя</dt>
              <dd>
                {statistics.averageDurationMilliseconds === null
                  ? '—'
                  : formatStatisticsDuration(statistics.averageDurationMilliseconds)}
              </dd>
            </div>
          </dl>
          {statistics.completedCount === 0 ? (
            <p className="walk-statistics-empty">Пока нет завершённых прогулок за этот период.</p>
          ) : (
            <div className="walk-statistics-types">
              <h3>По типам</h3>
              <ul>
                {WALK_TYPE_OPTIONS.map((type) => (
                  <li key={type}>
                    <span>{WALK_TYPE_PRESENTATION[type].statisticsLabel}</span>
                    <strong>{statistics.completedByType[type]}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="walk-statistics-abandoned">
            Прервано <strong>{statistics.abandonedCount}</strong>
          </p>
        </>
      )}
    </section>
  );
}

interface WalkTypeFormProps {
  readonly selectedType: WalkType;
  readonly isSaving: boolean;
  readonly spheres?: SpheresSnapshot;
  readonly sphereId?: string | null;
  readonly onSphereChange?: (sphereId: string | null) => void;
  readonly onSelectType: (type: WalkType) => void;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function WalkTypeForm(props: WalkTypeFormProps) {
  const spheres = props.spheres ?? { active: [], archived: [] };
  const sphereId = props.sphereId ?? null;
  const onSphereChange = props.onSphereChange ?? (() => undefined);
  return (
    <form className="walk-type-form" onSubmit={props.onSubmit}>
      <fieldset disabled={props.isSaving}>
        <legend>Тип прогулки</legend>
        <div className="walk-type-grid">
          {WALK_TYPE_OPTIONS.map((type) => {
            const presentation = WALK_TYPE_PRESENTATION[type];
            return (
              <label className="walk-type-option" key={type}>
                <input
                  type="radio"
                  name="walk-type"
                  value={type}
                  checked={props.selectedType === type}
                  onChange={() => props.onSelectType(type)}
                />
                <span>
                  <strong>{presentation.label}</strong>
                  <small>{presentation.description}</small>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="walk-sphere-field">
        <span>Сфера</span>
        <SphereSelect
          value={sphereId}
          snapshot={spheres}
          disabled={props.isSaving}
          onChange={onSphereChange}
        />
      </label>
      <div className="walk-form-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
        <button className="primary-button" type="submit" disabled={props.isSaving}>
          {props.isSaving ? 'Сохраняем…' : 'Запланировать'}
        </button>
      </div>
    </form>
  );
}

interface WalkStartFormProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onStart: (walk: Walk, mode: WalkMode, timerTargetMinutes?: number) => void;
}

export function WalkStartForm(props: WalkStartFormProps) {
  const [mode, setMode] = useState<WalkMode>(WALK_MODE.stopwatch);
  const [duration, setDuration] = useState('20');
  const numericDuration = Number(duration);
  const durationValid =
    Number.isInteger(numericDuration) && numericDuration >= 1 && numericDuration <= 1440;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (mode === WALK_MODE.timer && !durationValid) return;
    props.onStart(props.walk, mode, mode === WALK_MODE.timer ? numericDuration : undefined);
  }

  return (
    <form className="walk-start-form" onSubmit={submit}>
      <div>
        <p className="section-page-eyebrow">Запуск прогулки</p>
        <h2>{WALK_TYPE_PRESENTATION[props.walk.type].label}</h2>
      </div>
      <fieldset disabled={props.isSaving}>
        <legend>Режим</legend>
        <label>
          <input
            type="radio"
            name="walk-mode"
            checked={mode === WALK_MODE.stopwatch}
            onChange={() => setMode(WALK_MODE.stopwatch)}
          />{' '}
          Секундомер
        </label>
        <label>
          <input
            type="radio"
            name="walk-mode"
            checked={mode === WALK_MODE.timer}
            onChange={() => setMode(WALK_MODE.timer)}
          />{' '}
          Таймер
        </label>
      </fieldset>
      {mode === WALK_MODE.timer ? (
        <div className="walk-duration-field">
          <span>Продолжительность, минут</span>
          <div className="walk-duration-presets">
            {[10, 20, 30, 45, 60].map((minutes) => (
              <button
                className="secondary-button"
                type="button"
                key={minutes}
                onClick={() => setDuration(String(minutes))}
              >
                {minutes}
              </button>
            ))}
          </div>
          <input
            type="number"
            min="1"
            max="1440"
            step="1"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            aria-invalid={!durationValid}
          />
          {durationValid ? null : <small role="alert">Укажите целое число от 1 до 1440.</small>}
        </div>
      ) : null}
      <div className="walk-form-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
        <button
          className="primary-button"
          type="submit"
          disabled={props.isSaving || (mode === WALK_MODE.timer && !durationValid)}
        >
          {props.isSaving ? 'Запускаем…' : 'Начать прогулку'}
        </button>
      </div>
    </form>
  );
}

interface WalkRunningPanelProps {
  readonly walk: Walk;
  readonly now?: Date;
  readonly isSaving?: boolean;
  readonly onComplete?: () => void;
  readonly onAbandon?: () => void;
}

export function WalkRunningPanel({
  walk,
  now: fixedNow,
  isSaving = false,
  onComplete,
  onAbandon,
}: WalkRunningPanelProps) {
  const now = useLiveNow(fixedNow);
  const snapshot = getWalkTimeSnapshot(walk, now);
  const stopwatch = walk.mode === WALK_MODE.stopwatch;
  return (
    <section className="walk-running-panel" aria-label="Текущая прогулка">
      <p className="section-page-eyebrow">Идёт</p>
      <h2>{WALK_TYPE_PRESENTATION[walk.type].label}</h2>
      <p className="walk-running-mode">Режим: {stopwatch ? 'Секундомер' : 'Таймер'}</p>
      <p className="walk-running-time" aria-live="off">
        {stopwatch
          ? formatStopwatch(snapshot.seconds)
          : `осталось ${formatTimer(snapshot.seconds)}`}
      </p>
      {!snapshot.expired ? null : (
        <p className="walk-timer-expired" role="status">
          Время прогулки истекло
        </p>
      )}
      <blockquote>{walk.reflectionQuestion}</blockquote>
      <p>
        Начало:{' '}
        <time dateTime={walk.startedAt?.toISOString()}>{formatStartedAt(walk.startedAt)}</time>
      </p>
      {onComplete === undefined || onAbandon === undefined ? null : (
        <div className="walk-form-actions walk-running-actions">
          <button className="primary-button" type="button" disabled={isSaving} onClick={onComplete}>
            Завершить прогулку
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={isSaving}
            onClick={onAbandon}
          >
            Прервать прогулку
          </button>
        </div>
      )}
    </section>
  );
}

interface WalkCompletionFormProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onComplete: (walk: Walk, result: string, photo: WalkPhoto | null) => void;
}

export function WalkCompletionForm(props: WalkCompletionFormProps) {
  const [result, setResult] = useState('');
  const [photo, setPhoto] = useState<WalkPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function selectPhoto(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      setPhoto(await readWalkPhoto(file));
      setPhotoError(null);
    } catch (error: unknown) {
      setPhoto(null);
      setPhotoError(error instanceof Error ? error.message : 'Не удалось прочитать фото.');
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onComplete(props.walk, result, photo);
  }

  return (
    <form className="walk-completion-form" onSubmit={submit}>
      <label>
        <span>Что дала эта прогулка?</span>
        <textarea
          value={result}
          maxLength={MAX_WALK_RESULT_LENGTH}
          rows={4}
          disabled={props.isSaving}
          onChange={(event) => setResult(event.target.value)}
        />
      </label>
      <label className="walk-photo-field">
        <span>Фото (необязательно)</span>
        <input
          type="file"
          accept="image/*"
          disabled={props.isSaving}
          onChange={(event) => void selectPhoto(event.target.files?.[0])}
        />
      </label>
      {photo === null ? null : (
        <div className="walk-photo-preview">
          <img src={photo.dataUrl} alt="Выбранное фото прогулки" />
          <button className="secondary-button" type="button" onClick={() => setPhoto(null)}>
            Удалить фото
          </button>
        </div>
      )}
      {photoError === null ? null : <small role="alert">{photoError}</small>}
      <div className="walk-form-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
        <button className="primary-button" type="submit" disabled={props.isSaving}>
          {props.isSaving ? 'Завершаем…' : 'Завершить'}
        </button>
      </div>
    </form>
  );
}

interface WalkResultListProps {
  readonly walks: readonly Walk[];
  readonly isSaving: boolean;
  readonly onPhotoChange: (walk: Walk, photo: WalkPhoto | null) => void;
  readonly onError: (message: string) => void;
  readonly spheres?: SpheresSnapshot;
  readonly onSphereChange?: (walk: Walk, sphereId: string | null) => void;
}

export function WalkResultList(props: WalkResultListProps) {
  if (props.walks.length === 0) return null;
  const spheres = props.spheres ?? { active: [], archived: [] };
  const onSphereChange = props.onSphereChange ?? (() => undefined);
  return (
    <section className="walk-result-list" aria-label="Завершённые прогулки">
      {props.walks.map((walk) => (
        <WalkResultCard
          key={walk.id.toString()}
          walk={walk}
          isSaving={props.isSaving}
          onPhotoChange={props.onPhotoChange}
          onError={props.onError}
          spheres={spheres}
          onSphereChange={onSphereChange}
        />
      ))}
    </section>
  );
}

interface WalkResultCardProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly onPhotoChange: (walk: Walk, photo: WalkPhoto | null) => void;
  readonly onError: (message: string) => void;
  readonly spheres?: SpheresSnapshot;
  readonly onSphereChange?: (walk: Walk, sphereId: string | null) => void;
}

export function WalkResultCard(props: WalkResultCardProps) {
  const { walk } = props;
  const spheres = props.spheres ?? { active: [], archived: [] };
  const onSphereChange = props.onSphereChange ?? (() => undefined);
  const completed = walk.status === WALK_STATUS.completed;

  async function replacePhoto(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      props.onPhotoChange(walk, await readWalkPhoto(file));
    } catch (error: unknown) {
      props.onError(error instanceof Error ? error.message : 'Не удалось прочитать фото.');
    }
  }

  return (
    <article className="walk-result-card">
      <div className="walk-result-heading">
        <div>
          <p className="section-page-eyebrow">{completed ? 'Завершена' : 'Прервана'}</p>
          <h2>{WALK_TYPE_PRESENTATION[walk.type].label}</h2>
        </div>
        <span className={`walk-status-badge ${completed ? 'completed' : 'abandoned'}`}>
          {completed ? 'Завершена' : 'Прервана'}
        </span>
      </div>
      <dl className="walk-result-details">
        <div>
          <dt>Сфера</dt>
          <dd>
            <SphereBadge sphereId={walk.sphereId?.toString() ?? null} snapshot={spheres} />
          </dd>
        </div>
        <div>
          <dt>Дата</dt>
          <dd>{walk.date.toString()}</dd>
        </div>
        <div>
          <dt>Начало</dt>
          <dd>{formatDateTime(walk.startedAt)}</dd>
        </div>
        <div>
          <dt>Завершение</dt>
          <dd>{formatDateTime(walk.endedAt)}</dd>
        </div>
        <div>
          <dt>Фактическая длительность</dt>
          <dd>{formatActualDuration(walk.actualDurationMilliseconds)}</dd>
        </div>
        <div>
          <dt>Режим</dt>
          <dd>{walk.mode === WALK_MODE.timer ? 'Таймер' : 'Секундомер'}</dd>
        </div>
      </dl>
      <SphereSelect
        value={walk.sphereId?.toString() ?? null}
        snapshot={spheres}
        disabled={props.isSaving}
        onChange={(sphereId) => onSphereChange(walk, sphereId)}
      />
      <div className="walk-result-question">
        <strong>Вопрос</strong>
        <blockquote>{walk.reflectionQuestion}</blockquote>
      </div>
      {walk.result === null ? null : (
        <p className="walk-result-text">
          <strong>Итог:</strong> {walk.result}
        </p>
      )}
      {walk.photo === null ? null : (
        <img
          className="walk-result-photo"
          src={walk.photo.dataUrl}
          alt="Фото завершённой прогулки"
        />
      )}
      {!completed ? null : (
        <div className="walk-photo-actions">
          <label className="secondary-button">
            {walk.photo === null ? 'Добавить фото' : 'Заменить фото'}
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              disabled={props.isSaving}
              onChange={(event) => void replacePhoto(event.target.files?.[0])}
            />
          </label>
          {walk.photo === null ? null : (
            <button
              className="secondary-button"
              type="button"
              disabled={props.isSaving}
              onClick={() => props.onPhotoChange(walk, null)}
            >
              Удалить фото
            </button>
          )}
        </div>
      )}
    </article>
  );
}

interface WalkListProps {
  readonly walks: readonly Walk[];
  readonly currentDate?: DayDate;
  readonly selectedDate?: DayDate;
  readonly deletingId: string | null;
  readonly onDelete: (walk: Walk) => void;
  readonly onStart?: (walk: Walk) => void;
  readonly spheres?: SpheresSnapshot;
  readonly onSphereChange?: (walk: Walk, sphereId: string | null) => void;
}

export function WalkList({
  walks,
  currentDate,
  selectedDate,
  deletingId,
  onDelete,
  onStart,
  spheres = { active: [], archived: [] },
  onSphereChange = () => undefined,
}: WalkListProps) {
  if (walks.length === 0)
    return <p className="section-page-message">На эту дату прогулки пока не запланированы.</p>;
  const startAvailable = currentDate !== undefined && selectedDate?.equals(currentDate) === true;
  return (
    <section className="walk-list" aria-label="Прогулки выбранной даты">
      {walks.map((walk) => {
        const presentation = WALK_TYPE_PRESENTATION[walk.type];
        const deleting = deletingId === walk.id.toString();
        return (
          <article className="walk-card" key={walk.id.toString()}>
            <div>
              <p className="section-page-eyebrow">Запланирована</p>
              <h2>{presentation.label}</h2>
              <p>{presentation.description}</p>
              <SphereBadge sphereId={walk.sphereId?.toString() ?? null} snapshot={spheres} />
              <SphereSelect
                value={walk.sphereId?.toString() ?? null}
                snapshot={spheres}
                onChange={(sphereId) => onSphereChange(walk, sphereId)}
              />
              {startAvailable ? null : <p>Начать можно только в запланированную дату.</p>}
            </div>
            <div className="walk-card-actions">
              {onStart === undefined ? null : (
                <button
                  className="primary-button"
                  type="button"
                  disabled={!startAvailable}
                  onClick={() => onStart(walk)}
                >
                  Начать прогулку
                </button>
              )}
              <button
                className="secondary-button walk-delete-button"
                type="button"
                disabled={deleting}
                onClick={() => onDelete(walk)}
              >
                {deleting ? 'Удаляем…' : 'Удалить'}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function matchesSphereFilter(walk: Walk, filter: string): boolean {
  if (filter === SPHERE_FILTER_ALL) return true;
  if (filter === SPHERE_FILTER_NONE) return walk.sphereId === null;
  return walk.sphereId?.toString() === filter;
}

function useLiveNow(fixedNow: Date | undefined): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (fixedNow !== undefined) return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [fixedNow]);
  return fixedNow ?? now;
}

function formatStartedAt(startedAt: Date | null): string {
  return startedAt === null
    ? '—'
    : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        startedAt,
      );
}

function formatDateTime(value: Date | null): string {
  return value === null
    ? '—'
    : new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(value);
}

function formatActualDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    ...(hours > 0 ? [`${hours} ч`] : []),
    ...(minutes > 0 ? [`${minutes} мин`] : []),
    ...(hours === 0 && minutes === 0 ? [`${seconds} сек`] : []),
  ];
  return parts.join(' ');
}

async function readWalkPhoto(file: File): Promise<WalkPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Можно прикрепить только изображение.');
  }
  if (file.size < 1 || file.size > MAX_WALK_PHOTO_BYTES) {
    throw new Error(`Размер фото не должен превышать ${MAX_WALK_PHOTO_BYTES / 1024 / 1024} МБ.`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  return { dataUrl, mimeType: file.type, sizeBytes: file.size };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Не удалось прочитать фото.'));
    });
    reader.addEventListener('error', () => reject(new Error('Не удалось прочитать фото.')));
    reader.readAsDataURL(file);
  });
}
