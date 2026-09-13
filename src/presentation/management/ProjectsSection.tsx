import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArchiveProject,
  CompleteProject,
  CreateProject,
  CreateDecisionForDate,
  GetDirections,
  GetProjects,
  GetProjectLifeActions,
  PROJECT_HISTORY_EVENT_KIND,
  GetSpheres,
  MakeProjectMain,
  PauseProject,
  RestoreProject,
  ResumeProject,
  type SpheresSnapshot,
  type ProjectHistoryEvent,
  type ProjectHistorySummary,
  UpdateProject,
} from '../../application';
import {
  EntityId,
  PROJECT_STATUS,
  type Direction,
  type DayDate,
  type Decision,
  type Project,
  type ProjectStatus,
  type Sphere,
  type LifeAction,
} from '../../domain';
import {
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_DESIRED_RESULT_LENGTH,
  MAX_PROJECT_TITLE_LENGTH,
} from '../../domain/project';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { DecisionCreationDialog } from '../pages/DecisionCreationForm';
import {
  createDecisionCreationForm,
  createEmptyDecisionCreationErrors,
  submitDecisionCreation,
  type DecisionCreationFormErrors,
  type DecisionCreationFormState,
} from '../pages/DecisionCreationFormState';
import { projectStatusLabel } from './projectPresentation';
import { createProjectReferenceLoader } from './projectReferenceLoader';
import { lifeActionStatusLabel } from '../entityPresentation';

export interface ProjectsSectionProps {
  readonly createProject: Pick<CreateProject, 'execute'>;
  readonly updateProject: Pick<UpdateProject, 'execute'>;
  readonly archiveProject: Pick<ArchiveProject, 'execute'>;
  readonly restoreProject: Pick<RestoreProject, 'execute'>;
  readonly completeProject: Pick<CompleteProject, 'execute'>;
  readonly pauseProject: Pick<PauseProject, 'execute'>;
  readonly resumeProject: Pick<ResumeProject, 'execute'>;
  readonly makeProjectMain: Pick<MakeProjectMain, 'execute'>;
  readonly getProjects: Pick<GetProjects, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly getProjectLifeActions: Pick<GetProjectLifeActions, 'execute'>;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
  readonly currentDate: DayDate;
  readonly selectedProjectId: string | null;
  readonly onOpenProject: (projectId: string) => void;
  readonly onOpenDirection: (directionId: string) => void;
  readonly onBack: () => void;
}

export interface ProjectDraft {
  readonly title: string;
  readonly description: string;
  readonly desiredResult: string;
  readonly directionId: string;
  readonly sphereId: string;
}

type ProjectFilter = 'all' | ProjectStatus;
type ProjectAction = 'main' | 'pause' | 'resume' | 'complete' | 'archive' | 'restore';

type ProjectState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly projects: readonly Project[];
      readonly directions: readonly Direction[];
      readonly spheres: SpheresSnapshot;
      readonly decisions: readonly Decision[];
      readonly lifeActions: readonly LifeAction[];
      readonly history: readonly ProjectHistoryEvent[];
      readonly summary: ProjectHistorySummary;
    }
  | { readonly status: 'error' };

const EMPTY_DRAFT: ProjectDraft = {
  title: '',
  description: '',
  desiredResult: '',
  directionId: '',
  sphereId: '',
};

const EMPTY_PROJECT_SUMMARY: ProjectHistorySummary = {
  decisionCount: 0,
  completedLifeActionCount: 0,
  completedActionSessionCount: 0,
  totalActionDurationMs: 0,
};

const FILTERS: readonly { readonly value: ProjectFilter; readonly label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: PROJECT_STATUS.active, label: 'Активные' },
  { value: PROJECT_STATUS.paused, label: 'Приостановленные' },
  { value: PROJECT_STATUS.completed, label: 'Завершённые' },
  { value: PROJECT_STATUS.archived, label: 'Архив' },
];

export function ProjectsSection(props: ProjectsSectionProps) {
  const [state, setState] = useState<ProjectState>({ status: 'loading' });
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [editing, setEditing] = useState<Project | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisionFormOpen, setDecisionFormOpen] = useState(false);
  const [decisionForm, setDecisionForm] = useState<DecisionCreationFormState>(() =>
    createDecisionCreationForm(props.currentDate),
  );
  const [decisionErrors, setDecisionErrors] = useState<DecisionCreationFormErrors>(
    createEmptyDecisionCreationErrors,
  );
  const [decisionSaving, setDecisionSaving] = useState(false);
  const referenceLoader = useMemo(
    () =>
      createProjectReferenceLoader({
        getProjects: props.getProjects,
        getDirections: props.getDirections,
        getSpheres: props.getSpheres,
      }),
    [props.getDirections, props.getProjects, props.getSpheres],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      const [references, linkedWork] = await Promise.all([
        referenceLoader.refresh(),
        props.selectedProjectId === null
          ? Promise.resolve({
              decisions: [],
              lifeActions: [],
              history: [],
              summary: EMPTY_PROJECT_SUMMARY,
            })
          : props.getProjectLifeActions.execute(EntityId.create(props.selectedProjectId)),
      ]);
      setState({
        status: 'ready',
        ...references,
        decisions: linkedWork.decisions,
        lifeActions: linkedWork.lifeActions,
        history: linkedWork.history,
        summary: linkedWork.summary,
      });
    } catch {
      setState({ status: 'error' });
    }
  }, [props.getProjectLifeActions, props.selectedProjectId, referenceLoader]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      referenceLoader.load(),
      props.selectedProjectId === null
        ? Promise.resolve({
            decisions: [],
            lifeActions: [],
            history: [],
            summary: EMPTY_PROJECT_SUMMARY,
          })
        : props.getProjectLifeActions.execute(EntityId.create(props.selectedProjectId)),
    ])
      .then(([references, linkedWork]) => {
        if (active) {
          setState({
            status: 'ready',
            ...references,
            decisions: linkedWork.decisions,
            lifeActions: linkedWork.lifeActions,
            history: linkedWork.history,
            summary: linkedWork.summary,
          });
        }
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [props.getProjectLifeActions, props.selectedProjectId, referenceLoader]);

  useEffect(() => {
    if (!formOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !saving) setFormOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [formOpen, saving]);

  const selectedProject =
    state.status === 'ready' && props.selectedProjectId !== null
      ? (state.projects.find((project) => project.id.toString() === props.selectedProjectId) ??
        null)
      : null;

  function openCreate(): void {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
    setMessage(null);
    setError(null);
  }

  function openEdit(project: Project): void {
    setEditing(project);
    setDraft({
      title: project.title,
      description: project.description ?? '',
      desiredResult: project.desiredResult ?? '',
      directionId: project.directionId?.toString() ?? '',
      sphereId: project.sphereId?.toString() ?? '',
    });
    setFormOpen(true);
    setMessage(null);
    setError(null);
  }

  function openDecisionCreate(project: Project): void {
    setDecisionForm(
      createDecisionCreationForm(props.currentDate, {
        projectId: project.id.toString(),
        sphereId: project.sphereId?.toString() ?? '',
      }),
    );
    setDecisionErrors(createEmptyDecisionCreationErrors());
    setDecisionFormOpen(true);
  }

  async function saveDecision(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (decisionSaving || state.status !== 'ready') return;
    setDecisionSaving(true);
    setDecisionErrors(createEmptyDecisionCreationErrors());
    try {
      const result = await submitDecisionCreation({
        form: decisionForm,
        currentDate: props.currentDate,
        createDecisionForDate: props.createDecisionForDate,
        projects: state.projects,
      });
      if (!result.ok) {
        setDecisionErrors(result.errors);
        return;
      }
      setDecisionFormOpen(false);
      setMessage('Решение создано и связано с целью.');
      await load();
    } catch {
      setDecisionErrors({
        ...createEmptyDecisionCreationErrors(),
        form: 'Не удалось создать решение',
      });
    } finally {
      setDecisionSaving(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const details = {
        title: draft.title,
        description: draft.description,
        desiredResult: draft.desiredResult,
        directionId: draft.directionId === '' ? null : EntityId.create(draft.directionId),
        sphereId: draft.sphereId === '' ? null : EntityId.create(draft.sphereId),
      };
      const wasCreating = editing === null;
      const result = wasCreating
        ? await props.createProject.execute(details)
        : await props.updateProject.execute({
            ...details,
            id: editing.id,
            expectedVersion: editing.version,
          });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setFormOpen(false);
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      setMessage(wasCreating ? 'Цель создана.' : 'Цель обновлена.');
      await load();
      if (wasCreating) props.onOpenProject(result.value.id.toString());
    } catch {
      setError('Не удалось сохранить цель. Повторите попытку.');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(project: Project, action: ProjectAction): Promise<void> {
    if (busyId !== null) return;
    if (
      (action === 'complete' &&
        !window.confirm('Завершить цель? Она останется в истории и перестанет быть главной.')) ||
      (action === 'archive' &&
        !window.confirm('Архивировать цель? Его можно будет восстановить из архива.'))
    ) {
      return;
    }
    setBusyId(project.id.toString());
    setMessage(null);
    setError(null);
    try {
      const input = { id: project.id, expectedVersion: project.version };
      const result =
        action === 'main'
          ? await props.makeProjectMain.execute(input)
          : action === 'pause'
            ? await props.pauseProject.execute(input)
            : action === 'resume'
              ? await props.resumeProject.execute(input)
              : action === 'complete'
                ? await props.completeProject.execute(input)
                : action === 'archive'
                  ? await props.archiveProject.execute(input)
                  : await props.restoreProject.execute(input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMessage(actionMessage(action));
      await load();
    } catch {
      setError('Не удалось изменить цель. Повторите попытку.');
    } finally {
      setBusyId(null);
    }
  }

  if (props.selectedProjectId !== null) {
    return (
      <main className="section-page project-detail-page">
        {state.status === 'loading' ? <p role="status">Загружаем цель…</p> : null}
        {state.status === 'error' || (state.status === 'ready' && selectedProject === null) ? (
          <ProjectLoadError onBack={props.onBack} onRetry={() => void load()} />
        ) : null}
        {state.status === 'ready' && selectedProject !== null ? (
          <ProjectDetails
            project={selectedProject}
            direction={findDirection(state.directions, selectedProject.directionId)}
            sphere={findSphere(state.spheres, selectedProject.sphereId)}
            busy={busyId === selectedProject.id.toString()}
            message={message}
            error={error}
            decisions={state.decisions}
            lifeActions={state.lifeActions}
            history={state.history}
            summary={state.summary}
            onBack={props.onBack}
            onOpenDirection={props.onOpenDirection}
            onEdit={openEdit}
            onCreateDecision={() => openDecisionCreate(selectedProject)}
            onAction={(action) => void runAction(selectedProject, action)}
          />
        ) : null}
        {formOpen && state.status === 'ready' ? (
          <ProjectFormDialog
            mode="edit"
            draft={draft}
            directions={state.directions}
            spheres={state.spheres}
            saving={saving}
            error={error}
            onChange={setDraft}
            onCancel={() => setFormOpen(false)}
            onSubmit={save}
          />
        ) : null}
        {decisionFormOpen && state.status === 'ready' ? (
          <DecisionCreationDialog
            currentDate={props.currentDate}
            form={decisionForm}
            errors={decisionErrors}
            isSaving={decisionSaving}
            spheres={state.spheres}
            projects={state.projects}
            lockedProjectId={props.selectedProjectId}
            onChange={(form) => {
              setDecisionForm(form);
              setDecisionErrors(createEmptyDecisionCreationErrors());
            }}
            onClose={() => setDecisionFormOpen(false)}
            onSubmit={(event) => void saveDecision(event)}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className="section-page projects-page">
      <SectionPageHeader
        eyebrow="Управление · Курс"
        title="Цели"
        description="Ограниченная работа с конкретным завершённым результатом."
        action={
          <button className="primary-button" type="button" onClick={openCreate}>
            + Новая цель
          </button>
        }
      />

      <div className="project-filters" role="group" aria-label="Фильтр целей">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {message !== null ? <p className="section-page-message">{message}</p> : null}
      {error !== null ? (
        <p className="section-page-error" role="alert">
          {error}
        </p>
      ) : null}
      {state.status === 'loading' ? <p role="status">Загружаем цели…</p> : null}
      {state.status === 'error' ? (
        <div className="section-page-error" role="alert">
          <p>Не удалось загрузить цели.</p>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <ProjectGroups
          projects={state.projects}
          filter={filter}
          directions={state.directions}
          spheres={state.spheres}
          busyId={busyId}
          onCreate={openCreate}
          onOpen={props.onOpenProject}
          onEdit={openEdit}
          onAction={(project, action) => void runAction(project, action)}
        />
      ) : null}

      {formOpen && state.status === 'ready' ? (
        <ProjectFormDialog
          mode={editing === null ? 'create' : 'edit'}
          draft={draft}
          directions={state.directions}
          spheres={state.spheres}
          saving={saving}
          error={error}
          onChange={setDraft}
          onCancel={() => setFormOpen(false)}
          onSubmit={save}
        />
      ) : null}
    </main>
  );
}

function ProjectGroups(props: {
  readonly projects: readonly Project[];
  readonly filter: ProjectFilter;
  readonly directions: readonly Direction[];
  readonly spheres: SpheresSnapshot;
  readonly busyId: string | null;
  readonly onCreate: () => void;
  readonly onOpen: (id: string) => void;
  readonly onEdit: (project: Project) => void;
  readonly onAction: (project: Project, action: ProjectAction) => void;
}) {
  if (props.projects.length === 0) return <EmptyProjects onCreate={props.onCreate} />;
  const groups = buildGroups(props.projects, props.filter);
  if (groups.length === 0) {
    return <p className="project-filter-empty">В этой категории пока нет целей.</p>;
  }
  return (
    <div className="project-groups">
      {groups.map((group) => (
        <section key={group.title} className="project-group" aria-label={group.title}>
          <div className="management-list-heading">
            <h2>{group.title}</h2>
            <span>{group.projects.length}</span>
          </div>
          <div className="project-card-grid">
            {group.projects.map((project) => (
              <ProjectCard
                key={project.id.toString()}
                project={project}
                direction={findDirection(props.directions, project.directionId)}
                sphere={findSphere(props.spheres, project.sphereId)}
                busy={props.busyId === project.id.toString()}
                onOpen={props.onOpen}
                onEdit={props.onEdit}
                onAction={props.onAction}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ProjectCard(props: {
  readonly project: Project;
  readonly direction: Direction | null;
  readonly sphere: Sphere | null;
  readonly busy: boolean;
  readonly onOpen: (id: string) => void;
  readonly onEdit: (project: Project) => void;
  readonly onAction: (project: Project, action: ProjectAction) => void;
}) {
  return (
    <article className={`project-card${props.project.isMain ? ' project-card-main' : ''}`}>
      <button
        className="project-card-open"
        type="button"
        onClick={() => props.onOpen(props.project.id.toString())}
      >
        <span className="project-card-heading">
          <strong>{props.project.title}</strong>
          {props.project.isMain ? (
            <span className="project-card-star" aria-label="Главная цель">
              ★
            </span>
          ) : null}
        </span>
        {props.project.desiredResult === null ? null : (
          <span className="project-card-result">{props.project.desiredResult}</span>
        )}
        <span className="project-card-meta">
          {props.direction === null ? null : <span>{props.direction.name}</span>}
          {props.sphere === null ? null : <span>{props.sphere.name}</span>}
          <span>{projectStatusLabel(props.project.status)}</span>
        </span>
        <span className="project-card-arrow" aria-hidden="true">
          →
        </span>
      </button>
      <ProjectMenu
        project={props.project}
        busy={props.busy}
        onEdit={props.onEdit}
        onAction={props.onAction}
      />
    </article>
  );
}

function ProjectMenu(props: {
  readonly project: Project;
  readonly busy: boolean;
  readonly onEdit: (project: Project) => void;
  readonly onAction: (project: Project, action: ProjectAction) => void;
}) {
  const project = props.project;
  return (
    <details className="project-card-menu">
      <summary aria-label={`Действия: ${project.title}`}>•••</summary>
      <div className="project-card-menu-popover">
        {project.status === PROJECT_STATUS.active && !project.isMain ? (
          <MenuButton disabled={props.busy} onClick={() => props.onAction(project, 'main')}>
            Сделать главным
          </MenuButton>
        ) : null}
        {project.status !== PROJECT_STATUS.archived ? (
          <MenuButton disabled={props.busy} onClick={() => props.onEdit(project)}>
            Редактировать
          </MenuButton>
        ) : null}
        {project.status === PROJECT_STATUS.active ? (
          <MenuButton disabled={props.busy} onClick={() => props.onAction(project, 'pause')}>
            Приостановить
          </MenuButton>
        ) : null}
        {project.status === PROJECT_STATUS.paused ? (
          <MenuButton disabled={props.busy} onClick={() => props.onAction(project, 'resume')}>
            Возобновить
          </MenuButton>
        ) : null}
        {project.status === PROJECT_STATUS.active || project.status === PROJECT_STATUS.paused ? (
          <MenuButton disabled={props.busy} onClick={() => props.onAction(project, 'complete')}>
            Завершить цель
          </MenuButton>
        ) : null}
        {project.status === PROJECT_STATUS.archived ? (
          <MenuButton disabled={props.busy} onClick={() => props.onAction(project, 'restore')}>
            Восстановить
          </MenuButton>
        ) : (
          <MenuButton disabled={props.busy} onClick={() => props.onAction(project, 'archive')}>
            Архивировать
          </MenuButton>
        )}
      </div>
    </details>
  );
}

function MenuButton(props: {
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button type="button" disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

export function ProjectDetails(props: {
  readonly project: Project;
  readonly direction: Direction | null;
  readonly sphere: Sphere | null;
  readonly busy: boolean;
  readonly message: string | null;
  readonly error: string | null;
  readonly decisions?: readonly Decision[];
  readonly lifeActions?: readonly LifeAction[];
  readonly history?: readonly ProjectHistoryEvent[];
  readonly summary?: ProjectHistorySummary;
  readonly onBack: () => void;
  readonly onOpenDirection: (directionId: string) => void;
  readonly onEdit: (project: Project) => void;
  readonly onCreateDecision?: () => void;
  readonly onAction: (action: ProjectAction) => void;
}) {
  const direction = props.direction;
  const summary = props.summary ?? EMPTY_PROJECT_SUMMARY;
  return (
    <>
      <button className="project-back" type="button" onClick={props.onBack}>
        ← Назад
      </button>
      <header className="project-detail-header">
        <div>
          <p className="section-page-eyebrow">Управление · Цель</p>
          <h1>{props.project.title}</h1>
          <div className="project-detail-badges">
            {props.project.isMain ? (
              <span className="project-main-badge">★ Главная цель</span>
            ) : null}
            <span className="management-status">{projectStatusLabel(props.project.status)}</span>
          </div>
        </div>
        <div className="section-header-actions">
          {props.project.status === PROJECT_STATUS.active ||
          props.project.status === PROJECT_STATUS.paused ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => props.onCreateDecision?.()}
            >
              + Решение
            </button>
          ) : null}
          <ProjectMenu
            project={props.project}
            busy={props.busy}
            onEdit={props.onEdit}
            onAction={(_, action) => props.onAction(action)}
          />
        </div>
      </header>

      {props.message !== null ? <p className="section-page-message">{props.message}</p> : null}
      {props.error !== null ? (
        <p className="section-page-error" role="alert">
          {props.error}
        </p>
      ) : null}

      <div className="project-detail-layout">
        <div className="project-detail-main">
          <DetailBlock title="Результат" prominent>
            <p>{props.project.desiredResult ?? 'Результат пока не сформулирован.'}</p>
          </DetailBlock>
          <DetailBlock title="Описание">
            <p>{props.project.description ?? 'Описание пока не добавлено.'}</p>
          </DetailBlock>
          <ProjectActivity
            decisions={props.decisions}
            lifeActions={props.lifeActions}
            history={props.history}
            summary={summary}
          />
        </div>
        <aside className="project-detail-context" aria-label="Контекст цели">
          <div>
            <span>Направление</span>
            {direction === null ? (
              <strong>Не указано</strong>
            ) : (
              <button type="button" onClick={() => props.onOpenDirection(direction.id.toString())}>
                {direction.name} →
              </button>
            )}
          </div>
          <div>
            <span>Сфера</span>
            <strong>{props.sphere?.name ?? 'Не указана'}</strong>
          </div>
          <div>
            <span>Статус</span>
            <strong>{projectStatusLabel(props.project.status)}</strong>
          </div>
        </aside>
      </div>
    </>
  );
}

export function ProjectActivity(props: {
  readonly decisions?: readonly Decision[] | undefined;
  readonly lifeActions?: readonly LifeAction[] | undefined;
  readonly history?: readonly ProjectHistoryEvent[] | undefined;
  readonly summary?: ProjectHistorySummary | undefined;
}) {
  const summary = props.summary ?? EMPTY_PROJECT_SUMMARY;
  return (
    <>
      {' '}
      <DetailBlock title="Решения">
        {(props.decisions ?? []).filter((decision) => !decision.isDeleted()).length === 0 ? (
          <p>Связанных решений пока нет.</p>
        ) : (
          <ul className="project-decision-list">
            {(props.decisions ?? [])
              .filter((decision) => !decision.isDeleted())
              .map((decision) => (
                <li key={decision.id.toString()}>
                  <strong>{decision.title.toString()}</strong>
                  <span>{decision.plannedDate?.toString() ?? 'Без даты'}</span>
                </li>
              ))}
          </ul>
        )}
      </DetailBlock>
      <DetailBlock title="Действия">
        {(props.lifeActions ?? []).length === 0 ? (
          <p>У решений цели пока нет действий.</p>
        ) : (
          <ul className="project-decision-list">
            {(props.lifeActions ?? []).map((lifeAction) => (
              <li key={lifeAction.id.toString()}>
                <strong>{lifeAction.title.toString()}</strong>
                <span>
                  {lifeActionStatusLabel(lifeAction.status)} ·{' '}
                  {lifeAction.plannedDate?.toString() ?? 'Без даты'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailBlock>
      <DetailBlock title="Итог цели">
        <dl className="project-summary">
          <ProjectSummaryItem label="Решений" value={summary.decisionCount.toString()} />
          <ProjectSummaryItem
            label="Выполненных действий"
            value={summary.completedLifeActionCount.toString()}
          />
          <ProjectSummaryItem
            label="Завершённых сессий"
            value={summary.completedActionSessionCount.toString()}
          />
          <ProjectSummaryItem
            label="Время действия"
            value={formatActionDuration(summary.totalActionDurationMs)}
          />
        </dl>
      </DetailBlock>
      <DetailBlock title="История">
        {(props.history ?? []).length === 0 ? (
          <p>Событий цели пока нет.</p>
        ) : (
          <ol className="project-history-list">
            {(props.history ?? []).map((event) => (
              <li key={event.id}>
                <time dateTime={event.occurredAt.toISOString()}>
                  {formatHistoryDate(event.occurredAt)}
                </time>
                <span>
                  <strong>{projectHistoryEventLabel(event)}</strong>
                  <small>{event.subjectTitle}</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </DetailBlock>
    </>
  );
}

function ProjectSummaryItem(props: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

function projectHistoryEventLabel(event: ProjectHistoryEvent): string {
  switch (event.kind) {
    case PROJECT_HISTORY_EVENT_KIND.projectCreated:
      return 'Создана цель';
    case PROJECT_HISTORY_EVENT_KIND.decisionCreated:
      return 'Создано решение';
    case PROJECT_HISTORY_EVENT_KIND.lifeActionCompleted:
      return 'Выполнено действие';
    case PROJECT_HISTORY_EVENT_KIND.actionSessionCompleted:
      return 'Завершена сессия действия';
    case PROJECT_HISTORY_EVENT_KIND.decisionConfirmed:
      return 'Подтверждено решение';
    case PROJECT_HISTORY_EVENT_KIND.projectStatusChanged:
      return `Изменён статус цели: ${projectStatusLabel(
        event.projectStatus ?? PROJECT_STATUS.active,
      )}`;
  }
}

function formatHistoryDate(value: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function formatActionDuration(durationMs: number): string {
  const totalMinutes = Math.floor(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

function DetailBlock(props: {
  readonly title: string;
  readonly prominent?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className={`project-detail-block${props.prominent ? ' is-prominent' : ''}`}>
      <p className="section-page-eyebrow">{props.title}</p>
      {props.children}
    </section>
  );
}

function ProjectLoadError(props: { readonly onBack: () => void; readonly onRetry: () => void }) {
  return (
    <div className="section-page-error" role="alert">
      <p>Не удалось открыть цель. Возможно, она больше недоступна.</p>
      <div className="management-form-actions">
        <button className="secondary-button" type="button" onClick={props.onBack}>
          Назад
        </button>
        <button className="secondary-button" type="button" onClick={props.onRetry}>
          Повторить
        </button>
      </div>
    </div>
  );
}

function ProjectFormDialog(props: ProjectFormProps) {
  return (
    <div className="management-dialog-backdrop" role="presentation">
      <div
        className="management-dialog premium-form-dialog project-form-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-form-title"
      >
        <button
          className="management-dialog-close"
          type="button"
          aria-label="Закрыть форму цели"
          disabled={props.saving}
          onClick={props.onCancel}
        >
          ×
        </button>
        <ProjectForm {...props} />
      </div>
    </div>
  );
}

interface ProjectFormProps {
  readonly mode: 'create' | 'edit';
  readonly draft: ProjectDraft;
  readonly directions: readonly Direction[];
  readonly spheres: SpheresSnapshot;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onChange: (draft: ProjectDraft) => void;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ProjectForm(props: ProjectFormProps) {
  const selectedDirection = props.directions.find(
    (direction) => direction.id.toString() === props.draft.directionId,
  );
  const hasConflict =
    selectedDirection !== undefined &&
    (selectedDirection.sphereId === null
      ? props.draft.sphereId !== ''
      : selectedDirection.sphereId.toString() !== props.draft.sphereId);
  return (
    <form
      className="management-entity-form project-form premium-form-content"
      onSubmit={props.onSubmit}
    >
      <div className="management-form-heading premium-form-heading">
        <div>
          <p className="section-page-eyebrow premium-form-eyebrow">
            {props.mode === 'create' ? 'Новая цель' : 'Редактирование'}
          </p>
          <h2 id="project-form-title">
            {props.mode === 'create' ? 'Создать цель' : 'Изменить цель'}
          </h2>
          <p className="premium-form-intro">
            Сформулируйте конкретный результат и привяжите цель к нужному контексту.
          </p>
        </div>
      </div>
      <div className="management-form-grid premium-form-grid">
        <VoiceField className="management-field management-field-wide" htmlFor="project-title">
          <span>Название</span>
          <VoiceTextInput
            id="project-title"
            required
            autoFocus
            maxLength={MAX_PROJECT_TITLE_LENGTH}
            value={props.draft.title}
            onValueChange={(value) => props.onChange({ ...props.draft, title: value })}
          />
        </VoiceField>
        <label className="management-field" htmlFor="project-direction">
          <span>
            Направление <small>необязательно</small>
          </span>
          <select
            id="project-direction"
            value={props.draft.directionId}
            onChange={(event) => {
              const directionId = event.currentTarget.value;
              const direction = props.directions.find((item) => item.id.toString() === directionId);
              props.onChange({
                ...props.draft,
                directionId,
                sphereId: direction?.sphereId?.toString() ?? props.draft.sphereId,
              });
            }}
          >
            <option value="">Без направления</option>
            {props.directions
              .filter((direction) => direction.status !== 'archived')
              .map((direction) => (
                <option key={direction.id.toString()} value={direction.id.toString()}>
                  {direction.name}
                </option>
              ))}
          </select>
        </label>
        <label className="management-field" htmlFor="project-sphere">
          <span>
            Сфера <small>необязательно</small>
          </span>
          <select
            id="project-sphere"
            value={props.draft.sphereId}
            onChange={(event) =>
              props.onChange({ ...props.draft, sphereId: event.currentTarget.value })
            }
          >
            <option value="">Без сферы</option>
            {props.spheres.active.map((sphere) => (
              <option key={sphere.id.toString()} value={sphere.id.toString()}>
                {sphere.name}
              </option>
            ))}
          </select>
        </label>
        {hasConflict ? (
          <p className="form-error management-field-wide" role="alert">
            Выбранное направление не принадлежит выбранной сфере. Измените одно из значений.
          </p>
        ) : null}
        <VoiceField
          className="management-field management-field-wide"
          htmlFor="project-desired-result"
        >
          <span>
            Желаемый результат <small>необязательно</small>
          </span>
          <VoiceTextArea
            id="project-desired-result"
            rows={3}
            maxLength={MAX_PROJECT_DESIRED_RESULT_LENGTH}
            value={props.draft.desiredResult}
            onValueChange={(value) => props.onChange({ ...props.draft, desiredResult: value })}
          />
        </VoiceField>
        <VoiceField
          className="management-field management-field-wide"
          htmlFor="project-description"
        >
          <span>
            Описание <small>необязательно</small>
          </span>
          <VoiceTextArea
            id="project-description"
            rows={4}
            maxLength={MAX_PROJECT_DESCRIPTION_LENGTH}
            value={props.draft.description}
            onValueChange={(value) => props.onChange({ ...props.draft, description: value })}
          />
        </VoiceField>
      </div>
      {props.error !== null ? (
        <p className="form-error" role="alert">
          {props.error}
        </p>
      ) : null}
      <div className="management-form-actions premium-form-actions">
        <button className="primary-button" type="submit" disabled={props.saving || hasConflict}>
          {props.saving
            ? 'Сохраняем…'
            : props.mode === 'create'
              ? 'Создать цель'
              : 'Сохранить изменения'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={props.saving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

export function EmptyProjects({ onCreate }: { readonly onCreate: () => void }) {
  return (
    <div className="management-empty-state project-empty-state">
      <div>
        <strong>Пока нет целей</strong>
        <p>Цель превращает направление в конкретный завершённый результат.</p>
      </div>
      <button className="secondary-button" type="button" onClick={onCreate}>
        Создать цель
      </button>
    </div>
  );
}

function buildGroups(
  projects: readonly Project[],
  filter: ProjectFilter,
): readonly { readonly title: string; readonly projects: readonly Project[] }[] {
  if (filter !== 'all') {
    const filtered = projects.filter((project) => project.status === filter);
    const title =
      FILTERS.find((item) => item.value === filter)?.label.toLocaleUpperCase('ru-RU') ?? '';
    return filtered.length === 0 ? [] : [{ title, projects: filtered }];
  }
  const main = projects.filter(
    (project) => project.isMain && project.status === PROJECT_STATUS.active,
  );
  const definitions: readonly { readonly title: string; readonly status: ProjectStatus }[] = [
    { title: 'АКТИВНЫЕ', status: PROJECT_STATUS.active },
    { title: 'ПРИОСТАНОВЛЕННЫЕ', status: PROJECT_STATUS.paused },
    { title: 'ЗАВЕРШЁННЫЕ', status: PROJECT_STATUS.completed },
    { title: 'АРХИВ', status: PROJECT_STATUS.archived },
  ];
  return [
    ...(main.length === 0 ? [] : [{ title: 'ГЛАВНЫЙ Цель', projects: main }]),
    ...definitions.flatMap((definition) => {
      const matching = projects.filter(
        (project) => project.status === definition.status && !project.isMain,
      );
      return matching.length === 0 ? [] : [{ title: definition.title, projects: matching }];
    }),
  ];
}

function findDirection(directions: readonly Direction[], id: EntityId | null): Direction | null {
  if (id === null) return null;
  return directions.find((direction) => direction.id.equals(id)) ?? null;
}

function findSphere(snapshot: SpheresSnapshot, id: EntityId | null): Sphere | null {
  if (id === null) return null;
  return [...snapshot.active, ...snapshot.archived].find((sphere) => sphere.id.equals(id)) ?? null;
}

function actionMessage(action: ProjectAction): string {
  switch (action) {
    case 'main':
      return 'Главная цель изменён.';
    case 'pause':
      return 'Цель приостановлен.';
    case 'resume':
      return 'Цель возобновлён.';
    case 'complete':
      return 'Цель завершён.';
    case 'archive':
      return 'Цель перемещён в архив.';
    case 'restore':
      return 'Цель восстановлен активным.';
  }
}
