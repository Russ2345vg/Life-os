import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import type { CreateDecisionForDate, GetDecisionsForDate } from '../../application';
import {
  DECISION_KIND,
  DECISION_STATUS,
  type DayDate,
  type Decision,
  type DecisionKind,
  type DecisionStatus,
} from '../../domain';
import {
  createDecisionAndReload,
  INITIAL_TODAY_PAGE_STATE,
  todayPageReducer,
  validateDecisionForm,
  type DecisionFormState,
  type TodayPageState,
} from './TodayPageState';

interface TodayPageProps {
  readonly currentDate: DayDate;
  readonly getDecisionsForDate: Pick<GetDecisionsForDate, 'execute'>;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
}

export function TodayPage({
  currentDate,
  getDecisionsForDate,
  createDecisionForDate,
}: TodayPageProps) {
  const [state, dispatch] = useReducer(todayPageReducer, INITIAL_TODAY_PAGE_STATE);
  const savingRef = useRef(false);

  const loadDecisions = useCallback(async () => {
    dispatch({ type: 'load_started' });
    try {
      const decisions = await getDecisionsForDate.execute(currentDate);
      dispatch({ type: 'load_succeeded', decisions });
    } catch {
      dispatch({ type: 'load_failed' });
    }
  }, [currentDate, getDecisionsForDate]);

  useEffect(() => {
    void loadDecisions();
  }, [loadDecisions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (savingRef.current) {
      return;
    }

    const validationError = validateDecisionForm(state.form);
    if (validationError !== null) {
      dispatch({ type: 'save_failed', message: validationError });
      return;
    }

    savingRef.current = true;
    dispatch({ type: 'save_started' });
    try {
      const result = await createDecisionAndReload({
        currentDate,
        form: state.form,
        createDecisionForDate,
        getDecisionsForDate,
      });

      if (!result.ok) {
        dispatch({ type: 'save_failed', message: result.message });
        return;
      }

      dispatch({ type: 'save_succeeded' });
      dispatch({ type: 'load_succeeded', decisions: result.decisions });
    } catch {
      dispatch({ type: 'save_failed', message: 'Не удалось создать решение' });
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <TodayPageView
      currentDate={currentDate}
      state={state}
      onRetry={() => void loadDecisions()}
      onOpenForm={() => dispatch({ type: 'open_form' })}
      onCloseForm={() => dispatch({ type: 'close_form' })}
      onKindChange={(kind) => dispatch({ type: 'kind_changed', kind })}
      onTitleChange={(title) => dispatch({ type: 'title_changed', title })}
      onExpectedResultChange={(expectedResult) =>
        dispatch({ type: 'expected_result_changed', expectedResult })
      }
      onSubmit={(event) => void handleSubmit(event)}
    />
  );
}

interface TodayPageViewProps {
  readonly currentDate: DayDate;
  readonly state: TodayPageState;
  readonly onRetry: () => void;
  readonly onOpenForm: () => void;
  readonly onCloseForm: () => void;
  readonly onKindChange: (kind: DecisionKind) => void;
  readonly onTitleChange: (title: string) => void;
  readonly onExpectedResultChange: (expectedResult: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function TodayPageView({
  currentDate,
  state,
  onRetry,
  onOpenForm,
  onCloseForm,
  onKindChange,
  onTitleChange,
  onExpectedResultChange,
  onSubmit,
}: TodayPageViewProps) {
  return (
    <main className="today-page">
      <header className="today-header">
        <p className="today-brand">LifeOS</p>
        <div>
          <h1>Сегодня</h1>
          <p className="today-date">{formatRussianDate(currentDate)}</p>
        </div>
        <p className="today-storage-note">Данные сохраняются на этом устройстве</p>
      </header>

      <div className="today-actions">
        <button className="primary-button" type="button" onClick={onOpenForm}>
          Создать решение
        </button>
      </div>

      {state.isFormOpen ? (
        <DecisionForm
          form={state.form}
          isSaving={state.isSaving}
          error={state.formError}
          onKindChange={onKindChange}
          onTitleChange={onTitleChange}
          onExpectedResultChange={onExpectedResultChange}
          onClose={onCloseForm}
          onSubmit={onSubmit}
        />
      ) : null}

      {state.decisions.status === 'loading' ? (
        <p className="page-message" role="status">
          Загружаем решения…
        </p>
      ) : null}

      {state.decisions.status === 'error' ? (
        <section className="page-message page-error" role="alert">
          <p>Не удалось загрузить решения</p>
          <button className="secondary-button" type="button" onClick={onRetry}>
            Повторить
          </button>
        </section>
      ) : null}

      {state.decisions.status === 'ready' ? (
        <DecisionSections decisions={state.decisions.decisions} />
      ) : null}
    </main>
  );
}

interface DecisionFormProps {
  readonly form: DecisionFormState;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onKindChange: (kind: DecisionKind) => void;
  readonly onTitleChange: (title: string) => void;
  readonly onExpectedResultChange: (expectedResult: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function DecisionForm({
  form,
  isSaving,
  error,
  onKindChange,
  onTitleChange,
  onExpectedResultChange,
  onClose,
  onSubmit,
}: DecisionFormProps) {
  const isMain = form.kind === DECISION_KIND.main;

  return (
    <section className="decision-form-panel" aria-labelledby="decision-form-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Новое намерение</p>
          <h2 id="decision-form-title">Создать решение</h2>
        </div>
      </div>
      <form className="decision-form" onSubmit={onSubmit} noValidate>
        <label>
          <span>Вид</span>
          <select
            value={form.kind}
            disabled={isSaving}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onKindChange(event.target.value as DecisionKind)
            }
          >
            <option value={DECISION_KIND.main}>Главное</option>
            <option value={DECISION_KIND.additional}>Дополнительное</option>
          </select>
        </label>

        <label>
          <span>Название решения</span>
          <input
            value={form.title}
            disabled={isSaving}
            maxLength={200}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onTitleChange(event.target.value)}
          />
        </label>

        <label>
          <span>Ожидаемый результат{isMain ? ' *' : ''}</span>
          <textarea
            value={form.expectedResult}
            disabled={isSaving}
            maxLength={1000}
            rows={3}
            aria-required={isMain}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onExpectedResultChange(event.target.value)
            }
          />
        </label>

        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? 'Сохраняем…' : 'Создать'}
          </button>
          <button className="secondary-button" type="button" disabled={isSaving} onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </section>
  );
}

function DecisionSections({ decisions }: { readonly decisions: readonly Decision[] }) {
  const mainDecisions = decisions.filter((decision) => decision.kind === DECISION_KIND.main);
  const additionalDecisions = decisions.filter(
    (decision) => decision.kind === DECISION_KIND.additional,
  );

  return (
    <div className="decision-sections">
      <section className="decision-section" aria-labelledby="main-decisions-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker gold">Фокус дня</p>
            <h2 id="main-decisions-title">Главные решения</h2>
          </div>
          <span className="section-count">до 3</span>
        </div>
        <div className="main-decision-grid">
          {[1, 2, 3].map((order) => {
            const decision = findDecisionForOrder(mainDecisions, order);
            return decision === undefined ? (
              <EmptyMainDecision key={order} order={order} />
            ) : (
              <DecisionCard key={decision.id.toString()} decision={decision} order={order} main />
            );
          })}
        </div>
      </section>

      <section className="decision-section" aria-labelledby="additional-decisions-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Остальное</p>
            <h2 id="additional-decisions-title">Дополнительные решения</h2>
          </div>
        </div>
        {additionalDecisions.length === 0 ? (
          <p className="empty-additional">Дополнительных решений пока нет</p>
        ) : (
          <div className="additional-decision-list">
            {additionalDecisions.map((decision) => (
              <DecisionCard key={decision.id.toString()} decision={decision} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyMainDecision({ order }: { readonly order: number }) {
  return (
    <article className="decision-card main-decision empty-decision">
      <span className="decision-order">{order}</span>
      <p>Место свободно</p>
    </article>
  );
}

function DecisionCard({
  decision,
  order,
  main = false,
}: {
  readonly decision: Decision;
  readonly order?: number;
  readonly main?: boolean;
}) {
  return (
    <article className={`decision-card${main ? ' main-decision' : ''}`}>
      {order === undefined ? null : <span className="decision-order">{order}</span>}
      <h3>{decision.title.toString()}</h3>
      {decision.expectedResult === null ? null : (
        <p className="decision-result">{decision.expectedResult.toString()}</p>
      )}
      <span className={`status-badge status-${decision.status}`}>
        {decisionStatusLabel(decision.status)}
      </span>
    </article>
  );
}

function findDecisionForOrder(decisions: readonly Decision[], order: number): Decision | undefined {
  const matchingDecisions = decisions.filter((decision) => decision.order === order);
  return (
    matchingDecisions.find(
      (decision) =>
        decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress,
    ) ?? matchingDecisions[0]
  );
}

function decisionStatusLabel(status: DecisionStatus): string {
  switch (status) {
    case DECISION_STATUS.draft:
      return 'Черновик';
    case DECISION_STATUS.planned:
      return 'Запланировано';
    case DECISION_STATUS.inProgress:
      return 'Выполняется';
    case DECISION_STATUS.confirmed:
      return 'Подтверждено';
    case DECISION_STATUS.cancelled:
      return 'Отменено';
  }
}

function formatRussianDate(date: DayDate): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}
