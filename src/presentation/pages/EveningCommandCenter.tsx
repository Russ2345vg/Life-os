import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { EveningReviewSnapshot } from '../../application';
import { EVENING_CYCLE_MODE, EVENING_CYCLE_STATE, type EveningCycleMode } from '../../domain';
import {
  EVENING_STEPS,
  eveningJourneyIdForState,
  eveningModeLabel,
  eveningReturnToCurrentLabel,
  eveningStepIdForView,
  type EveningKpiItem,
  type EveningStepId,
  type SelectedEveningView,
} from './EveningCommandCenterPresentation';
import { EveningVisualIcon } from '../components/EveningVisualIcon';
import '../styles/evening-center-v2.css';

interface EveningCommandCenterProps {
  readonly cycle: EveningReviewSnapshot['cycle'];
  readonly isRecoveryReview: boolean;
  readonly modeChangeDisabled: boolean;
  readonly kpis?: readonly EveningKpiItem[];
  readonly onModeChange: (mode: EveningCycleMode) => void;
  readonly selectedView?: SelectedEveningView;
  readonly onSelectView?: (view: SelectedEveningView) => void;
  readonly onClose: () => void;
  readonly isTransitioning?: boolean;
  readonly children: ReactNode;
}

export function EveningCommandCenter({
  cycle,
  isRecoveryReview,
  modeChangeDisabled,
  kpis = EMPTY_KPIS,
  onModeChange,
  selectedView,
  onSelectView,
  onClose,
  isTransitioning = false,
  children,
}: EveningCommandCenterProps) {
  const isCompleted = cycle.state === EVENING_CYCLE_STATE.completed;
  const isNotStarted = cycle.state === EVENING_CYCLE_STATE.notStarted;
  const domainView = eveningJourneyIdForState(cycle.state);
  const visibleView = selectedView ?? domainView;
  const isHistoryView = visibleView !== domainView;
  const activeStepId = eveningStepIdForView(domainView);
  const activeIndex = EVENING_STEPS.findIndex((item) => item.id === activeStepId);
  const activeJourneyItem = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    activeJourneyItem.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [visibleView]);

  return (
    <div className="evening-command-center-page">
      <section
        className={`evening-command-center${isCompleted ? ' is-recovery' : ''}${isHistoryView ? ' is-history-view' : ''}${isTransitioning ? ' is-completing' : ''}`}
        aria-labelledby="evening-command-center-title"
        data-journey={visibleView}
        data-domain-journey={domainView}
        data-view-mode={isHistoryView ? 'history' : 'current'}
      >
        <header className="evening-command-center-header">
          <div className="evening-command-center-heading">
            <h2 id="evening-command-center-title">Вечерний центр</h2>
            <p>
              {isCompleted
                ? 'Итоги дня сохранены и доступны для просмотра.'
                : isRecoveryReview
                  ? 'Продолжите незавершённый вечерний цикл.'
                  : isNotStarted
                    ? 'Соберите день и спокойно подготовьте следующий.'
                    : 'Завершите день и подготовьте ясный старт завтра.'}
            </p>
          </div>

          <div className="evening-command-center-controls">
            {isCompleted || isNotStarted ? null : (
              <label className="evening-command-center-mode-select">
                <span className="visually-hidden">Режим завершения</span>
                <select
                  value={cycle.mode}
                  disabled={modeChangeDisabled}
                  aria-label="Режим завершения"
                  onChange={(event) => onModeChange(event.target.value as EveningCycleMode)}
                >
                  {(Object.values(EVENING_CYCLE_MODE) as readonly EveningCycleMode[]).map(
                    (mode) => (
                      <option
                        key={mode}
                        value={mode}
                        disabled={mode !== cycle.mode && !canSwitchMode(cycle.mode, mode)}
                      >
                        {eveningModeLabel(mode)}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
            <button
              className="evening-command-center-close"
              type="button"
              aria-label="Закрыть вечерний центр"
              onClick={onClose}
            >
              <EveningVisualIcon name="close" />
            </button>
          </div>
        </header>

        <EveningJourney
          state={cycle.state}
          domainView={domainView}
          selectedView={visibleView}
          activeIndex={activeIndex}
          activeJourneyItem={activeJourneyItem}
          onSelectView={onSelectView}
        />
        {isCompleted ? null : <EveningKpiRow items={kpis} />}

        <main className="evening-command-center-scene-host">
          <div
            className="evening-command-center-scene"
            key={`${visibleView}:${cycle.mode}:${cycle.state}`}
            data-scene={visibleView}
          >
            {visibleView === domainView || onSelectView === undefined ? null : (
              <button
                className="evening-return-to-current"
                type="button"
                onClick={() => onSelectView(domainView)}
              >
                {eveningReturnToCurrentLabel(domainView)} <span aria-hidden="true">→</span>
              </button>
            )}
            {children}
          </div>
        </main>
      </section>
    </div>
  );
}

function EveningJourney({
  state,
  domainView,
  selectedView,
  activeIndex,
  activeJourneyItem,
  onSelectView,
}: {
  readonly state: EveningReviewSnapshot['cycle']['state'];
  readonly domainView: SelectedEveningView;
  readonly selectedView: SelectedEveningView;
  readonly activeIndex: number;
  readonly activeJourneyItem: RefObject<HTMLLIElement | null>;
  readonly onSelectView: ((view: SelectedEveningView) => void) | undefined;
}) {
  return (
    <nav className="evening-command-center-journey" aria-label="Путь завершения дня">
      <span className="evening-command-center-step-count">Шаг {activeIndex + 1} из 5</span>
      <ol>
        {EVENING_STEPS.map((item, index) => {
          const isComplete = state === EVENING_CYCLE_STATE.completed || index < activeIndex;
          const isCurrent = state !== EVENING_CYCLE_STATE.completed && index === activeIndex;
          const isSelected = item.id === eveningStepIdForView(selectedView);
          const isSelectedHistory = isSelected && !isCurrent;
          const isAvailable = state === EVENING_CYCLE_STATE.completed || index <= activeIndex;
          const status = journeyStatusLabel(isComplete, isCurrent, isSelectedHistory);
          const targetView = stepTargetView(item.id, domainView, isCurrent);
          return (
            <li
              className={`${isComplete ? 'is-complete' : isCurrent ? 'is-current' : ''}${isSelectedHistory ? ' is-selected-history' : ''}`}
              key={item.id}
              data-evening-step={item.id}
              data-domain-current={isCurrent ? 'true' : undefined}
              data-selected-view={isSelected ? 'true' : undefined}
              data-selected-history={isSelectedHistory ? 'true' : undefined}
              ref={isSelected ? activeJourneyItem : undefined}
            >
              <button
                type="button"
                disabled={!isAvailable || onSelectView === undefined}
                aria-current={isSelected ? 'page' : undefined}
                aria-label={`${item.label}: ${status}`}
                onClick={() => onSelectView?.(targetView)}
              >
                <span aria-hidden="true">
                  {isComplete ? <EveningVisualIcon name="check" size={18} /> : index + 1}
                </span>
                <span className="evening-journey-copy">
                  <strong>{item.label}</strong>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function journeyStatusLabel(
  isComplete: boolean,
  isCurrent: boolean,
  isSelectedHistory: boolean,
): string {
  if (isSelectedHistory) return 'открыт для просмотра';
  if (isCurrent) return 'активен';
  if (isComplete) return 'завершён';
  return 'недоступен';
}

function stepTargetView(
  stepId: EveningStepId,
  domainView: SelectedEveningView,
  isCurrent: boolean,
): SelectedEveningView {
  return isCurrent ? domainView : stepId;
}

function EveningKpiRow({ items }: { readonly items: readonly EveningKpiItem[] }) {
  return (
    <section className="evening-command-center-kpis" aria-label="Сводка вечера">
      {items.map((item) => (
        <EveningKpiCard item={item} key={item.label} />
      ))}
    </section>
  );
}

function EveningKpiCard({ item }: { readonly item: EveningKpiItem }) {
  return (
    <article className="evening-kpi-card" data-tone={item.tone}>
      <span className={`evening-kpi-card-icon is-${item.tone}`} aria-hidden="true">
        <EveningVisualIcon name={item.icon} />
      </span>
      <span className="evening-kpi-card-copy">
        <span className="evening-kpi-card-label">{item.label}</span>
        <strong className="evening-kpi-card-value">{item.value}</strong>
        <small className="evening-kpi-card-meta">{item.meta}</small>
      </span>
    </article>
  );
}

function canSwitchMode(current: EveningCycleMode, target: EveningCycleMode): boolean {
  return (
    (current === EVENING_CYCLE_MODE.normal &&
      (target === EVENING_CYCLE_MODE.quick || target === EVENING_CYCLE_MODE.emergency)) ||
    (current === EVENING_CYCLE_MODE.quick && target === EVENING_CYCLE_MODE.normal)
  );
}

const EMPTY_KPIS: readonly EveningKpiItem[] = Object.freeze([
  {
    label: 'Осталось сегодня',
    value: '—',
    meta: 'Данные уточняются',
    icon: 'list',
    tone: 'neutral',
  },
  { label: 'Завтра', value: '—', meta: 'Данные уточняются', icon: 'calendar', tone: 'neutral' },
  { label: 'Режим', value: '—', meta: 'Режим не выбран', icon: 'moon', tone: 'neutral' },
]);
