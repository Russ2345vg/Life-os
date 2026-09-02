import { useCallback, useEffect, useState } from 'react';
import type {
  GetMorningCompletionOverview,
  GetMorningHistory,
  MorningCompletionOverview,
  MorningCycleApplicationService,
  MorningHistoryOverview,
  MorningHistoryPeriodSummary,
  MorningPhysicalResultSummary,
} from '../../application';
import { MORNING_COMPLETION_STATUS } from '../../application';
import type { DayDate } from '../../domain';

type CompletionView = 'summary' | 'history';
type HistoryPeriod = 7 | 30;

interface MorningCompletionPageProps {
  readonly date: DayDate;
  readonly getOverview: Pick<GetMorningCompletionOverview, 'execute'>;
  readonly getHistory: Pick<GetMorningHistory, 'execute'>;
  readonly cycle: Pick<MorningCycleApplicationService, 'finish'>;
  readonly onBack?: (() => void) | undefined;
  readonly onWorkBlockStarted: () => void;
}

type CompletionLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'ready';
      readonly overview: MorningCompletionOverview;
      readonly history: MorningHistoryOverview;
    };

export function MorningCompletionPage(props: MorningCompletionPageProps) {
  const [loadState, setLoadState] = useState<CompletionLoadState>({ status: 'loading' });
  const [view, setView] = useState<CompletionView>('summary');
  const [period, setPeriod] = useState<HistoryPeriod>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [overview, history] = await Promise.all([
        props.getOverview.execute(props.date),
        props.getHistory.execute(props.date),
      ]);
      if (overview === null) {
        setLoadState({
          status: 'error',
          message: 'Итог утра пока не готов. Вернитесь в центр и завершите обязательные этапы.',
        });
        return;
      }
      setLoadState({ status: 'ready', overview, history });
    } catch (reason: unknown) {
      setLoadState({ status: 'error', message: errorMessage(reason) });
    }
  }, [props.date, props.getHistory, props.getOverview]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function startWorkBlock(): Promise<void> {
    if (busy || loadState.status !== 'ready' || !loadState.overview.canStartWorkBlock) return;
    setBusy(true);
    setError(null);
    try {
      await props.cycle.finish(props.date);
      await reload();
      props.onWorkBlockStarted();
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (loadState.status === 'loading') {
    return (
      <section className="morning-completion-state" aria-live="polite" aria-busy="true">
        <span className="morning-completion-state-mark" aria-hidden="true" />
        <p>Собираем фактический итог утра…</p>
      </section>
    );
  }
  if (loadState.status === 'error') {
    return (
      <section className="morning-completion-state morning-completion-error" role="alert">
        <h2>Не удалось открыть итог утра</h2>
        <p>{loadState.message}</p>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          Повторить
        </button>
      </section>
    );
  }

  return (
    <MorningCompletionView
      overview={loadState.overview}
      history={loadState.history}
      view={view}
      period={period}
      busy={busy}
      error={error}
      onBack={props.onBack}
      onStartWorkBlock={() => void startWorkBlock()}
      onViewChange={setView}
      onPeriodChange={setPeriod}
      onRetry={() => void startWorkBlock()}
    />
  );
}

export function MorningCompletionView(props: {
  readonly overview: MorningCompletionOverview;
  readonly history: MorningHistoryOverview;
  readonly view: CompletionView;
  readonly period: HistoryPeriod;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onBack?: (() => void) | undefined;
  readonly onStartWorkBlock: () => void;
  readonly onViewChange: (view: CompletionView) => void;
  readonly onPeriodChange: (period: HistoryPeriod) => void;
  readonly onRetry: () => void;
}) {
  const finished = props.overview.status === MORNING_COMPLETION_STATUS.workBlockStarted;
  const partial = props.overview.status === MORNING_COMPLETION_STATUS.partialAllowed;
  return (
    <section className="morning-completion" aria-busy={props.busy}>
      <nav className="morning-completion-navigation" aria-label="Итог утра">
        {props.onBack === undefined ? (
          <span />
        ) : (
          <button className="morning-back-button" type="button" onClick={props.onBack}>
            ← Утренний центр
          </button>
        )}
        <div className="morning-completion-tabs" role="tablist" aria-label="Итог и история">
          <button
            type="button"
            role="tab"
            aria-selected={props.view === 'summary'}
            onClick={() => props.onViewChange('summary')}
          >
            Итог
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.view === 'history'}
            onClick={() => props.onViewChange('history')}
          >
            История
          </button>
        </div>
      </nav>

      {props.error === null ? null : (
        <div className="morning-completion-inline-error" role="alert">
          <span>{props.error}</span>
          <button type="button" onClick={props.onRetry}>
            Повторить
          </button>
        </div>
      )}

      {props.view === 'history' ? (
        <MorningHistoryView
          history={props.history}
          period={props.period}
          onPeriodChange={props.onPeriodChange}
        />
      ) : (
        <>
          <header className="morning-completion-hero">
            <div className="morning-completion-heading">
              <span className="morning-completion-check" aria-hidden="true">
                ✓
              </span>
              <div>
                <p className="morning-center-eyebrow">Распорядок · Итог утра</p>
                <h1>Утро завершено</h1>
                <p>Ты подготовил день. Можно переходить к работе.</p>
              </div>
            </div>
            {finished ? (
              <div className="morning-completion-finished" role="status">
                <strong>Переход к работе зафиксирован</strong>
                <span>Результаты утра сохранены.</span>
              </div>
            ) : (
              <div className="morning-completion-action-zone">
                {partial ? <span>Пропуски учтены</span> : <span>Всё готово к работе</span>}
                <button
                  className="primary-button morning-completion-cta"
                  type="button"
                  disabled={props.busy || !props.overview.canStartWorkBlock}
                  onClick={props.onStartWorkBlock}
                >
                  {props.busy ? 'Закрываем утро…' : 'Начать рабочий блок →'}
                </button>
              </div>
            )}
          </header>

          <div className="morning-completion-layout">
            <section className="morning-completion-results" aria-label="Итоги утра">
              <CompletionResult label="Быстрый старт">
                <span>✓ Вода выпита</span>
                <span>
                  {props.overview.quickStart.coldShower === 'completed'
                    ? '✓ Холодный душ выполнен'
                    : props.overview.quickStart.coldShower === 'skipped'
                      ? 'Холодный душ осознанно пропущен'
                      : 'Холодный душ не закрыт'}
                </span>
              </CompletionResult>
              <CompletionResult label="Физическая активность">
                <strong>
                  {props.overview.physical.skipped
                    ? 'Физическая активность осознанно пропущена'
                    : formatMorningPhysicalSummary(props.overview.physical)}
                </strong>
              </CompletionResult>
            </section>

            <section className="morning-completion-main-action" aria-label="Главное действие">
              <span className="morning-completion-label">Главное действие</span>
              {props.overview.mainAction.status === 'skipped' ? (
                <strong>Сегодня без главного действия</strong>
              ) : (
                <>
                  <h2>{props.overview.mainAction.title ?? 'Главное действие не определено'}</h2>
                  <div className="morning-completion-main-meta">
                    <span>{props.overview.mainAction.scheduledTime ?? 'Время не задано'}</span>
                    <span>
                      {props.overview.mainAction.status === 'ready' ? '✓ Готово' : 'Не готово'}
                    </span>
                  </div>
                  {props.overview.mainAction.expectedResult === null ? null : (
                    <p>
                      <span>Результат</span>
                      {props.overview.mainAction.expectedResult}
                    </p>
                  )}
                  {props.overview.mainAction.firstStepTitle === null ? null : (
                    <p>
                      <span>Первый шаг</span>
                      {props.overview.mainAction.firstStepTitle}
                    </p>
                  )}
                </>
              )}
            </section>
          </div>

          <dl className="morning-completion-time" aria-label="Время утра">
            <TimeFact label="Начало" value={formatTime(props.overview.startedAt)} />
            <TimeFact label="Завершение" value={formatTime(props.overview.completedAt)} />
            <TimeFact label="Длительность" value={formatDuration(props.overview.durationMs)} />
          </dl>
        </>
      )}
    </section>
  );
}

function MorningHistoryView(props: {
  readonly history: MorningHistoryOverview;
  readonly period: HistoryPeriod;
  readonly onPeriodChange: (period: HistoryPeriod) => void;
}) {
  const summary =
    props.period === 7 ? props.history.periods.sevenDays : props.history.periods.thirtyDays;
  return (
    <div className="morning-history">
      <header className="morning-history-header">
        <div>
          <p className="morning-center-eyebrow">История утра</p>
          <h1>Последние утра</h1>
          <p>Только сохранённые результаты и объяснимые показатели.</p>
        </div>
        <div className="morning-history-period" aria-label="Период истории">
          {[7, 30].map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={props.period === period}
              onClick={() => props.onPeriodChange(period as HistoryPeriod)}
            >
              {period} дней
            </button>
          ))}
        </div>
      </header>
      {props.history.items.length === 0 ? (
        <p className="morning-history-empty">История появится после первого завершённого утра.</p>
      ) : (
        <>
          <MorningPeriodSummary summary={summary} />
          <ol className="morning-history-list">
            {props.history.items.map((item) => (
              <li key={item.date.toString()}>
                <div className="morning-history-date">
                  <strong>{formatDate(item.date)}</strong>
                  <span>
                    {formatTime(item.startedAt)}–{formatTime(item.finishedAt)} ·{' '}
                    {formatDuration(item.durationMs)}
                  </span>
                </div>
                <div className="morning-history-facts">
                  <span>{item.waterCompleted ? '✓ Вода' : 'Вода не закрыта'}</span>
                  <span>
                    {item.coldShower === 'completed'
                      ? '✓ Душ'
                      : item.coldShower === 'skipped'
                        ? 'Душ пропущен'
                        : 'Душ не закрыт'}
                  </span>
                  <span>
                    {item.physical.skipped
                      ? 'Физическая активность пропущена'
                      : formatMorningPhysicalSummary(item.physical)}
                  </span>
                </div>
                <p className="morning-history-action">
                  {item.mainActionSkipped
                    ? 'Сегодня без главного действия'
                    : (item.mainActionTitle ?? 'Главное действие не определено')}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function MorningPeriodSummary(props: { readonly summary: MorningHistoryPeriodSummary }) {
  const total = props.summary.completedMornings;
  if (total === 0) {
    return <p className="morning-history-empty">За выбранный период нет завершённых утр.</p>;
  }
  return (
    <dl className="morning-history-metrics">
      <TimeFact
        label="Средняя длительность обычного утра"
        value={formatOptionalDuration(props.summary.averageNormalMorningDurationMs)}
      />
      <TimeFact label="Вода" value={`${props.summary.waterCompletedMornings} из ${total}`} />
      <TimeFact
        label="Холодный душ"
        value={`${props.summary.coldShowerCompletedMornings} из ${total}`}
      />
      <TimeFact
        label="Физическая активность"
        value={`${props.summary.physicallyActiveMornings} из ${total}`}
      />
      <TimeFact
        label="Средняя физическая сессия"
        value={formatOptionalDuration(props.summary.averagePhysicalSessionDurationMs)}
      />
    </dl>
  );
}

function CompletionResult(props: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="morning-completion-result">
      <span className="morning-completion-label">{props.label}</span>
      <div>{props.children}</div>
    </div>
  );
}

function TimeFact(props: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

export function formatMorningPhysicalSummary(summary: MorningPhysicalResultSummary): string {
  if (summary.skipped) return 'Физическая активность осознанно пропущена';
  const parts = [
    `${summary.exerciseCount} ${wordForm(summary.exerciseCount, 'упражнение', 'упражнения', 'упражнений')}`,
    `${summary.completedSets} ${wordForm(summary.completedSets, 'подход', 'подхода', 'подходов')}`,
  ];
  if (summary.totalRepetitions > 0) parts.push(`${summary.totalRepetitions} повторений`);
  if (summary.totalDurationSeconds > 0) parts.push(`${summary.totalDurationSeconds} сек`);
  if (summary.sessionDurationMs !== null) parts.push(formatDuration(summary.sessionDurationMs));
  return parts.join(' · ');
}

function wordForm(value: number, one: string, few: string, many: string): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatTime(value: Date): string {
  return value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(durationMs: number): string {
  if (durationMs > 0 && durationMs < 60_000) return '< 1 мин';
  return `${Math.max(0, Math.round(durationMs / 60_000))} мин`;
}

function formatOptionalDuration(durationMs: number | null): string {
  return durationMs === null ? 'Недостаточно данных' : formatDuration(durationMs);
}

function formatDate(date: DayDate): string {
  return new Date(`${date.toString()}T00:00:00.000Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить итог утра. Повторите.';
}
