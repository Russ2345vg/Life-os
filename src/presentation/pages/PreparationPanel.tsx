import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { PreparationService, PreparationSnapshot } from '../../application';
import {
  EVENING_CYCLE_MODE,
  PREPARATION_ITEM_STATUS,
  type DayDate,
  type EveningCycleMode,
  type PreparationItem,
} from '../../domain';
import { PREPARATION_AREA, type PreparationArea } from '../../domain/preparation';
import { EveningVisualIcon, type EveningVisualIconName } from '../components/EveningVisualIcon';
import '../styles/evening-environment.css';
import { visiblePreparationItemsForMode } from './EveningModePresentation';
import {
  buildPreparationPanelPresentation,
  preparationHeading,
  type PreparationSummaryItem,
} from './PreparationPanelPresentation';

interface PreparationPanelProps {
  readonly cycleDate: DayDate;
  readonly service: Pick<
    PreparationService,
    'getOrGenerate' | 'configureRequiredCore' | 'completeItem' | 'skipItem' | 'continueToShutdown'
  >;
  readonly onContinued: () => void;
  readonly onClose: () => void;
  readonly mode?: EveningCycleMode;
  readonly embedded?: boolean;
  readonly completedReview?: boolean;
}

type LoadState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string }>
  | Readonly<{ status: 'ready'; snapshot: PreparationSnapshot }>;

const AREA_ORDER: readonly PreparationArea[] = Object.freeze([
  PREPARATION_AREA.sleepEnvironment,
  PREPARATION_AREA.tomorrowStart,
]);

const AREA_LABELS: Readonly<Record<PreparationArea, string>> = {
  [PREPARATION_AREA.sleepEnvironment]: 'Среда для сна',
  [PREPARATION_AREA.tomorrowStart]: 'Среда для завтра',
};

const AREA_ICONS: Readonly<Record<PreparationArea, EveningVisualIconName>> = {
  [PREPARATION_AREA.sleepEnvironment]: 'chair',
  [PREPARATION_AREA.tomorrowStart]: 'sun',
};

interface PreparationCoreSelectionDraft {
  readonly planId: string;
  readonly savedCoreSignature: string;
  readonly selectedKeys: readonly string[];
}

export function PreparationPanel({
  cycleDate,
  service,
  onContinued,
  onClose,
  mode = EVENING_CYCLE_MODE.normal,
  embedded = false,
  completedReview = false,
}: PreparationPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [completedReviewEditing, setCompletedReviewEditing] = useState(false);
  const [coreDraft, setCoreDraft] = useState<PreparationCoreSelectionDraft | null>(null);
  const [isConfiguringCore, setIsConfiguringCore] = useState(false);
  const [isSavingCore, setIsSavingCore] = useState(false);
  const [coreError, setCoreError] = useState<string | null>(null);
  const coreErrorRef = useRef<HTMLDivElement | null>(null);
  const checklistHeadingRef = useRef<HTMLHeadingElement | null>(null);

  function acceptSnapshot(snapshot: PreparationSnapshot): void {
    setLoadState({ status: 'ready', snapshot });
    const nextDraft = coreSelectionDraft(snapshot);
    setCoreDraft((current) =>
      current !== null &&
      current.planId === nextDraft.planId &&
      current.savedCoreSignature === nextDraft.savedCoreSignature
        ? current
        : nextDraft,
    );
  }

  useEffect(() => {
    if (coreError !== null) coreErrorRef.current?.focus();
  }, [coreError]);

  useEffect(() => {
    let cancelled = false;
    void service
      .getOrGenerate(cycleDate)
      .then((snapshot) => {
        if (!cancelled) acceptSnapshot(snapshot);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState({ status: 'error', message: 'Не удалось загрузить подготовку.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cycleDate, reloadToken, service]);

  async function processItem(item: PreparationItem, skip: boolean): Promise<void> {
    setBusyItemId(item.id.toString());
    try {
      const snapshot = skip
        ? await service.skipItem(cycleDate, item.id)
        : await service.completeItem(cycleDate, item.id);
      acceptSnapshot(snapshot);
    } catch {
      setLoadState({ status: 'error', message: 'Не удалось сохранить пункт подготовки.' });
    } finally {
      setBusyItemId(null);
    }
  }

  async function configureRequiredCore(): Promise<void> {
    if (coreDraft === null || !isValidCoreSelection(coreDraft.selectedKeys)) return;
    setIsSavingCore(true);
    setCoreError(null);
    try {
      const snapshot = await service.configureRequiredCore(cycleDate, coreDraft.selectedKeys);
      acceptSnapshot(snapshot);
      setIsConfiguringCore(false);
      requestAnimationFrame(() => checklistHeadingRef.current?.focus());
    } catch {
      setCoreError('Не удалось сохранить обязательное ядро. Повторить');
    } finally {
      setIsSavingCore(false);
    }
  }

  async function continueToShutdown(): Promise<void> {
    setIsContinuing(true);
    try {
      const snapshot = await service.continueToShutdown(cycleDate);
      acceptSnapshot(snapshot);
      if (completedReview) {
        setCompletedReviewEditing(false);
      }
      onContinued();
    } catch {
      setLoadState({
        status: 'error',
        message: 'Обработайте все обязательные пункты перед продолжением.',
      });
    } finally {
      setIsContinuing(false);
    }
  }

  if (loadState.status === 'loading') {
    return (
      <PreparationFrame onClose={onClose} embedded={embedded}>
        <PreparationSceneState status="loading" />
      </PreparationFrame>
    );
  }
  if (loadState.status === 'error') {
    return (
      <PreparationFrame onClose={onClose} embedded={embedded}>
        <PreparationSceneState
          status="error"
          message={loadState.message}
          onRetry={() => {
            setLoadState({ status: 'loading' });
            setReloadToken((value) => value + 1);
          }}
        />
      </PreparationFrame>
    );
  }

  return (
    <PreparationFrame onClose={onClose} embedded={embedded}>
      <PreparationSceneView
        snapshot={loadState.snapshot}
        mode={mode}
        completedReview={completedReview}
        completedReviewEditing={completedReviewEditing}
        busyItemId={busyItemId}
        isContinuing={isContinuing}
        coreDraft={coreDraft ?? coreSelectionDraft(loadState.snapshot)}
        isConfiguringCore={isConfiguringCore}
        isSavingCore={isSavingCore}
        coreError={coreError}
        coreErrorRef={coreErrorRef}
        checklistHeadingRef={checklistHeadingRef}
        onCoreDraftChange={setCoreDraft}
        onConfigureCore={configureRequiredCore}
        onConfigureCoreChange={(configuring) => {
          setCoreError(null);
          setIsConfiguringCore(configuring);
        }}
        onProcess={processItem}
        onContinue={continueToShutdown}
        onReviewEditingChange={setCompletedReviewEditing}
      />
    </PreparationFrame>
  );
}

export function PreparationSceneView({
  snapshot,
  mode,
  completedReview,
  completedReviewEditing,
  busyItemId,
  isContinuing,
  coreDraft,
  isConfiguringCore,
  isSavingCore,
  coreError,
  coreErrorRef,
  checklistHeadingRef,
  onCoreDraftChange,
  onConfigureCore,
  onConfigureCoreChange,
  onProcess,
  onContinue,
  onReviewEditingChange,
}: {
  readonly snapshot: PreparationSnapshot;
  readonly mode: EveningCycleMode;
  readonly completedReview: boolean;
  readonly completedReviewEditing: boolean;
  readonly busyItemId: string | null;
  readonly isContinuing: boolean;
  readonly coreDraft?: PreparationCoreSelectionDraft;
  readonly isConfiguringCore?: boolean;
  readonly isSavingCore?: boolean;
  readonly coreError?: string | null;
  readonly coreErrorRef?: RefObject<HTMLDivElement | null> | undefined;
  readonly checklistHeadingRef?: RefObject<HTMLHeadingElement | null> | undefined;
  readonly onCoreDraftChange?: (draft: PreparationCoreSelectionDraft) => void;
  readonly onConfigureCore?: () => Promise<void>;
  readonly onConfigureCoreChange?: (configuring: boolean) => void;
  readonly onProcess: (item: PreparationItem, skip: boolean) => Promise<void>;
  readonly onContinue: () => Promise<void>;
  readonly onReviewEditingChange: (editing: boolean) => void;
}) {
  const items = visiblePreparationItemsForMode(snapshot.plan.activeItems, mode);
  const resolvedCoreDraft = coreDraft ?? coreSelectionDraft(snapshot);
  const configuringCore = isConfiguringCore ?? false;
  const savingCore = isSavingCore ?? false;
  const coreConfigured = snapshot.plan.requiredCoreKeys !== null;
  const isEmergency = mode === EVENING_CYCLE_MODE.emergency;
  const showCoreConfiguration =
    !completedReview && (!coreConfigured || (!isEmergency && configuringCore));
  const { processed, requiredPending, fullyReady, progressValue, summary, action } =
    buildPreparationPanelPresentation(
      items,
      snapshot.firstAction !== null,
      completedReview,
      completedReviewEditing,
      coreConfigured,
    );
  const editable = !completedReview || completedReviewEditing;
  const heading = preparationHeading(completedReview);
  const historyEmpty = completedReview && items.length === 0;
  const areas = AREA_ORDER.flatMap((area) => {
    const areaItems = items.filter((item) => item.area === area);
    return areaItems.length === 0 ? [] : [{ area, items: areaItems }];
  });

  return (
    <div
      className="evening-preparation-scene"
      data-scene-mode={completedReview ? 'history' : 'active'}
      data-ready={fullyReady ? 'true' : 'false'}
      data-history-empty={historyEmpty ? 'true' : undefined}
    >
      <header className="evening-preparation-heading">
        <p className="section-kicker gold">{heading.kicker}</p>
        <h3>{heading.title}</h3>
      </header>

      <div className="preparation-workspace">
        <section className="preparation-first-start" aria-labelledby="preparation-action-title">
          <div className="preparation-first-start-icon" aria-hidden="true">
            <EveningVisualIcon name="sun" size={30} />
          </div>
          <div className="preparation-first-start-copy">
            <p className="section-kicker gold">
              {completedReview ? 'Первый старт был определён' : 'Первый старт завтра'}
            </p>
            <h4 id="preparation-action-title">
              {snapshot.firstAction?.title.toString() ?? 'Первый шаг не определён'}
            </h4>
            {snapshot.firstAction?.description === null ||
            snapshot.firstAction?.description === undefined ? null : (
              <p className="preparation-first-start-description">
                {snapshot.firstAction.description}
              </p>
            )}
            <div className="preparation-first-start-context">
              {snapshot.firstAction?.expectedResult === null ||
              snapshot.firstAction?.expectedResult === undefined ? null : (
                <p>
                  <span>Результат шага</span>
                  <strong>{snapshot.firstAction.expectedResult.toString()}</strong>
                </p>
              )}
              {historyEmpty && snapshot.primaryDecision !== null ? (
                <p>
                  <span>Главное Решение</span>
                  <strong>{snapshot.primaryDecision.title.toString()}</strong>
                </p>
              ) : null}
              {snapshot.project === null ? null : (
                <p>
                  <span>Проект</span>
                  <strong>{snapshot.project.title}</strong>
                </p>
              )}
              {!historyEmpty && snapshot.primaryDecision !== null ? (
                <p>
                  <span>Главное Решение</span>
                  <strong>{snapshot.primaryDecision.title.toString()}</strong>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {historyEmpty ? null : <PreparationSummaryStrip items={summary} />}

        {showCoreConfiguration ? (
          <PreparationCoreConfiguration
            items={snapshot.plan.activeItems}
            draft={resolvedCoreDraft}
            isSaving={savingCore}
            error={coreError ?? null}
            errorRef={coreErrorRef}
            onDraftChange={onCoreDraftChange}
            onConfirm={onConfigureCore}
          />
        ) : items.length === 0 ? (
          <PreparationEmptyState
            firstActionDefined={snapshot.firstAction !== null}
            completedReview={completedReview}
          />
        ) : (
          <div
            className={`preparation-sections preparation-environment-areas preparation-sections-${areas.length}`}
            aria-label="Области подготовки среды"
          >
            {areas.map(({ area, items: areaItems }) => (
              <PreparationSection
                area={area}
                items={areaItems}
                busyItemId={busyItemId}
                editable={editable}
                reviewEditing={completedReviewEditing}
                completedReview={completedReview}
                onProcess={onProcess}
                headingRef={area === PREPARATION_AREA.sleepEnvironment ? checklistHeadingRef : undefined}
                key={area}
              />
            ))}
          </div>
        )}

        {showCoreConfiguration || historyEmpty ? null : (
          <footer className="preparation-readiness">
            <div className="preparation-status-copy">
              <strong>
                {completedReview ? 'Было подготовлено' : 'Подготовлено'} {processed} из{' '}
                {items.length}
              </strong>
              <span>
                {requiredPending > 0
                  ? 'Остались препятствия, необходимые для первого старта'
                  : completedReview
                    ? 'Обязательные препятствия были обработаны'
                    : 'Первому старту ничего не мешает'}
              </span>
            </div>
            <div
              className={`preparation-progress-segments${items.length === 0 ? ' is-empty' : ''}`}
              role="progressbar"
              aria-label="Общий прогресс подготовки"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressValue}
            >
              {items.map((item) => (
                <span
                  className={
                    item.status === PREPARATION_ITEM_STATUS.pending
                      ? 'is-pending'
                      : item.status === PREPARATION_ITEM_STATUS.completed
                        ? 'is-completed'
                        : 'is-skipped'
                  }
                  key={item.id.toString()}
                />
              ))}
            </div>
            {!completedReview && !isEmergency ? (
              <button
                className="secondary-button preparation-core-edit"
                type="button"
                disabled={savingCore || busyItemId !== null || isContinuing}
                onClick={() => onConfigureCoreChange?.(true)}
              >
                Настроить ядро
              </button>
            ) : null}
            {action === null ? null : (
              <button
                className={`${action.tone}-button preparation-scene-action`}
                type="button"
                disabled={
                  action.intent === 'continue' &&
                  (isContinuing ||
                    savingCore ||
                    busyItemId !== null ||
                    !coreConfigured ||
                    requiredPending > 0)
                }
                onClick={() => {
                  if (action.intent === 'continue') void onContinue();
                  else onReviewEditingChange(action.intent === 'beginEdit');
                }}
              >
                {isContinuing && action.intent === 'continue' ? 'Сохраняем…' : action.label}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

function PreparationSummaryStrip({ items }: { readonly items: readonly PreparationSummaryItem[] }) {
  const prepared = items.find((item) => item.id === 'prepared');
  const details = items.filter((item) => item.id !== 'prepared');
  if (prepared === undefined) return null;

  return (
    <section className="preparation-summary-strip" aria-label="Краткая сводка готовности">
      <div className="preparation-summary-primary" data-tone={prepared.tone}>
        <span className="preparation-summary-icon" aria-hidden="true">
          <EveningVisualIcon name={summaryIcon(prepared.id)} size={19} />
        </span>
        <span>{prepared.label}</span>
        <strong>{prepared.value}</strong>
      </div>
      <ul className="preparation-summary-details">
        {details.map((item) => (
          <li data-tone={item.tone} key={item.id}>
            <span className="preparation-summary-detail-icon" aria-hidden="true">
              <EveningVisualIcon name={summaryIcon(item.id)} size={15} />
            </span>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function summaryIcon(id: PreparationSummaryItem['id']): EveningVisualIconName {
  if (id === 'prepared') return 'list';
  if (id === 'first-start') return 'sun';
  return AREA_ICONS[id];
}

function coreSelectionDraft(snapshot: PreparationSnapshot): PreparationCoreSelectionDraft {
  const selectedKeys = snapshot.plan.requiredCoreKeys ?? snapshot.recommendedCoreKeys;
  return {
    planId: snapshot.plan.id.toString(),
    savedCoreSignature: [...selectedKeys].sort().join('|'),
    selectedKeys: [...selectedKeys],
  };
}

function isValidCoreSelection(keys: readonly string[]): boolean {
  return keys.length >= 3 && keys.length <= 6;
}

export function PreparationSceneState({
  status,
  message,
  onRetry,
}: {
  readonly status: 'loading' | 'error';
  readonly message?: string;
  readonly onRetry?: () => void;
}) {
  if (status === 'loading') {
    return (
      <section className="preparation-scene-state" role="status">
        <EveningVisualIcon name="preparation" size={24} />
        <p>Собираем подготовку к первому старту…</p>
      </section>
    );
  }
  return (
    <section className="preparation-scene-state is-error" role="alert">
      <p>{message ?? 'Не удалось загрузить подготовку.'}</p>
      {onRetry === undefined ? null : (
        <button className="secondary-button" type="button" onClick={onRetry}>
          Повторить
        </button>
      )}
    </section>
  );
}

function PreparationCoreConfiguration({
  items,
  draft,
  isSaving,
  error,
  errorRef,
  onDraftChange,
  onConfirm,
}: {
  readonly items: readonly PreparationItem[];
  readonly draft: PreparationCoreSelectionDraft;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly errorRef?: RefObject<HTMLDivElement | null> | undefined;
  readonly onDraftChange?: ((draft: PreparationCoreSelectionDraft) => void) | undefined;
  readonly onConfirm?: (() => Promise<void>) | undefined;
}) {
  const selected = new Set(draft.selectedKeys);
  return (
    <section className="preparation-core-configuration" aria-labelledby="preparation-core-title">
      <header>
        <p className="section-kicker gold">Обязательное ядро</p>
        <h4 id="preparation-core-title">Настройте обязательное ядро</h4>
        <p id="preparation-core-count">Выбрано {selected.size} из 3–6</p>
      </header>
      <div className="preparation-core-areas" aria-describedby="preparation-core-count">
        {AREA_ORDER.map((area) => {
          const areaItems = items.filter((item) => item.area === area);
          if (areaItems.length === 0) return null;
          return (
            <section className="preparation-core-area" aria-labelledby={`core-area-${area}`} key={area}>
              <h5 id={`core-area-${area}`}>{AREA_LABELS[area]}</h5>
              <ul>
                {areaItems.map((item) => {
                  const selectedItem = selected.has(item.key);
                  return (
                    <li key={item.id.toString()}>
                      <button
                        className="preparation-core-option"
                        type="button"
                        aria-pressed={selectedItem}
                        disabled={isSaving}
                        onClick={() => {
                          if (onDraftChange === undefined) return;
                          const nextKeys = selectedItem
                            ? draft.selectedKeys.filter((key) => key !== item.key)
                            : [...draft.selectedKeys, item.key];
                          onDraftChange({ ...draft, selectedKeys: nextKeys });
                        }}
                      >
                        <span className="preparation-core-selected-indicator" aria-hidden="true">
                          {selectedItem ? '✓' : '○'}
                        </span>
                        <span>{item.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {error === null ? null : (
        <div className="preparation-core-error" role="alert" tabIndex={-1} ref={errorRef}>
          <span>{error.replace(' Повторить', '')}</span>
          <button
            className="text-button"
            type="button"
            disabled={isSaving}
            onClick={() => void onConfirm?.()}
          >
            Повторить
          </button>
        </div>
      )}
      <button
        className="primary-button preparation-core-confirm"
        type="button"
        disabled={isSaving || !isValidCoreSelection(draft.selectedKeys)}
        onClick={() => void onConfirm?.()}
      >
        {isSaving ? 'Сохраняем…' : 'Подтвердить ядро'}
      </button>
    </section>
  );
}

export function PreparationSection({
  area,
  items,
  busyItemId,
  editable,
  reviewEditing,
  completedReview,
  onProcess,
  headingRef,
}: {
  readonly area: PreparationArea;
  readonly items: readonly PreparationItem[];
  readonly busyItemId: string | null;
  readonly editable: boolean;
  readonly reviewEditing: boolean;
  readonly completedReview: boolean;
  readonly onProcess: (item: PreparationItem, skip: boolean) => Promise<void>;
  readonly headingRef?: RefObject<HTMLHeadingElement | null> | undefined;
}) {
  const areaKey = area.toLowerCase();
  return (
    <section
      className="preparation-category preparation-environment-area"
      data-area={areaKey}
      aria-labelledby={`preparation-${areaKey}`}
    >
      <header className="preparation-category-heading">
        <span aria-hidden="true">
          <EveningVisualIcon name={AREA_ICONS[area]} size={22} />
        </span>
        <h4 id={`preparation-${areaKey}`} ref={headingRef} tabIndex={-1}>
          {AREA_LABELS[area]}
        </h4>
        <small>
          {items.filter((item) => item.status !== PREPARATION_ITEM_STATUS.pending).length} из{' '}
          {items.length}
        </small>
      </header>
      <ul className="preparation-list">
        {items.map((item) => {
          const pending = item.status === PREPARATION_ITEM_STATUS.pending;
          return (
            <li
              className={`is-${item.status.toLowerCase()}${item.required ? '' : ' is-optional'}`}
              data-required={item.required ? 'true' : 'false'}
              key={item.id.toString()}
            >
              <div className="preparation-item-copy">
                <span className="preparation-check" aria-hidden="true">
                  {item.status === PREPARATION_ITEM_STATUS.completed ? (
                    <EveningVisualIcon name="check" size={17} />
                  ) : item.status === PREPARATION_ITEM_STATUS.skipped ? (
                    '—'
                  ) : null}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  {pending ? <small>{preparationItemStatus(item, completedReview)}</small> : null}
                  {item.required ? <em>Обязательное ядро</em> : null}
                </span>
              </div>
              {editable && pending ? (
                <div className="preparation-item-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busyItemId !== null}
                    onClick={() => void onProcess(item, false)}
                  >
                    Выполнено
                  </button>
                  <button
                    className="text-button preparation-skip"
                    type="button"
                    disabled={busyItemId !== null}
                    onClick={() => void onProcess(item, true)}
                  >
                    Пропустить сегодня
                  </button>
                </div>
              ) : reviewEditing && pending ? null : (
                <span className="preparation-item-outcome">{preparationItemStatus(item, completedReview)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function preparationItemStatus(item: PreparationItem, completedReview: boolean): string {
  if (item.status === PREPARATION_ITEM_STATUS.completed) {
    return 'Выполнено';
  }
  if (item.status === PREPARATION_ITEM_STATUS.skipped) {
    return completedReview ? 'Было осознанно пропущено' : 'Осознанно пропущено';
  }
  return item.required
    ? 'Ожидает · Нужно для первого старта'
    : 'Ожидает · Можно подготовить дополнительно';
}

export function PreparationEmptyState({
  firstActionDefined,
  completedReview,
}: {
  readonly firstActionDefined: boolean;
  readonly completedReview: boolean;
}) {
  if (completedReview) {
    return (
      <section
        className="preparation-success-state is-history-empty"
        aria-labelledby="preparation-empty-title"
      >
        <span className="preparation-empty-icon" aria-hidden="true">
          <EveningVisualIcon name="check" size={20} />
        </span>
        <div>
          <p className="section-kicker green">Всё было готово</p>
          <h4 id="preparation-empty-title">Дополнительных пунктов подготовки не требовалось.</h4>
          {firstActionDefined ? null : <p>Первый шаг не был зафиксирован.</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="preparation-success-state" aria-labelledby="preparation-empty-title">
      <span className="preparation-empty-icon" aria-hidden="true">
        <EveningVisualIcon name="check" size={20} />
      </span>
      <div>
        <p className="section-kicker green">Всё готово</p>
        <h4 id="preparation-empty-title">
          Для завтрашнего старта дополнительная подготовка не нужна.
        </h4>
        <p>{firstActionDefined ? 'Первый шаг уже определён.' : 'Первый шаг ещё не определён.'}</p>
      </div>
    </section>
  );
}

function PreparationFrame({
  onClose,
  children,
  embedded,
}: {
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly embedded: boolean;
}) {
  if (embedded) {
    return <div className="evening-command-center-scene-content preparation-panel">{children}</div>;
  }
  return (
    <div className="details-backdrop evening-review-backdrop" role="presentation">
      <section
        className="details-panel evening-review-panel preparation-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preparation-title"
      >
        <header className="details-panel-header">
          <div>
            <p className="section-kicker gold">Подготовка</p>
            <h2 id="preparation-title">Подготовить завтра</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="details-panel-content evening-review-content">{children}</div>
      </section>
    </div>
  );
}
