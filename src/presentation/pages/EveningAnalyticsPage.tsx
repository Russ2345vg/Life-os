import { useEffect, useState } from 'react';
import {
  EVENING_RECOMMENDATION_PRIORITY,
  RECOMMENDATION_APPLICATION_STATUS,
  RECOMMENDATION_PREVIEW_KIND,
  type EveningHistoryResult,
  type EveningHistorySummary,
  type EveningPattern,
  type EveningRecommendationCard,
  type EveningRecommendationPreview,
  type EveningSignal,
  type GetEveningAnalytics,
  type RecommendationApplicationService,
} from '../../application';
import {
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  DayDate,
  type EveningCycleCompletion,
  type EveningCycleMode,
} from '../../domain';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { formatEveningDate } from './EveningFinalPresentation';
import {
  createEveningAnalyticsRange,
  createEveningTrendsPresentation,
  createRecommendationDialogState,
  recommendationInput,
  type EveningAnalyticsRangeDays,
  type EveningTrendsPresentation,
  type EveningTrendSegment,
  type RecommendationDialogState,
} from './EveningAnalyticsPresentation';

interface EveningAnalyticsPageProps {
  readonly currentDate: DayDate;
  readonly getEveningAnalytics: Pick<GetEveningAnalytics, 'execute'>;
  readonly recommendationApplications: Pick<
    RecommendationApplicationService,
    'getRecommendations' | 'preview' | 'apply' | 'dismiss'
  >;
  readonly onOpenEvening: (date: DayDate) => void;
}

export interface EveningAnalyticsModel {
  readonly history: EveningHistoryResult;
  readonly summary: EveningHistorySummary;
  readonly patterns: readonly EveningPattern[];
  readonly signals: readonly EveningSignal[];
  readonly recommendations: readonly EveningRecommendationCard[];
  readonly trends: EveningTrendsPresentation;
}

type LoadState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string }>
  | Readonly<{ status: 'ready'; model: EveningAnalyticsModel }>;

export function EveningAnalyticsPage({
  currentDate,
  getEveningAnalytics,
  recommendationApplications,
  onOpenEvening,
}: EveningAnalyticsPageProps) {
  const [rangeDays, setRangeDays] = useState<EveningAnalyticsRangeDays>(7);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [actionRecommendationId, setActionRecommendationId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<RecommendationDialogState | null>(null);

  useEffect(() => {
    let active = true;
    const range = createEveningAnalyticsRange(rangeDays, currentDate);

    void getEveningAnalytics
      .execute(range)
      .then((analytics) => {
        if (!active) return;
        setLoadState({
          status: 'ready',
          model: {
            history: analytics.history,
            summary: analytics.summary,
            patterns: analytics.patterns,
            signals: analytics.signals,
            recommendations: analytics.recommendationCards,
            trends: createEveningTrendsPresentation(analytics.history, analytics.summary),
          },
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadState({ status: 'error', message: errorMessage(error) });
      });

    return () => {
      active = false;
    };
  }, [currentDate, getEveningAnalytics, rangeDays, recommendationApplications, reloadToken]);

  async function previewRecommendation(card: EveningRecommendationCard): Promise<void> {
    setActionRecommendationId(card.recommendation.id);
    setActionError(null);
    try {
      const preview = await recommendationApplications.preview(card.recommendation, {
        cycleDate: currentDate,
      });
      setDialog(createRecommendationDialogState(preview));
    } catch (error: unknown) {
      setActionError(errorMessage(error));
    } finally {
      setActionRecommendationId(null);
    }
  }

  async function dismissRecommendation(card: EveningRecommendationCard): Promise<void> {
    setActionRecommendationId(card.recommendation.id);
    setActionError(null);
    try {
      await recommendationApplications.dismiss(card.recommendation.id);
      setReloadToken((value) => value + 1);
    } catch (error: unknown) {
      setActionError(errorMessage(error));
    } finally {
      setActionRecommendationId(null);
    }
  }

  async function confirmRecommendation(): Promise<void> {
    if (dialog === null) return;
    const input = recommendationInput(dialog);
    if (input === null) {
      setDialog({ ...dialog, error: recommendationInputError(dialog.preview) });
      return;
    }
    setDialog({ ...dialog, isSubmitting: true, error: null });
    try {
      await recommendationApplications.apply(
        dialog.preview.recommendation,
        { cycleDate: currentDate },
        input,
      );
      setDialog(null);
      setReloadToken((value) => value + 1);
    } catch (error: unknown) {
      setDialog({ ...dialog, isSubmitting: false, error: errorMessage(error) });
    }
  }

  return (
    <main className="evening-analytics-page">
      <header className="evening-analytics-header">
        <SectionPageHeader
          eyebrow="Evening Command Center"
          title="Вечерняя аналитика"
          description="Спокойный обзор завершённых вечеров: что повторяется, где нужен фокус и что стоит учесть завтра."
        />
        <RangeSwitch
          value={rangeDays}
          onChange={(days) => {
            if (days === rangeDays) return;
            setLoadState({ status: 'loading' });
            setActionError(null);
            setRangeDays(days);
          }}
        />
      </header>

      {loadState.status === 'loading' ? (
        <p className="evening-analytics-message" role="status">
          Собираем вечерние итоги…
        </p>
      ) : null}
      {loadState.status === 'error' ? (
        <div className="evening-analytics-message is-error" role="alert">
          <p>Не удалось загрузить вечернюю аналитику. {loadState.message}</p>
          <button
            type="button"
            onClick={() => {
              setLoadState({ status: 'loading' });
              setActionError(null);
              setReloadToken((value) => value + 1);
            }}
          >
            Повторить
          </button>
        </div>
      ) : null}
      {loadState.status === 'ready' ? (
        <EveningAnalyticsView
          model={loadState.model}
          rangeDays={rangeDays}
          actionRecommendationId={actionRecommendationId}
          actionError={actionError}
          onPreviewRecommendation={(card) => void previewRecommendation(card)}
          onDismissRecommendation={(card) => void dismissRecommendation(card)}
          onOpenEvening={onOpenEvening}
        />
      ) : null}

      {dialog === null ? null : (
        <RecommendationConfirmationDialog
          state={dialog}
          onChange={setDialog}
          onClose={() => setDialog(null)}
          onConfirm={() => void confirmRecommendation()}
        />
      )}
    </main>
  );
}

export function EveningAnalyticsView({
  model,
  rangeDays,
  actionRecommendationId,
  actionError,
  onPreviewRecommendation,
  onDismissRecommendation,
  onOpenEvening,
}: {
  readonly model: EveningAnalyticsModel;
  readonly rangeDays: EveningAnalyticsRangeDays;
  readonly actionRecommendationId: string | null;
  readonly actionError: string | null;
  readonly onPreviewRecommendation: (card: EveningRecommendationCard) => void;
  readonly onDismissRecommendation: (card: EveningRecommendationCard) => void;
  readonly onOpenEvening: (date: DayDate) => void;
}) {
  const completedEvenings = model.history.items.filter((item) => item.completion !== null);
  return (
    <div className="evening-analytics-content">
      <KpiRow summary={model.summary} />

      <TrendsSection trends={model.trends} />

      <div className="evening-analytics-primary-grid">
        <AnalyticsSection eyebrow="Повторяющиеся наблюдения" title="Закономерности">
          {model.patterns.length === 0 ? (
            <EmptyAnalyticsState>
              За {rangeDays} дней устойчивых закономерностей пока не обнаружено.
            </EmptyAnalyticsState>
          ) : (
            <div className="evening-pattern-list">
              {model.patterns.map((pattern) => (
                <article className="evening-pattern-card" key={pattern.id}>
                  <div>
                    <span className="evening-level is-neutral">{pattern.severityLabel}</span>
                    <span>{pattern.occurrences} наблюдения</span>
                  </div>
                  <h3>{pattern.title}</h3>
                  <p>Подтверждено данными завершённых вечерних циклов.</p>
                </article>
              ))}
            </div>
          )}
        </AnalyticsSection>

        <AnalyticsSection eyebrow="Требует внимания" title="Приоритетные сигналы" accent="gold">
          {model.signals.length === 0 ? (
            <EmptyAnalyticsState>Сейчас нет сигналов, требующих внимания.</EmptyAnalyticsState>
          ) : (
            <ol className="evening-signal-list">
              {model.signals.slice(0, 3).map((signal, index) => (
                <li key={signal.id}>
                  <span className="evening-signal-order">0{index + 1}</span>
                  <div>
                    <h3>{signal.title}</h3>
                    <p>{signal.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </AnalyticsSection>
      </div>

      <AnalyticsSection eyebrow="Только после подтверждения" title="Рекомендации">
        {actionError === null ? null : (
          <p className="evening-recommendation-error" role="alert">
            {actionError}
          </p>
        )}
        {model.recommendations.length === 0 ? (
          <EmptyAnalyticsState>На выбранном диапазоне новых рекомендаций нет.</EmptyAnalyticsState>
        ) : (
          <div className="evening-recommendation-grid">
            {model.recommendations.map((card) => {
              const isPending = card.status === RECOMMENDATION_APPLICATION_STATUS.pending;
              const isBusy = actionRecommendationId === card.recommendation.id;
              return (
                <article className="evening-recommendation-card" key={card.recommendation.id}>
                  <div className="evening-recommendation-heading">
                    <span className={`evening-priority is-${priorityTone(card)}`}>
                      {priorityLabel(card)}
                    </span>
                    {isPending ? null : <span className="is-applied">Учтено</span>}
                  </div>
                  <h3>{card.recommendation.title}</h3>
                  <p>{card.recommendation.rationale}</p>
                  <div className="evening-recommendation-action-copy">
                    <span>Предлагаемое действие</span>
                    <p>{card.recommendation.proposedAction.description}</p>
                  </div>
                  {card.resultMessage === null ? null : (
                    <p className="evening-recommendation-result">{card.resultMessage}</p>
                  )}
                  {isPending ? (
                    <div className="evening-recommendation-actions">
                      <button
                        className="evening-analytics-primary-button"
                        type="button"
                        disabled={isBusy}
                        onClick={() => onPreviewRecommendation(card)}
                      >
                        {isBusy ? 'Открываем…' : 'Учесть'}
                      </button>
                      <button
                        className="evening-analytics-text-button"
                        type="button"
                        disabled={isBusy}
                        onClick={() => onDismissRecommendation(card)}
                      >
                        Не сейчас
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </AnalyticsSection>

      <AnalyticsSection eyebrow="Завершённые циклы" title="История вечеров">
        {completedEvenings.length === 0 ? (
          <EmptyAnalyticsState>
            В выбранном диапазоне пока нет завершённых вечеров.
          </EmptyAnalyticsState>
        ) : (
          <ol className="evening-cycle-history-list">
            {completedEvenings.map((item) => (
              <li key={item.cycleId}>
                <button type="button" onClick={() => onOpenEvening(DayDate.create(item.dateKey))}>
                  <span className="evening-cycle-history-date">
                    <strong>{formatEveningDate(item.dateKey)}</strong>
                    <small>{modeLabel(item.mode)}</small>
                  </span>
                  <span className="evening-cycle-history-facts">
                    <span>{completionLabel(item.completion)}</span>
                    <span>{formatDuration(item.durationMs)}</span>
                    <span>
                      {item.reflectionAnswerCount === 0
                        ? 'Без осмысления'
                        : `Ответов: ${item.reflectionAnswerCount}`}
                    </span>
                    <span>
                      {item.hasTomorrowPlan ? 'Завтра спланировано' : 'Без плана на завтра'}
                    </span>
                  </span>
                  <span className="evening-cycle-history-open" aria-hidden="true">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </AnalyticsSection>
    </div>
  );
}

function RangeSwitch({
  value,
  onChange,
}: {
  readonly value: EveningAnalyticsRangeDays;
  readonly onChange: (value: EveningAnalyticsRangeDays) => void;
}) {
  return (
    <div className="evening-range-switch" role="group" aria-label="Период аналитики">
      {([7, 30] as const).map((days) => (
        <button
          className={days === value ? 'is-active' : ''}
          type="button"
          aria-pressed={days === value}
          key={days}
          onClick={() => onChange(days)}
        >
          {days} дней
        </button>
      ))}
    </div>
  );
}

function KpiRow({ summary }: { readonly summary: EveningHistorySummary }) {
  const kpis = [
    { label: 'Вечерних циклов', value: summary.cycleCount.toString() },
    { label: 'Завершено', value: summary.completedCount.toString() },
    { label: 'Среднее время', value: formatDuration(summary.averageDurationMs) },
    { label: 'Осмыслений', value: summary.reflectionAnswerCount.toString() },
    { label: 'Планов на завтра', value: summary.tomorrowPlanCount.toString() },
  ];
  return (
    <section className="evening-analytics-kpis" aria-label="Ключевые показатели">
      {kpis.map((kpi) => (
        <article key={kpi.label}>
          <span>{kpi.label}</span>
          <strong>{kpi.value}</strong>
        </article>
      ))}
    </section>
  );
}

function TrendsSection({ trends }: { readonly trends: EveningTrendsPresentation }) {
  return (
    <AnalyticsSection eyebrow={trends.periodLabel} title="Тенденции">
      <div className="evening-trends-grid">
        <TrendBarCard
          title="Завершение циклов"
          value={`${trends.completion.completedCount} из ${trends.completion.cycleCount}`}
          description="полностью завершены"
          tone="positive"
          trends={trends}
        />
        <TrendBarCard
          title="Переносы"
          value={trends.carryForwardCount.toString()}
          description={pluralizeCarryForward(trends.carryForwardCount)}
          tone="accent"
          trends={trends}
        />
      </div>

      <div className="evening-trend-summary-grid">
        <TrendSegmentCard
          title="Полнота PreparationPlan"
          value={`${trends.preparation.completedCount} из ${trends.preparation.planCount}`}
          description="планов завершены"
          segments={trends.preparation.segments}
        />
        <TrendSegmentCard
          title="Режимы завершения"
          value={trends.modes.cycleCount.toString()}
          description={pluralizeCycle(trends.modes.cycleCount)}
          segments={trends.modes.segments}
        />
        {trends.firstAction === null ? null : (
          <TrendSegmentCard
            title="Первый шаг завтра"
            value={`${trends.firstAction.count} из ${trends.firstAction.planCount}`}
            description="планов содержат первый шаг"
            segments={trends.firstAction.segments}
          />
        )}
      </div>
    </AnalyticsSection>
  );
}

function TrendBarCard({
  title,
  value,
  description,
  tone,
  trends,
}: {
  readonly title: string;
  readonly value: string;
  readonly description: string;
  readonly tone: 'positive' | 'accent';
  readonly trends: EveningTrendsPresentation;
}) {
  return (
    <article className={`evening-trend-card is-series is-${tone}`}>
      <header>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong>{value}</strong>
      </header>
      <div className="evening-trend-bars" aria-label={`${title}: ${value} ${description}`}>
        {trends.buckets.map((bucket) => {
          const amount = tone === 'positive' ? bucket.completedCount : bucket.carryForwardCount;
          const denominator = tone === 'positive' ? bucket.cycleCount : null;
          const percent =
            tone === 'positive' ? bucket.completionPercent : bucket.carryForwardPercent;
          return (
            <div className="evening-trend-bar-item" key={`${tone}-${bucket.key}`}>
              <span className="evening-trend-bar-value">
                {denominator === null
                  ? amount
                  : denominator === 0
                    ? '—'
                    : `${amount}/${denominator}`}
              </span>
              <span className="evening-trend-bar-track" aria-hidden="true">
                <span style={{ height: `${percent}%` }} />
              </span>
              <span className="evening-trend-bar-label">{bucket.label}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function TrendSegmentCard({
  title,
  value,
  description,
  segments,
}: {
  readonly title: string;
  readonly value: string;
  readonly description: string;
  readonly segments: readonly EveningTrendSegment[];
}) {
  return (
    <article className="evening-trend-card is-summary">
      <header>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong>{value}</strong>
      </header>
      <div className="evening-trend-segments" aria-hidden="true">
        {segments.map((segment) => (
          <span
            className={`is-${segment.tone}`}
            style={{ width: `${segment.percent}%` }}
            key={segment.key}
          />
        ))}
      </div>
      <ul className="evening-trend-legend" aria-label={`${title}: ${value} ${description}`}>
        {segments.map((segment) => (
          <li className={`is-${segment.tone}`} key={segment.key}>
            <span aria-hidden="true" />
            {segment.label}: <strong>{segment.count}</strong>
          </li>
        ))}
      </ul>
    </article>
  );
}

function AnalyticsSection({
  eyebrow,
  title,
  accent,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly accent?: 'gold';
  readonly children: React.ReactNode;
}) {
  const id = `evening-analytics-${title.toLocaleLowerCase('ru-RU').replaceAll(' ', '-')}`;
  return (
    <section
      className={`evening-analytics-section${accent === 'gold' ? ' is-gold-accent' : ''}`}
      aria-labelledby={id}
    >
      <header>
        <p>{eyebrow}</p>
        <h2 id={id}>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function EmptyAnalyticsState({ children }: { readonly children: React.ReactNode }) {
  return <p className="evening-analytics-empty">{children}</p>;
}

function RecommendationConfirmationDialog({
  state,
  onChange,
  onClose,
  onConfirm,
}: {
  readonly state: RecommendationDialogState;
  readonly onChange: (state: RecommendationDialogState) => void;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  const preview = state.preview;
  return (
    <div
      className="evening-recommendation-dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="evening-recommendation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evening-recommendation-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p>Подтверждение обязательно</p>
            <h2 id="evening-recommendation-dialog-title">{preview.recommendation.title}</h2>
          </div>
          <button type="button" aria-label="Закрыть подтверждение" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="evening-recommendation-dialog-rationale">
          {preview.recommendation.rationale}
        </p>
        <RecommendationPreviewFields state={state} onChange={onChange} />
        {state.error === null ? null : (
          <p className="evening-recommendation-error" role="alert">
            {state.error}
          </p>
        )}
        <footer>
          <button
            className="evening-analytics-primary-button"
            type="button"
            disabled={state.isSubmitting || preview.kind === RECOMMENDATION_PREVIEW_KIND.resolved}
            onClick={onConfirm}
          >
            {state.isSubmitting ? 'Сохраняем…' : 'Подтвердить'}
          </button>
          <button
            className="evening-analytics-text-button"
            type="button"
            disabled={state.isSubmitting}
            onClick={onClose}
          >
            Вернуться без изменений
          </button>
        </footer>
      </section>
    </div>
  );
}

function RecommendationPreviewFields({
  state,
  onChange,
}: {
  readonly state: RecommendationDialogState;
  readonly onChange: (state: RecommendationDialogState) => void;
}) {
  const preview = state.preview;
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.targetOutcome) {
    return (
      <div className="evening-recommendation-preview-fields">
        <p>
          <span>Сейчас</span>
          <strong>{preview.currentValue ?? 'Не задано'}</strong>
        </p>
        <label>
          <span>Норма на завтра</span>
          <input
            value={state.targetOutcome}
            onChange={(event) => onChange({ ...state, targetOutcome: event.target.value })}
          />
        </label>
      </div>
    );
  }
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.firstAction) {
    return (
      <div className="evening-recommendation-preview-fields">
        <p>
          <span>Сейчас</span>
          <strong>{preview.currentValue ?? 'Первый шаг не определён'}</strong>
        </p>
        {preview.candidateActions.length > 0 ? (
          <label>
            <span>Первый шаг на завтра</span>
            <select
              value={state.selectedActionId}
              onChange={(event) => onChange({ ...state, selectedActionId: event.target.value })}
            >
              {preview.candidateActions.map((action) => (
                <option value={action.id} key={action.id}>
                  {action.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              <span>Новый первый шаг</span>
              <input
                value={state.firstActionTitle}
                onChange={(event) => onChange({ ...state, firstActionTitle: event.target.value })}
              />
            </label>
            <label>
              <span>Ожидаемый результат</span>
              <input
                value={state.firstActionResult}
                onChange={(event) => onChange({ ...state, firstActionResult: event.target.value })}
              />
            </label>
          </>
        )}
      </div>
    );
  }
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.supportingDecisions) {
    return (
      <fieldset className="evening-recommendation-preview-fields">
        <legend>Оставить в дополнительном фокусе</legend>
        {preview.decisions.map((decision) => (
          <label className="evening-recommendation-choice" key={decision.id}>
            <input
              type="checkbox"
              checked={state.keptDecisionIds.includes(decision.id)}
              onChange={() =>
                onChange({
                  ...state,
                  keptDecisionIds: state.keptDecisionIds.includes(decision.id)
                    ? state.keptDecisionIds.filter((id) => id !== decision.id)
                    : [...state.keptDecisionIds, decision.id],
                })
              }
            />
            <span>{decision.title}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <div className="evening-recommendation-confirmation-copy">
      <span aria-hidden="true">✓</span>
      <p>
        Изменение не будет применено автоматически. Проверьте предложение и подтвердите его явно.
      </p>
    </div>
  );
}

function recommendationInputError(preview: EveningRecommendationPreview): string {
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.targetOutcome)
    return 'Укажите Норму главного Решения на завтра.';
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.firstAction)
    return 'Выберите или сформулируйте первый шаг и его ожидаемый результат.';
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.supportingDecisions)
    return 'Чтобы сократить фокус, снимите хотя бы одно Решение.';
  return 'Эта рекомендация уже была обработана.';
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '—';
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} ч` : `${hours} ч ${remainingMinutes} мин`;
}

function modeLabel(mode: EveningCycleMode): string {
  if (mode === EVENING_CYCLE_MODE.quick) return 'Быстрый режим';
  if (mode === EVENING_CYCLE_MODE.emergency) return 'Позднее завершение';
  return 'Обычный режим';
}

function completionLabel(completion: EveningCycleCompletion | null): string {
  if (completion === EVENING_CYCLE_COMPLETION.skipped) return 'Завершено сокращённо';
  return 'Вечер завершён';
}

function priorityLabel(card: EveningRecommendationCard): string {
  if (card.recommendation.priority === EVENING_RECOMMENDATION_PRIORITY.high)
    return 'Высокий приоритет';
  if (card.recommendation.priority === EVENING_RECOMMENDATION_PRIORITY.medium)
    return 'Средний приоритет';
  if (card.recommendation.priority === EVENING_RECOMMENDATION_PRIORITY.low)
    return 'Низкий приоритет';
  return 'Наблюдение';
}

function priorityTone(card: EveningRecommendationCard): 'important' | 'attention' | 'info' {
  if (card.recommendation.priority === EVENING_RECOMMENDATION_PRIORITY.high) return 'attention';
  if (card.recommendation.priority === EVENING_RECOMMENDATION_PRIORITY.medium) return 'attention';
  return 'info';
}

function pluralizeCarryForward(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'переносов за период';
  if (lastDigit === 1) return 'перенос за период';
  if (lastDigit >= 2 && lastDigit <= 4) return 'переноса за период';
  return 'переносов за период';
}

function pluralizeCycle(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'циклов по режимам';
  if (lastDigit === 1) return 'цикл по режимам';
  if (lastDigit >= 2 && lastDigit <= 4) return 'цикла по режимам';
  return 'циклов по режимам';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Попробуйте ещё раз.';
}
