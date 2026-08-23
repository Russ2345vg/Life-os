import { useEffect, useState, type ReactNode } from 'react';
import type { GetManagementOverview, ManagementOverviewSnapshot } from '../../application';
import type { DayDate } from '../../domain';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { MANAGEMENT_SECTION, type ManagementSection } from './ManagementSection';

interface ManagementOverviewProps {
  readonly getManagementOverview: Pick<GetManagementOverview, 'execute'>;
  readonly currentDate: DayDate;
  readonly onOpenSection: (section: ManagementSection) => void;
  readonly onOpenProject: (projectId: string) => void;
  readonly onOpenDirection: (directionId: string) => void;
  readonly onOpenDecision: (decisionId: string) => void;
}

type OverviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: ManagementOverviewSnapshot }
  | { readonly status: 'error' };

export function ManagementOverview(props: ManagementOverviewProps) {
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

  return (
    <main className="section-page management-overview">
      <SectionPageHeader
        eyebrow="Текущее состояние"
        title="Обзор управления"
        description="Фокус, день, курс и только достоверные сигналы."
      />

      {state.status === 'loading' ? (
        <p className="management-loading" role="status">
          Загружаем обзор…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="section-page-error" role="alert">
          Не удалось загрузить обзор управления.
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <ManagementOverviewView
          snapshot={state.snapshot}
          onOpenSection={props.onOpenSection}
          onOpenProject={props.onOpenProject}
          onOpenDirection={props.onOpenDirection}
          onOpenDecision={props.onOpenDecision}
        />
      ) : null}
    </main>
  );
}

interface ManagementOverviewViewProps {
  readonly snapshot: ManagementOverviewSnapshot;
  readonly onOpenSection: (section: ManagementSection) => void;
  readonly onOpenProject: (projectId: string) => void;
  readonly onOpenDirection: (directionId: string) => void;
  readonly onOpenDecision: (decisionId: string) => void;
}

export function ManagementOverviewView(props: ManagementOverviewViewProps) {
  const { snapshot } = props;
  return (
    <div className="management-overview-content">
      <section className="management-focus" aria-labelledby="management-focus-heading">
        <div>
          <p className="section-page-eyebrow">Главное сейчас</p>
          <h2 id="management-focus-heading">
            {snapshot.focus.kind === 'empty' ? 'Фокус не определён' : snapshot.focus.title}
          </h2>
          {snapshot.focus.kind === 'project' ? (
            <p>
              {[snapshot.focus.directionName, snapshot.focus.desiredResult]
                .filter((value): value is string => value !== null)
                .join(' · ') || 'Главный проект'}
            </p>
          ) : null}
          {snapshot.focus.kind === 'direction' ? <p>Главное направление</p> : null}
          {snapshot.focus.kind === 'empty' ? (
            <p>Назначьте главный проект или главное направление.</p>
          ) : null}
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            if (snapshot.focus.kind === 'project') props.onOpenProject(snapshot.focus.id);
            else if (snapshot.focus.kind === 'direction') props.onOpenDirection(snapshot.focus.id);
            else props.onOpenSection(MANAGEMENT_SECTION.directions);
          }}
        >
          {snapshot.focus.kind === 'empty' ? 'Определить' : 'Открыть'}
        </button>
      </section>

      <OverviewSection
        title="Сегодня"
        actionLabel="В День"
        onOpen={() => props.onOpenSection(MANAGEMENT_SECTION.day)}
      >
        <OverviewRow
          label="Главное решение"
          value={snapshot.today.mainDecision?.title ?? 'Не определено'}
        />
        <OverviewMetric label="Решения" value={snapshot.today.decisionCount} />
        <OverviewMetric label="Действия" value={snapshot.today.actionCount} />
        {snapshot.today.currentSession === null ? null : (
          <OverviewRow
            label="Текущая сессия"
            value={snapshot.today.currentSession.actionTitle ?? 'Действие не найдено'}
            detail={snapshot.today.currentSession.status === 'paused' ? 'На паузе' : 'Выполняется'}
            onOpen={() => props.onOpenSection(MANAGEMENT_SECTION.actions)}
          />
        )}
      </OverviewSection>

      <OverviewSection title="Курс">
        <OverviewMetric
          label="Активные направления"
          value={snapshot.course.activeDirectionCount}
          onOpen={() => props.onOpenSection(MANAGEMENT_SECTION.directions)}
        />
        <OverviewMetric
          label="Активные проекты"
          value={snapshot.course.activeProjectCount}
          onOpen={() => props.onOpenSection(MANAGEMENT_SECTION.projects)}
        />
      </OverviewSection>

      <OverviewSection title="Сигналы">
        {snapshot.signals.length === 0 ? (
          <p className="management-overview-empty management-signals-clear" role="status">
            Критичных сигналов нет
          </p>
        ) : (
          <ul className="management-signal-list">
            {snapshot.signals.map((signal) => (
              <li
                key={`${signal.kind}:${signal.decisionId ?? signal.projectId ?? signal.directionId ?? 'focus'}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (signal.decisionId !== null) props.onOpenDecision(signal.decisionId);
                    else if (signal.projectId !== null) props.onOpenProject(signal.projectId);
                    else if (signal.directionId !== null) {
                      props.onOpenDirection(signal.directionId);
                    } else props.onOpenSection(MANAGEMENT_SECTION.directions);
                  }}
                >
                  <span>
                    <strong>{signal.title}</strong>
                    <small>{signal.detail}</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </OverviewSection>
    </div>
  );
}

function OverviewSection(props: {
  readonly title: string;
  readonly actionLabel?: string;
  readonly onOpen?: () => void;
  readonly children: ReactNode;
}) {
  return (
    <section className="management-overview-section" aria-labelledby={`overview-${props.title}`}>
      <header>
        <h2 id={`overview-${props.title}`}>{props.title}</h2>
        {props.onOpen === undefined ? null : (
          <button className="text-button" type="button" onClick={props.onOpen}>
            {props.actionLabel ?? 'Открыть'}
          </button>
        )}
      </header>
      <div className="management-overview-rows">{props.children}</div>
    </section>
  );
}

function OverviewMetric(props: {
  readonly label: string;
  readonly value: number;
  readonly onOpen?: () => void;
}) {
  return (
    <OverviewRow
      label={props.label}
      value={String(props.value)}
      {...(props.onOpen === undefined ? {} : { onOpen: props.onOpen })}
    />
  );
}

function OverviewRow(props: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly onOpen?: () => void;
}) {
  const content = (
    <>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.detail === undefined ? null : <small>{props.detail}</small>}
    </>
  );
  return props.onOpen === undefined ? (
    <div className="management-overview-row">{content}</div>
  ) : (
    <button className="management-overview-row" type="button" onClick={props.onOpen}>
      {content}
    </button>
  );
}
