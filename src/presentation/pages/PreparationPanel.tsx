import { useEffect, useState, type ReactNode } from 'react';
import type { PreparationService, PreparationSnapshot } from '../../application';
import {
  EVENING_CYCLE_MODE,
  PREPARATION_CATEGORY,
  PREPARATION_ITEM_STATUS,
  type DayDate,
  type EveningCycleMode,
  type PreparationCategory,
  type PreparationItem,
} from '../../domain';
import { EveningVisualIcon, type EveningVisualIconName } from '../components/EveningVisualIcon';
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
    'getOrGenerate' | 'completeItem' | 'skipItem' | 'continueToShutdown'
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

const CATEGORY_LABELS: Readonly<Record<PreparationCategory, string>> = {
  [PREPARATION_CATEGORY.physical]: 'Физически',
  [PREPARATION_CATEGORY.digital]: 'Цифровая среда',
  [PREPARATION_CATEGORY.cognitive]: 'Дополнительно',
};

const CATEGORY_ORDER: readonly PreparationCategory[] = Object.freeze([
  PREPARATION_CATEGORY.digital,
  PREPARATION_CATEGORY.physical,
  PREPARATION_CATEGORY.cognitive,
]);

const CATEGORY_ICONS: Readonly<Record<PreparationCategory, EveningVisualIconName>> = {
  [PREPARATION_CATEGORY.physical]: 'chair',
  [PREPARATION_CATEGORY.digital]: 'laptop',
  [PREPARATION_CATEGORY.cognitive]: 'spark',
};

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

  useEffect(() => {
    let cancelled = false;
    void service
      .getOrGenerate(cycleDate)
      .then((snapshot) => {
        if (!cancelled) setLoadState({ status: 'ready', snapshot });
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
      setLoadState({ status: 'ready', snapshot });
    } catch {
      setLoadState({ status: 'error', message: 'Не удалось сохранить пункт подготовки.' });
    } finally {
      setBusyItemId(null);
    }
  }

  async function continueToShutdown(): Promise<void> {
    setIsContinuing(true);
    try {
      const snapshot = await service.continueToShutdown(cycleDate);
      setLoadState({ status: 'ready', snapshot });
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
  readonly onProcess: (item: PreparationItem, skip: boolean) => Promise<void>;
  readonly onContinue: () => Promise<void>;
  readonly onReviewEditingChange: (editing: boolean) => void;
}) {
  const items = visiblePreparationItemsForMode(snapshot.plan.activeItems, mode);
  const { processed, requiredPending, fullyReady, progressValue, summary, action } =
    buildPreparationPanelPresentation(
      items,
      snapshot.firstAction !== null,
      completedReview,
      completedReviewEditing,
    );
  const editable = !completedReview || completedReviewEditing;
  const heading = preparationHeading(completedReview);
  const historyEmpty = completedReview && items.length === 0;
  const categories = CATEGORY_ORDER.flatMap((category) => {
    const categoryItems = items.filter((item) => item.category === category);
    return categoryItems.length === 0 ? [] : [{ category, items: categoryItems }];
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

        {items.length === 0 ? (
          <PreparationEmptyState
            firstActionDefined={snapshot.firstAction !== null}
            completedReview={completedReview}
          />
        ) : (
          <div
            className={`preparation-sections preparation-sections-${categories.length}`}
            aria-label="Категории подготовки"
          >
            {categories.map(({ category, items: categoryItems }) => (
              <PreparationSection
                category={category}
                items={categoryItems}
                busyItemId={busyItemId}
                editable={editable}
                reviewEditing={completedReviewEditing}
                completedReview={completedReview}
                onProcess={onProcess}
                key={category}
              />
            ))}
          </div>
        )}

        {historyEmpty ? null : (
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
            {action === null ? null : (
              <button
                className={`${action.tone}-button preparation-scene-action`}
                type="button"
                disabled={action.intent === 'continue' && (isContinuing || requiredPending > 0)}
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
  return CATEGORY_ICONS[id];
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

export function PreparationSection({
  category,
  items,
  busyItemId,
  editable,
  reviewEditing,
  completedReview,
  onProcess,
}: {
  readonly category: PreparationCategory;
  readonly items: readonly PreparationItem[];
  readonly busyItemId: string | null;
  readonly editable: boolean;
  readonly reviewEditing: boolean;
  readonly completedReview: boolean;
  readonly onProcess: (item: PreparationItem, skip: boolean) => Promise<void>;
}) {
  const categoryKey = category.toLowerCase();
  return (
    <section
      className="preparation-category"
      data-category={categoryKey}
      aria-labelledby={`preparation-${categoryKey}`}
    >
      <header className="preparation-category-heading">
        <span aria-hidden="true">
          <EveningVisualIcon name={CATEGORY_ICONS[category]} size={22} />
        </span>
        <h4 id={`preparation-${categoryKey}`}>{CATEGORY_LABELS[category]}</h4>
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
              <button
                className="preparation-item-button"
                type="button"
                disabled={
                  !editable ||
                  busyItemId !== null ||
                  (!pending &&
                    (!reviewEditing || item.status === PREPARATION_ITEM_STATUS.completed))
                }
                onClick={() => void onProcess(item, false)}
              >
                <span className="preparation-check" aria-hidden="true">
                  {item.status === PREPARATION_ITEM_STATUS.completed ? (
                    <EveningVisualIcon name="check" size={17} />
                  ) : item.status === PREPARATION_ITEM_STATUS.skipped ? (
                    '—'
                  ) : null}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{preparationItemStatus(item, completedReview)}</small>
                </span>
              </button>
              {editable && (pending || reviewEditing) ? (
                item.required ? (
                  <details className="preparation-item-menu">
                    <summary aria-label={`Другие действия: ${item.title}`}>•••</summary>
                    <button
                      type="button"
                      disabled={
                        busyItemId !== null || item.status === PREPARATION_ITEM_STATUS.skipped
                      }
                      onClick={() => void onProcess(item, true)}
                    >
                      {item.status === PREPARATION_ITEM_STATUS.skipped
                        ? 'Уже пропущено'
                        : 'Пропустить'}
                    </button>
                  </details>
                ) : (
                  <button
                    className="text-button preparation-skip"
                    type="button"
                    disabled={
                      busyItemId !== null || item.status === PREPARATION_ITEM_STATUS.skipped
                    }
                    onClick={() => void onProcess(item, true)}
                  >
                    {item.status === PREPARATION_ITEM_STATUS.skipped ? 'Пропущено' : 'Пропустить'}
                  </button>
                )
              ) : null}
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
