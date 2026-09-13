import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  GetManagementOverview,
  ManagementOverviewSignal,
  ManagementOverviewSnapshot,
} from '../../application';
import type { DayDate } from '../../domain';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { MANAGEMENT_SECTION, type ManagementSection } from './ManagementSection';
import '../styles/management-overview.css';

interface OverviewNavigation {
  readonly onOpenSection: (section: ManagementSection) => void;
  readonly onOpenProject: (projectId: string) => void;
  readonly onOpenDirection: (directionId: string) => void;
  readonly onOpenDecision: (decisionId: string) => void;
}
interface ManagementOverviewProps extends OverviewNavigation {
  readonly getManagementOverview: Pick<GetManagementOverview, 'execute'>;
  readonly currentDate: DayDate;
}
type OverviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: ManagementOverviewSnapshot }
  | { readonly status: 'error' };

export function ManagementOverview(props: ManagementOverviewProps) {
  const [attempt, setAttempt] = useState(0);
  const date = props.currentDate.toString();
  return (
    <main className="section-page management-overview">
      <SectionPageHeader
        eyebrow="Текущее состояние"
        title="Обзор управления"
        description="Фокус, день, курс и только достоверные сигналы."
        action={
          <time className="overview-date" dateTime={date}>
            <AppIcon name="today" />
            {new Intl.DateTimeFormat('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${date}T12:00:00Z`))}
          </time>
        }
      />
      <OverviewLoader
        key={`${date}:${attempt}`}
        {...props}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </main>
  );
}
function OverviewLoader(props: ManagementOverviewProps & { readonly onRetry: () => void }) {
  const [state, setState] = useState<OverviewState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    void props.getManagementOverview
      .execute(props.currentDate)
      .then((snapshot) => {
        if (active) setState({ status: 'ready', snapshot });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [props.currentDate, props.getManagementOverview]);
  if (state.status === 'loading')
    return (
      <div className="overview-state" role="status" aria-busy="true">
        <AppIcon name="focus" />
        <h2>Загружаем обзор…</h2>
        <p>Собираем фокус, день и сигналы.</p>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="overview-state overview-error" role="alert">
        <h2>Не удалось загрузить обзор управления.</h2>
        <p>Попробуйте загрузить данные ещё раз.</p>
        <button type="button" className="secondary-button" onClick={props.onRetry}>
          Повторить загрузку
        </button>
      </div>
    );
  return <ManagementOverviewView {...props} snapshot={state.snapshot} />;
}
interface ManagementOverviewViewProps extends OverviewNavigation {
  readonly snapshot: ManagementOverviewSnapshot;
}
export function ManagementOverviewView(props: ManagementOverviewViewProps) {
  const { snapshot } = props;
  const signalsHeading = useRef<HTMLHeadingElement>(null);
  const focus = snapshot.focus;
  const chooseFocus = () => props.onOpenSection(MANAGEMENT_SECTION.directions);
  const openDay = () => props.onOpenSection(MANAGEMENT_SECTION.day);
  const openFocus = () => {
    if (focus.kind === 'project') props.onOpenProject(focus.id);
    else if (focus.kind === 'direction') props.onOpenDirection(focus.id);
    else chooseFocus();
  };
  const focusAction =
    focus.kind === 'empty'
      ? 'Определить фокус'
      : focus.kind === 'project'
        ? 'Открыть цель'
        : 'Открыть направление';
  const showSignals = () => {
    signalsHeading.current?.focus();
    signalsHeading.current?.scrollIntoView({ block: 'start' });
  };
  const openSignal = (signal: ManagementOverviewSignal) => {
    if (signal.decisionId !== null) props.onOpenDecision(signal.decisionId);
    else if (signal.projectId !== null) props.onOpenProject(signal.projectId);
    else if (signal.directionId !== null) props.onOpenDirection(signal.directionId);
    else chooseFocus();
  };
  return (
    <div className="overview-content">
      <section
        className="management-focus overview-focus"
        aria-labelledby="management-focus-heading"
      >
        <AppIcon className="overview-focus-icon" name="focus" />
        <div className="overview-focus-copy">
          <p className="section-page-eyebrow">Главное сейчас</p>
          <h2 id="management-focus-heading">
            {focus.kind === 'empty' ? 'Фокус не определён' : focus.title}
          </h2>
          <p>
            {focus.kind === 'empty'
              ? 'Выберите главную цель или направление, чтобы видеть их здесь'
              : focus.kind === 'project'
                ? 'Главная цель'
                : 'Главное направление'}
          </p>
          {focus.kind === 'project' && (focus.directionName || focus.desiredResult) ? (
            <p className="overview-focus-detail">
              {[focus.directionName, focus.desiredResult].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
        <div className="overview-focus-actions">
          <button className="primary-button" type="button" onClick={openFocus}>
            {focusAction}
            <AppIcon name="arrow-right" />
          </button>
          {focus.kind !== 'empty' ? (
            <button className="overview-text-action" type="button" onClick={chooseFocus}>
              Изменить фокус
            </button>
          ) : null}
        </div>
      </section>
      <div className="overview-summaries">
        <OverviewCard
          title="Сегодня"
          description="Текущий день"
          icon="today"
          actionLabel="Открыть день"
          onOpen={openDay}
        >
          <OverviewRow
            label="Главное решение"
            value={snapshot.today.mainDecision?.title ?? 'Не определено'}
          />
          <OverviewRow label="Решения" value={snapshot.today.decisionCount} />
          <OverviewRow label="Действия" value={snapshot.today.actionCount} />
          {snapshot.today.currentSession === null ? null : (
            <OverviewRow
              label={snapshot.today.currentSession.status === 'paused' ? 'На паузе' : 'Выполняется'}
              value={snapshot.today.currentSession.actionTitle ?? 'Действие не найдено'}
              onOpen={() => props.onOpenSection(MANAGEMENT_SECTION.actions)}
            />
          )}
        </OverviewCard>
        <OverviewCard title="Курс" description="Ваше долгосрочное движение" icon="statistics">
          <OverviewRow
            label="Активные направления"
            value={snapshot.course.activeDirectionCount}
            onOpen={() => props.onOpenSection(MANAGEMENT_SECTION.directions)}
          />
          <OverviewRow
            label="Активные цели"
            value={snapshot.course.activeProjectCount}
            onOpen={() => props.onOpenSection(MANAGEMENT_SECTION.goals)}
          />
        </OverviewCard>
        <OverviewCard
          title="Внимание"
          description="То, что требует решения"
          icon="actions"
          actionLabel="Смотреть сигналы"
          onOpen={showSignals}
        >
          <OverviewRow label="Всего сигналов" value={snapshot.signals.length} />
          <p className="overview-card-note">
            {snapshot.signals.length === 0
              ? 'Нет сигналов, требующих внимания'
              : 'Проверьте связи и уточните следующий шаг.'}
          </p>
        </OverviewCard>
        <OverviewCard title="Следующий шаг" description="Быстрый переход" icon="decisions">
          <button
            className="overview-next"
            type="button"
            onClick={focus.kind === 'empty' ? chooseFocus : openDay}
          >
            <AppIcon name={focus.kind === 'empty' ? 'focus' : 'today'} />
            <span>
              <strong>{focus.kind === 'empty' ? 'Определить фокус' : 'Открыть день'}</strong>
              <small>
                {focus.kind === 'empty'
                  ? 'Выберите, чему уделить главное внимание.'
                  : 'Перейдите к решениям и действиям на день.'}
              </small>
            </span>
            <AppIcon name="arrow-right" />
          </button>
        </OverviewCard>
      </div>
      <section className="overview-signals" aria-labelledby="overview-signals-heading">
        <header className="overview-signals-header">
          <AppIcon name="actions" />
          <div>
            <h2 id="overview-signals-heading" ref={signalsHeading} tabIndex={-1}>
              Сигналы внимания
            </h2>
            <p>То, что требует решения или уточнения</p>
          </div>
          <span className="overview-signal-count">Все сигналы: {snapshot.signals.length}</span>
        </header>
        {snapshot.signals.length === 0 ? (
          <p className="overview-empty" role="status">
            Нет сигналов, требующих внимания
          </p>
        ) : (
          <ul className="overview-signal-list">
            {snapshot.signals.map((signal) => (
              <li
                key={`${signal.kind}:${signal.decisionId ?? signal.projectId ?? signal.directionId ?? 'focus'}`}
              >
                <AppIcon
                  name={
                    signal.kind === 'focus_undefined'
                      ? 'focus'
                      : signal.decisionId !== null
                        ? 'decisions'
                        : signal.directionId !== null
                          ? 'management'
                          : 'goals'
                  }
                />
                <div className="overview-signal-copy">
                  <h3>
                    {signal.kind === 'active_project_without_decisions'
                      ? 'Активная цель без решений'
                      : signal.kind === 'inactive_main_project'
                        ? 'Неактивная цель назначена главной'
                        : signal.title}
                  </h3>
                  <p>{signal.detail}</p>
                  {signalExplanation(signal) ? (
                    <p className="overview-signal-explanation">{signalExplanation(signal)}</p>
                  ) : null}
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => openSignal(signal)}
                >
                  {signal.decisionId !== null
                    ? 'Открыть решение'
                    : signal.projectId !== null
                      ? 'Открыть цель'
                      : signal.directionId !== null
                        ? 'Открыть направление'
                        : 'Определить фокус'}
                  <AppIcon name="arrow-right" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
function signalExplanation(signal: ManagementOverviewSignal): string | null {
  switch (signal.kind) {
    case 'active_project_without_decisions':
      return 'Для цели пока не выбраны решения';
    case 'main_project_without_active_decisions':
      return 'Для главной цели нет активных решений';
    case 'decision_without_unfinished_actions':
      return 'Для решения нет незавершённых действий';
    case 'main_direction_without_active_projects':
      return 'В главном направлении нет активных целей';
    case 'inactive_main_project':
      return 'Проверьте состояние цели или измените фокус';
    case 'focus_undefined':
      return null;
  }
}
function OverviewCard(props: {
  readonly title: string;
  readonly description: string;
  readonly icon: AppIconName;
  readonly actionLabel?: string;
  readonly onOpen?: () => void;
  readonly children: ReactNode;
}) {
  return (
    <section className="overview-card" aria-label={props.title}>
      <header>
        <AppIcon name={props.icon} />
        <div>
          <h2>{props.title}</h2>
          <p>{props.description}</p>
        </div>
        {props.onOpen ? (
          <button
            className="overview-icon-action"
            type="button"
            aria-label={props.actionLabel}
            title={props.actionLabel}
            onClick={props.onOpen}
          >
            <AppIcon name="arrow-right" />
          </button>
        ) : null}
      </header>
      <div className="overview-card-body">{props.children}</div>
    </section>
  );
}
function OverviewRow(props: {
  readonly label: string;
  readonly value: string | number;
  readonly onOpen?: () => void;
}) {
  const content = (
    <>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </>
  );
  return props.onOpen ? (
    <button className="overview-row" type="button" onClick={props.onOpen}>
      {content}
    </button>
  ) : (
    <div className="overview-row">{content}</div>
  );
}
