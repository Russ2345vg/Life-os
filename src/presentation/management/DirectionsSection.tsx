import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type {
  ArchiveDirection,
  CreateDirection,
  CreateProject,
  DirectionBasePeriodDays,
  DirectionDetailsSnapshot,
  DirectionOverviewItem,
  GetDirectionDetails,
  GetDirectionsOverview,
  GetSpheres,
  MakeDirectionMain,
  MakeProjectMain,
  RestoreDirection,
  SpheresSnapshot,
  UpdateDirection,
  ApplyDirectionStrategicReview,
  ApplyDirectionStrategicReviewResult,
  StrategicReviewProjectStatus,
} from '../../application';
import {
  DIRECTION_STATUS,
  PROJECT_STATUS,
  EntityId,
  type Direction,
  type Sphere,
} from '../../domain';
import {
  MAX_DIRECTION_DESCRIPTION_LENGTH,
  MAX_DIRECTION_NAME_LENGTH,
  MAX_DIRECTION_STRATEGIC_TEXT_LENGTH,
} from '../../domain/direction';
import { MAX_PROJECT_DESIRED_RESULT_LENGTH, MAX_PROJECT_TITLE_LENGTH } from '../../domain/project';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { AppIcon } from '../components/AppIcon';
import { DirectionSphereIcon } from './DirectionSphereIcon';
import { projectStatusLabel } from './projectPresentation';
import '../styles/directions-compact.css';

export interface DirectionsSectionProps {
  readonly createDirection: Pick<CreateDirection, 'execute'>;
  readonly updateDirection: Pick<UpdateDirection, 'execute'>;
  readonly archiveDirection: Pick<ArchiveDirection, 'execute'>;
  readonly restoreDirection: Pick<RestoreDirection, 'execute'>;
  readonly makeDirectionMain: Pick<MakeDirectionMain, 'execute'>;
  readonly makeProjectMain: Pick<MakeProjectMain, 'execute'>;
  readonly createProject: Pick<CreateProject, 'execute'>;
  readonly getDirectionsOverview: Pick<GetDirectionsOverview, 'execute'>;
  readonly getDirectionDetails: Pick<GetDirectionDetails, 'execute'>;
  readonly applyDirectionStrategicReview: Pick<ApplyDirectionStrategicReview, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly initialSelectedDirectionId?: string | null;
  readonly onBackFromInitialDetail?: (() => void) | undefined;
  readonly onOpenProject: (projectId: string, directionId: string) => void;
}

interface DirectionDraft {
  readonly name: string;
  readonly description: string;
  readonly strategicIntent: string;
  readonly desiredState: string;
  readonly inScope: string;
  readonly outOfScope: string;
  readonly sphereId: string;
}

interface ProjectDraft {
  readonly title: string;
  readonly desiredResult: string;
  readonly makeMain: boolean;
}

interface StrategicReviewDraft {
  readonly remainsRelevant: boolean;
  readonly strategicIntent: string;
  readonly desiredState: string;
  readonly mainProjectId: string;
  readonly projectStatuses: Readonly<Record<string, StrategicReviewProjectStatus>>;
  readonly createProject: boolean;
  readonly newProjectTitle: string;
  readonly newProjectDesiredResult: string;
  readonly newProjectIsMain: boolean;
}

type StrategicReviewState =
  | { readonly status: 'closed' }
  | { readonly status: 'questions'; readonly draft: StrategicReviewDraft }
  | { readonly status: 'summary'; readonly draft: StrategicReviewDraft }
  | { readonly status: 'complete'; readonly result: ApplyDirectionStrategicReviewResult };

type DirectionState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly overview: readonly DirectionOverviewItem[];
      readonly spheres: SpheresSnapshot;
    }
  | { readonly status: 'error' };

type DetailState =
  | { readonly status: 'idle' | 'loading' | 'error' }
  | { readonly status: 'ready'; readonly snapshot: DirectionDetailsSnapshot };

const EMPTY_DRAFT: DirectionDraft = {
  name: '',
  description: '',
  strategicIntent: '',
  desiredState: '',
  inScope: '',
  outOfScope: '',
  sphereId: '',
};
const EMPTY_PROJECT_DRAFT: ProjectDraft = { title: '', desiredResult: '', makeMain: false };

export function DirectionsSection(props: DirectionsSectionProps) {
  const [state, setState] = useState<DirectionState>({ status: 'loading' });
  const [detail, setDetail] = useState<DetailState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(
    props.initialSelectedDirectionId ?? null,
  );
  const [editing, setEditing] = useState<Direction | null>(null);
  const [draft, setDraft] = useState<DirectionDraft>(EMPTY_DRAFT);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(EMPTY_PROJECT_DRAFT);
  const [directionPeriodDays, setDirectionPeriodDays] = useState<DirectionBasePeriodDays>(7);
  const [formOpen, setFormOpen] = useState(false);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<StrategicReviewState>({ status: 'closed' });
  const [choosingMain, setChoosingMain] = useState(false);
  const [mainChoice, setMainChoice] = useState('');
  const catalog = useRef<HTMLElement>(null);
  const chooseMainButton = useRef<HTMLButtonElement>(null);
  const archiveButton = useRef<HTMLButtonElement>(null);
  const focusAfterLoad = useRef<string | null>(null);
  const lastOpenedDirection = useRef<string | null>(null);
  const pendingDetailFocus = useRef<string | null>(selectedId);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [overview, spheres] = await Promise.all([
        props.getDirectionsOverview.execute(),
        props.getSpheres.execute(),
      ]);
      setState({ status: 'ready', overview, spheres });
    } catch {
      setState({ status: 'error' });
    }
  }, [props.getDirectionsOverview, props.getSpheres]);

  const loadDetail = useCallback(
    async (id: string): Promise<void> => {
      setDetail({ status: 'loading' });
      try {
        const snapshot = await props.getDirectionDetails.execute(
          EntityId.create(id),
          directionPeriodDays,
        );
        setDetail(snapshot === null ? { status: 'error' } : { status: 'ready', snapshot });
      } catch {
        setDetail({ status: 'error' });
      }
    },
    [directionPeriodDays, props.getDirectionDetails],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([props.getDirectionsOverview.execute(), props.getSpheres.execute()])
      .then(([overview, spheres]) => {
        if (active) setState({ status: 'ready', overview, spheres });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [props.getDirectionsOverview, props.getSpheres]);

  useEffect(() => {
    if (selectedId !== null || state.status !== 'ready' || focusAfterLoad.current === null) return;
    const row = [
      ...(catalog.current?.querySelectorAll<HTMLElement>('[data-direction-id]') ?? []),
    ].find((element) => element.dataset.directionId === focusAfterLoad.current);
    const target =
      row?.querySelector<HTMLElement>('.direction-card-menu > summary') ?? archiveButton.current;
    target?.focus();
    focusAfterLoad.current = null;
  }, [selectedId, state]);

  useEffect(() => {
    if (
      selectedId === null ||
      detail.status !== 'ready' ||
      pendingDetailFocus.current !== selectedId
    )
      return;
    const heading = document.querySelector<HTMLElement>('.direction-detail h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
      pendingDetailFocus.current = null;
    }
  }, [detail, selectedId]);

  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    void props.getDirectionDetails
      .execute(EntityId.create(selectedId), directionPeriodDays)
      .then((snapshot) => {
        if (active) {
          setDetail(snapshot === null ? { status: 'error' } : { status: 'ready', snapshot });
        }
      })
      .catch(() => {
        if (active) setDetail({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [directionPeriodDays, props.getDirectionDetails, selectedId]);

  useEffect(() => {
    if (message === null) return;
    const timer = window.setTimeout(() => setMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [message]);

  const mainDirection = useMemo(
    () =>
      state.status === 'ready'
        ? (state.overview.find(
            (item) => item.isMain && item.direction.status === DIRECTION_STATUS.active,
          ) ?? null)
        : null,
    [state],
  );
  const activeDirections = useMemo(
    () =>
      state.status === 'ready'
        ? state.overview.filter(
            (item) => item.direction.status === DIRECTION_STATUS.active && !item.isMain,
          )
        : [],
    [state],
  );
  const archivedDirections = useMemo(
    () =>
      state.status === 'ready'
        ? state.overview.filter((item) => item.direction.status === DIRECTION_STATUS.archived)
        : [],
    [state],
  );

  function openDirection(id: string): void {
    lastOpenedDirection.current = id;
    pendingDetailFocus.current = id;
    setDetail({ status: 'loading' });
    setSelectedId(id);
  }

  function openMainChoice(): void {
    setMainChoice(
      mainDirection?.direction.id.toString() ?? activeDirections[0]?.direction.id.toString() ?? '',
    );
    setChoosingMain(true);
  }

  function cancelMainChoice(): void {
    if (busyId !== null) return;
    setChoosingMain(false);
    chooseMainButton.current?.focus();
  }

  function openCreate(): void {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
    setMessage(null);
    setError(null);
  }

  function openEdit(direction: Direction): void {
    setEditing(direction);
    setDraft({
      name: direction.name,
      description: direction.description ?? '',
      strategicIntent: direction.strategicIntent ?? '',
      desiredState: direction.desiredState ?? '',
      inScope: direction.inScope ?? '',
      outOfScope: direction.outOfScope ?? '',
      sphereId: direction.sphereId?.toString() ?? '',
    });
    setFormOpen(true);
    setMessage(null);
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const details = {
        name: draft.name,
        description: draft.description,
        strategicIntent: draft.strategicIntent,
        desiredState: draft.desiredState,
        inScope: draft.inScope,
        outOfScope: draft.outOfScope,
        sphereId: draft.sphereId === '' ? null : EntityId.create(draft.sphereId),
      };
      const result =
        editing === null
          ? await props.createDirection.execute(details)
          : await props.updateDirection.execute({
              ...details,
              id: editing.id,
              expectedVersion: editing.version,
            });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const wasCreating = editing === null;
      setFormOpen(false);
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      setMessage(wasCreating ? 'Направление создано.' : 'Направление обновлено.');
      await load();
      if (selectedId === result.value.id.toString()) await loadDetail(selectedId);
    } catch {
      setError('Не удалось сохранить направление. Повторите попытку.');
    } finally {
      setSaving(false);
    }
  }

  async function changeArchiveState(direction: Direction, restore: boolean): Promise<void> {
    if (busyId !== null) return;
    setBusyId(direction.id.toString());
    setMessage(null);
    setError(null);
    try {
      const input = { id: direction.id, expectedVersion: direction.version };
      const result = restore
        ? await props.restoreDirection.execute(input)
        : await props.archiveDirection.execute(input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMessage(restore ? 'Направление восстановлено.' : 'Направление перемещено в архив.');
      focusAfterLoad.current = direction.id.toString();
      if (!restore && selectedId === direction.id.toString()) {
        setSelectedId(null);
        setDetail({ status: 'idle' });
      }
      await load();
    } catch {
      setError('Не удалось изменить состояние направления. Повторите попытку.');
    } finally {
      setBusyId(null);
    }
  }

  async function makeMain(direction: Direction): Promise<void> {
    if (busyId !== null) return;
    setBusyId(direction.id.toString());
    setMessage(null);
    setError(null);
    try {
      const result = await props.makeDirectionMain.execute({
        id: direction.id,
        expectedVersion: direction.version,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMessage('Главное направление обновлено.');
      setChoosingMain(false);
      focusAfterLoad.current = direction.id.toString();
      await load();
      if (selectedId !== null) await loadDetail(selectedId);
    } catch {
      setError('Не удалось выбрать главное направление. Повторите попытку.');
    } finally {
      setBusyId(null);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (detail.status !== 'ready' || saving) return;
    setSaving(true);
    setError(null);
    const result = await props.createProject.execute({
      directionId: detail.snapshot.direction.id,
      title: projectDraft.title,
      desiredResult: projectDraft.desiredResult,
      makeMain: projectDraft.makeMain,
    });
    if (result.ok) {
      setProjectDraft(EMPTY_PROJECT_DRAFT);
      setProjectFormOpen(false);
      setMessage('Цель создана в текущем направлении.');
      await Promise.all([load(), loadDetail(detail.snapshot.direction.id.toString())]);
    } else {
      setError(result.error.message);
    }
    setSaving(false);
  }

  function openReview(snapshot: DirectionDetailsSnapshot): void {
    const projectStatuses: Record<string, StrategicReviewProjectStatus> = {};
    for (const project of [
      ...snapshot.activeProjects,
      ...(snapshot.mainProject ? [snapshot.mainProject] : []),
      ...snapshot.pausedProjects,
    ]) {
      projectStatuses[project.id.toString()] =
        project.status === PROJECT_STATUS.paused ? PROJECT_STATUS.paused : PROJECT_STATUS.active;
    }
    setReview({
      status: 'questions',
      draft: {
        remainsRelevant: true,
        strategicIntent: snapshot.direction.strategicIntent ?? '',
        desiredState: snapshot.direction.desiredState ?? '',
        mainProjectId: snapshot.mainProject?.id.toString() ?? '',
        projectStatuses,
        createProject: false,
        newProjectTitle: '',
        newProjectDesiredResult: '',
        newProjectIsMain: false,
      },
    });
    setMessage(null);
    setError(null);
  }

  async function applyReview(draft: StrategicReviewDraft): Promise<void> {
    if (detail.status !== 'ready' || saving) return;
    setSaving(true);
    setError(null);
    const snapshot = detail.snapshot;
    const result = await props.applyDirectionStrategicReview.execute({
      directionId: snapshot.direction.id,
      expectedDirectionVersion: snapshot.direction.version,
      remainsRelevant: draft.remainsRelevant,
      strategicIntent: draft.strategicIntent,
      desiredState: draft.desiredState,
      projectChanges: draft.remainsRelevant
        ? snapshot.projects
            .filter((project) => {
              const status = draft.projectStatuses[project.id.toString()];
              return status !== undefined && status !== project.status;
            })
            .map((project) => ({
              id: project.id,
              expectedVersion: project.version,
              status: draft.projectStatuses[project.id.toString()]!,
            }))
        : [],
      mainProjectId:
        !draft.remainsRelevant || draft.newProjectIsMain || draft.mainProjectId === ''
          ? null
          : EntityId.create(draft.mainProjectId),
      newProject:
        draft.remainsRelevant && draft.createProject
          ? {
              title: draft.newProjectTitle,
              desiredResult: draft.newProjectDesiredResult,
              makeMain: draft.newProjectIsMain,
            }
          : null,
    });
    if (result.ok) {
      setReview({ status: 'complete', result: result.value });
      await Promise.all([load(), loadDetail(snapshot.direction.id.toString())]);
    } else {
      setError(result.error.message);
    }
    setSaving(false);
  }

  const spheres = state.status === 'ready' ? state.spheres : null;

  if (selectedId !== null) {
    return (
      <DirectionDetail
        detail={detail}
        spheres={spheres}
        projectDraft={projectDraft}
        projectFormOpen={projectFormOpen}
        saving={saving}
        busyId={busyId}
        message={message}
        error={error}
        onBack={() => {
          if (props.initialSelectedDirectionId !== undefined && props.onBackFromInitialDetail) {
            props.onBackFromInitialDetail();
            return;
          }
          focusAfterLoad.current = lastOpenedDirection.current;
          setSelectedId(null);
          setDetail({ status: 'idle' });
          setProjectFormOpen(false);
          setError(null);
        }}
        onEdit={openEdit}
        onMakeMain={(direction) => void makeMain(direction)}
        onArchive={(direction) => void changeArchiveState(direction, false)}
        onOpenProjectForm={() => setProjectFormOpen(true)}
        onCloseProjectForm={() => {
          setProjectFormOpen(false);
          setProjectDraft(EMPTY_PROJECT_DRAFT);
          setError(null);
        }}
        onProjectDraftChange={setProjectDraft}
        onCreateProject={createProject}
        onMakeProjectMain={async (project) => {
          if (busyId !== null || detail.status !== 'ready') return;
          setBusyId(project.id.toString());
          setError(null);
          const result = await props.makeProjectMain.execute({
            id: project.id,
            expectedVersion: project.version,
          });
          if (result.ok) {
            setMessage('Главная цель направления обновлена.');
            await loadDetail(detail.snapshot.direction.id.toString());
          } else {
            setError(result.error.message);
          }
          setBusyId(null);
        }}
        onOpenProject={props.onOpenProject}
        onPeriodChange={setDirectionPeriodDays}
        review={review}
        onOpenReview={() => detail.status === 'ready' && openReview(detail.snapshot)}
        onReviewChange={(draft) => setReview({ status: 'questions', draft })}
        onReviewSummary={(draft) => setReview({ status: 'summary', draft })}
        onReviewBack={(draft) => setReview({ status: 'questions', draft })}
        onReviewApply={(draft) => void applyReview(draft)}
        onReviewClose={() => setReview({ status: 'closed' })}
      >
        {formOpen && spheres !== null ? (
          <DirectionForm
            mode="edit"
            draft={draft}
            spheres={spheres}
            saving={saving}
            error={error}
            onChange={setDraft}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
              setError(null);
            }}
            onSubmit={save}
          />
        ) : null}
      </DirectionDetail>
    );
  }

  return (
    <main
      ref={catalog}
      className="section-page management-entity-page directions-section directions-compact"
    >
      <SectionPageHeader
        eyebrow="Управление"
        title="Направления"
        description="Долгосрочные векторы, в которых сейчас развивается система."
        action={
          formOpen ||
          state.status !== 'ready' ||
          (mainDirection === null && activeDirections.length === 0) ? null : (
            <button
              className="secondary-button"
              type="button"
              aria-expanded="false"
              onClick={openCreate}
            >
              Создать направление
            </button>
          )
        }
      />

      {formOpen && spheres !== null ? (
        <DirectionForm
          mode={editing === null ? 'create' : 'edit'}
          draft={draft}
          spheres={spheres}
          saving={saving}
          error={error}
          onChange={setDraft}
          onCancel={() => {
            setFormOpen(false);
            setError(null);
          }}
          onSubmit={save}
        />
      ) : null}

      <DirectionToast message={message} />
      {!formOpen && error !== null ? (
        <p className="section-page-error" role="alert">
          {error}
        </p>
      ) : null}
      {state.status === 'loading' ? <p role="status">Загружаем направления…</p> : null}
      {state.status === 'error' ? (
        <div className="section-page-error" role="alert">
          <p>Не удалось загрузить направления.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setState({ status: 'loading' });
              void load();
            }}
          >
            Повторить
          </button>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <div className="directions-catalog">
          {mainDirection !== null || activeDirections.length > 0 ? (
            <section
              className={`directions-priority${mainDirection === null ? ' is-empty' : ''}`}
              aria-label="Главное направление"
            >
              {mainDirection === null ? (
                <>
                  <div>
                    <h2>Главное направление</h2>
                    <strong>Главное направление пока не выбрано.</strong>
                  </div>
                  <button
                    ref={chooseMainButton}
                    className="secondary-button"
                    type="button"
                    aria-expanded={choosingMain}
                    disabled={busyId !== null}
                    onClick={openMainChoice}
                  >
                    Выбрать главное
                  </button>
                </>
              ) : (
                <>
                  <div className="directions-priority-heading">
                    <h2>Главное направление</h2>
                    <button
                      ref={chooseMainButton}
                      type="button"
                      aria-expanded={choosingMain}
                      disabled={busyId !== null}
                      onClick={openMainChoice}
                    >
                      Изменить выбор
                    </button>
                  </div>
                  <DirectionCard
                    key={mainDirection.direction.id.toString()}
                    item={mainDirection}
                    spheres={state.spheres}
                    busy={busyId !== null}
                    onOpen={openDirection}
                    onEdit={openEdit}
                    onMakeMain={undefined}
                    onArchive={(direction) => void changeArchiveState(direction, false)}
                    onRestore={undefined}
                  />
                </>
              )}
              {choosingMain ? (
                <form
                  className="directions-main-picker"
                  aria-label="Выбор главного направления"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelMainChoice();
                    }
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const item = state.overview.find(
                      (item) => item.direction.id.toString() === mainChoice,
                    );
                    if (item) void makeMain(item.direction);
                  }}
                >
                  <label>
                    Направление
                    <select
                      autoFocus
                      value={mainChoice}
                      disabled={busyId !== null}
                      onChange={(event) => setMainChoice(event.currentTarget.value)}
                    >
                      {state.overview
                        .filter((item) => item.direction.status === DIRECTION_STATUS.active)
                        .map((item) => (
                          <option
                            key={item.direction.id.toString()}
                            value={item.direction.id.toString()}
                          >
                            {item.direction.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="primary-button" type="submit" disabled={busyId !== null}>
                    {busyId !== null ? 'Сохраняем…' : 'Назначить'}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busyId !== null}
                    onClick={cancelMainChoice}
                  >
                    Отмена
                  </button>
                </form>
              ) : null}
            </section>
          ) : formOpen ? null : (
            <EmptyDirections onCreate={openCreate} />
          )}

          {activeDirections.length > 0 ? (
            <DirectionGroup
              title={mainDirection === null ? 'Все направления' : 'Остальные направления'}
            >
              <DirectionCards
                items={activeDirections}
                spheres={state.spheres}
                busyId={busyId}
                onOpen={openDirection}
                onEdit={openEdit}
                onMakeMain={(direction) => void makeMain(direction)}
                onArchive={(direction) => void changeArchiveState(direction, false)}
              />
            </DirectionGroup>
          ) : null}

          <section className="directions-archive" aria-label="Архив">
            <button
              ref={archiveButton}
              className="directions-archive-toggle"
              type="button"
              aria-expanded={showArchived}
              aria-controls="archived-directions"
              onClick={() => setShowArchived((current) => !current)}
            >
              <AppIcon name="arrow-right" />
              Архив
            </button>
            {showArchived ? (
              <div id="archived-directions" className="directions-archive-content">
                {archivedDirections.length === 0 ? (
                  <p className="management-empty-line">Архив пуст.</p>
                ) : (
                  <DirectionCards
                    items={archivedDirections}
                    spheres={state.spheres}
                    busyId={busyId}
                    onOpen={openDirection}
                    onRestore={(direction) => void changeArchiveState(direction, true)}
                  />
                )}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

interface DirectionDetailProps {
  readonly detail: DetailState;
  readonly spheres: SpheresSnapshot | null;
  readonly projectDraft: ProjectDraft;
  readonly projectFormOpen: boolean;
  readonly saving: boolean;
  readonly busyId: string | null;
  readonly message: string | null;
  readonly error: string | null;
  readonly onBack: () => void;
  readonly onEdit: (direction: Direction) => void;
  readonly onMakeMain: (direction: Direction) => void;
  readonly onArchive: (direction: Direction) => void;
  readonly onOpenProjectForm: () => void;
  readonly onCloseProjectForm: () => void;
  readonly onProjectDraftChange: (draft: ProjectDraft) => void;
  readonly onCreateProject: (event: FormEvent<HTMLFormElement>) => void;
  readonly onMakeProjectMain: (project: DirectionDetailsSnapshot['projects'][number]) => void;
  readonly onOpenProject: (projectId: string, directionId: string) => void;
  readonly onPeriodChange: (periodDays: DirectionBasePeriodDays) => void;
  readonly review: StrategicReviewState;
  readonly onOpenReview: () => void;
  readonly onReviewChange: (draft: StrategicReviewDraft) => void;
  readonly onReviewSummary: (draft: StrategicReviewDraft) => void;
  readonly onReviewBack: (draft: StrategicReviewDraft) => void;
  readonly onReviewApply: (draft: StrategicReviewDraft) => void;
  readonly onReviewClose: () => void;
  readonly children: ReactNode;
}

function DirectionDetail(props: DirectionDetailProps) {
  if (!('snapshot' in props.detail)) {
    if (props.detail.status === 'error') {
      return (
        <main className="section-page">
          <p className="section-page-error" role="alert">
            Не удалось открыть направление.
          </p>
          <button className="secondary-button" type="button" onClick={props.onBack}>
            Назад
          </button>
        </main>
      );
    }
    return (
      <main className="section-page">
        <p role="status">Загружаем направление…</p>
      </main>
    );
  }

  const {
    direction,
    projects,
    mainProject,
    activeProjects,
    pausedProjects,
    completedProjects,
    archivedProjects,
    pulse,
  } = props.detail.snapshot;
  const activePortfolioProjects =
    mainProject === null ? activeProjects : [mainProject, ...activeProjects];
  const directionDescription = direction.description?.trim() ?? null;
  const sphere =
    props.spheres === null
      ? null
      : findSphere(props.spheres, direction.sphereId?.toString() ?? null);
  return (
    <main className="section-page direction-detail">
      <button className="direction-back" type="button" onClick={props.onBack}>
        ← Направления
      </button>
      <header className="direction-detail-header">
        <div>
          <h1>{direction.name}</h1>
          <div className="direction-detail-badges">
            {direction.isMain ? (
              <span className="direction-main-badge">★ Главное направление</span>
            ) : null}
            <span className="management-status">
              {direction.status === DIRECTION_STATUS.active ? 'Активно' : 'Архив'}
            </span>
            <span className="direction-detail-sphere">{sphere?.name ?? 'Без сферы'}</span>
          </div>
        </div>
        {direction.status === DIRECTION_STATUS.active ? (
          <DirectionMenu
            direction={direction}
            busy={props.busyId === direction.id.toString()}
            onEdit={props.onEdit}
            onMakeMain={props.onMakeMain}
            onArchive={props.onArchive}
            onRestore={undefined}
          />
        ) : null}
      </header>
      {directionDescription === null || directionDescription === '-' ? null : (
        <p className="direction-detail-description">{directionDescription}</p>
      )}
      {props.children}
      <DirectionToast message={props.message} />
      {props.error !== null ? (
        <p className="section-page-error" role="alert">
          {props.error}
        </p>
      ) : null}

      <section
        className={`direction-focus ${mainProject === null ? 'direction-focus-is-empty' : 'direction-focus-has-project'}`}
        aria-labelledby="direction-focus-heading"
      >
        <p className="section-page-eyebrow">Сейчас</p>
        {mainProject === null ? (
          <div className="direction-focus-empty">
            <div>
              <h2 id="direction-focus-heading">Нет главной цели</h2>
              <p>Направление пока не запущено в работу.</p>
            </div>
            {direction.status === DIRECTION_STATUS.active ? (
              <div className="direction-focus-actions">
                <button className="primary-button" type="button" onClick={props.onOpenProjectForm}>
                  Создать цель
                </button>
                <a className="secondary-button" href="#direction-projects-heading">
                  Выбрать из портфеля
                </a>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            className="direction-focus-project"
            type="button"
            onClick={() => props.onOpenProject(mainProject.id.toString(), direction.id.toString())}
          >
            <span className="direction-focus-project-top">
              <h2 id="direction-focus-heading">{mainProject.title}</h2>
              <span className="management-status">{projectStatusLabel(mainProject.status)}</span>
            </span>
            <span className="direction-focus-project-bottom">
              <span className="direction-focus-project-result">
                {mainProject.desiredResult ?? 'Не задан'}
              </span>
              <span className="direction-focus-project-action">Открыть цель →</span>
            </span>
          </button>
        )}
      </section>

      <section className="direction-projects" aria-labelledby="direction-projects-heading">
        <div className="management-list-heading">
          <div>
            <h2 id="direction-projects-heading">Портфель · {projects.length}</h2>
            {projects.length === 0 ? <p>Целей пока нет.</p> : null}
          </div>
          {direction.status === DIRECTION_STATUS.active && !props.projectFormOpen ? (
            <button className="primary-button" type="button" onClick={props.onOpenProjectForm}>
              Добавить цель
            </button>
          ) : null}
        </div>

        {props.projectFormOpen ? (
          <DirectionProjectCreateForm
            directionName={direction.name}
            sphereName={sphere?.name ?? null}
            draft={props.projectDraft}
            saving={props.saving}
            onDraftChange={props.onProjectDraftChange}
            onSubmit={props.onCreateProject}
            onCancel={props.onCloseProjectForm}
          />
        ) : null}

        {projects.length === 0 && !props.projectFormOpen ? (
          direction.status === DIRECTION_STATUS.active ? (
            <button
              className="direction-empty-action"
              type="button"
              onClick={props.onOpenProjectForm}
            >
              + Создать первый цель
            </button>
          ) : null
        ) : projects.length > 0 ? (
          <div className="direction-project-groups">
            {activePortfolioProjects.length === 0 ? null : (
              <DirectionProjectGroup
                title="Активные"
                projects={activePortfolioProjects}
                directionId={direction.id.toString()}
                onOpen={props.onOpenProject}
                onMakeMain={props.onMakeProjectMain}
                busyId={props.busyId}
              />
            )}
            {pausedProjects.length === 0 ? null : (
              <DirectionProjectGroup
                title="Приостановленные"
                projects={pausedProjects}
                directionId={direction.id.toString()}
                onOpen={props.onOpenProject}
              />
            )}
            {completedProjects.length === 0 ? null : (
              <DirectionProjectGroup
                title="Завершённые"
                projects={completedProjects}
                directionId={direction.id.toString()}
                onOpen={props.onOpenProject}
              />
            )}
            {archivedProjects.length === 0 ? null : (
              <DirectionProjectGroup
                title="Архив"
                projects={archivedProjects}
                directionId={direction.id.toString()}
                onOpen={props.onOpenProject}
              />
            )}
          </div>
        ) : null}
      </section>

      <DirectionPulsePanel pulse={pulse} onPeriodChange={props.onPeriodChange} />

      <DirectionStrategicOutline
        direction={direction}
        onConfigure={() => props.onEdit(direction)}
      />

      {direction.status === DIRECTION_STATUS.active && props.review.status === 'closed' ? (
        <section className="direction-review-entry" aria-labelledby="direction-review-entry-title">
          <div>
            <p className="section-page-eyebrow">Стратегический обзор</p>
            <h2 id="direction-review-entry-title">Пересмотр курса</h2>
            <p>
              Последний обзор:{' '}
              {props.detail.snapshot.lastStrategicReviewAt === null
                ? 'не проводился'
                : formatDateTime(props.detail.snapshot.lastStrategicReviewAt)}
            </p>
          </div>
          <button className="direction-text-action" type="button" onClick={props.onOpenReview}>
            Провести обзор →
          </button>
        </section>
      ) : null}

      {props.review.status === 'closed' ? null : (
        <DirectionStrategicReview
          snapshot={props.detail.snapshot}
          state={props.review}
          saving={props.saving}
          onChange={props.onReviewChange}
          onSummary={props.onReviewSummary}
          onBack={props.onReviewBack}
          onApply={props.onReviewApply}
          onClose={props.onReviewClose}
        />
      )}

      <DirectionSignals operationalState={pulse.operationalState} />
    </main>
  );
}

interface DirectionProjectCreateFormProps {
  readonly directionName: string;
  readonly sphereName: string | null;
  readonly draft: ProjectDraft;
  readonly saving: boolean;
  readonly onDraftChange: (draft: ProjectDraft) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
}

export function DirectionProjectCreateForm(props: DirectionProjectCreateFormProps) {
  return (
    <form
      className="management-entity-form direction-project-form"
      aria-labelledby="direction-project-form-title"
      aria-busy={props.saving}
      onSubmit={props.onSubmit}
    >
      <h3 id="direction-project-form-title">Новая цель</h3>

      <VoiceField className="direction-project-field" htmlFor="direction-project-title">
        <span>Название</span>
        <VoiceTextInput
          id="direction-project-title"
          required
          autoFocus
          maxLength={MAX_PROJECT_TITLE_LENGTH}
          placeholder="Например: Финансовая подушка"
          value={props.draft.title}
          onValueChange={(value) => props.onDraftChange({ ...props.draft, title: value })}
        />
      </VoiceField>

      <label className="direction-project-main-option" htmlFor="direction-project-main">
        <input
          id="direction-project-main"
          type="checkbox"
          checked={props.draft.makeMain}
          onChange={(event) =>
            props.onDraftChange({ ...props.draft, makeMain: event.currentTarget.checked })
          }
        />
        <span className="direction-project-checkbox" aria-hidden="true" />
        <span>Сделать главной целью</span>
      </label>

      <VoiceField className="direction-project-field" htmlFor="direction-project-result">
        <span>
          Желаемый результат <small>необязательно</small>
        </span>
        <VoiceTextArea
          id="direction-project-result"
          rows={2}
          maxLength={MAX_PROJECT_DESIRED_RESULT_LENGTH}
          value={props.draft.desiredResult}
          onValueChange={(value) => props.onDraftChange({ ...props.draft, desiredResult: value })}
        />
      </VoiceField>

      <p className="direction-project-context">
        Направление: {props.directionName} · Сфера: {props.sphereName ?? 'Без сферы'}
      </p>

      <div className="management-form-actions direction-project-form-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={props.saving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
        <button className="primary-button" type="submit" disabled={props.saving}>
          {props.saving ? 'Создание…' : 'Создать цель'}
        </button>
      </div>
    </form>
  );
}

export function DirectionPulsePanel(props: {
  readonly pulse: DirectionDetailsSnapshot['pulse'];
  readonly onPeriodChange: (periodDays: DirectionBasePeriodDays) => void;
}) {
  const dynamics = props.pulse.dynamics;
  const hasActivity =
    props.pulse.activeDecisionCount > 0 ||
    props.pulse.unfinishedActionCount > 0 ||
    props.pulse.completedActionCount > 0 ||
    props.pulse.completedSessionCount > 0 ||
    props.pulse.totalActualTimeMs > 0 ||
    props.pulse.lastRealMovementAt !== null ||
    dynamics.completedActionCount > 0 ||
    dynamics.completedSessionCount > 0 ||
    dynamics.actualTimeMs > 0;
  return (
    <section className="direction-pulse" aria-labelledby="direction-pulse-heading">
      <div className="direction-pulse-heading">
        <div>
          <h2 id="direction-pulse-heading">Движение</h2>
        </div>
      </div>
      {hasActivity ? (
        <>
          <dl className="direction-pulse-metrics">
            <div>
              <dt>Решения</dt>
              <dd>{props.pulse.activeDecisionCount}</dd>
            </div>
            <div>
              <dt>Действия</dt>
              <dd>{props.pulse.unfinishedActionCount} незавершённых</dd>
              <small>{props.pulse.completedActionCount} выполнено</small>
            </div>
            <div>
              <dt>Сессии</dt>
              <dd>{props.pulse.completedSessionCount}</dd>
              <small>завершено</small>
            </div>
            <div>
              <dt>Фактическое время</dt>
              <dd>{formatActualTime(props.pulse.totalActualTimeMs)}</dd>
            </div>
          </dl>
          <p className="direction-pulse-last-movement">
            Последнее движение:{' '}
            {props.pulse.lastRealMovementAt === null
              ? 'пока не зафиксировано'
              : formatDateTime(props.pulse.lastRealMovementAt)}
          </p>
          <div className="direction-pulse-dynamics">
            <div className="direction-pulse-period" aria-label="Базовый период динамики">
              <span>За период</span>
              {([7, 30] as const).map((periodDays) => (
                <button
                  key={periodDays}
                  type="button"
                  className={dynamics.periodDays === periodDays ? 'is-active' : undefined}
                  aria-pressed={dynamics.periodDays === periodDays}
                  onClick={() => props.onPeriodChange(periodDays)}
                >
                  {periodDays} дней
                </button>
              ))}
            </div>
            <p>
              {dynamics.completedActionCount} выполненных действий ·{' '}
              {dynamics.completedSessionCount} сессий · {formatActualTime(dynamics.actualTimeMs)}
            </p>
          </div>
        </>
      ) : (
        <p className="direction-section-empty">Активность пока не зафиксирована.</p>
      )}
    </section>
  );
}

export function DirectionSignals(props: {
  readonly operationalState: DirectionDetailsSnapshot['operationalState'];
}) {
  void props.operationalState;
  return null;
}

export function DirectionPortfolioSummary(props: {
  readonly operationalState: DirectionDetailsSnapshot['operationalState'];
  readonly activeCount: number;
  readonly pausedCount: number;
  readonly completedCount: number;
}) {
  const stateLabel = operationalStateLabel(props.operationalState);
  return (
    <section className="direction-portfolio-summary" aria-label="Состояние портфеля">
      <strong>{stateLabel}</strong>
      <span>{props.activeCount} активных</span>
      <span>{props.pausedCount} приостановленных</span>
      <span>{props.completedCount} завершённых</span>
    </section>
  );
}

export function DirectionStrategicReview(props: {
  readonly snapshot: DirectionDetailsSnapshot;
  readonly state: Exclude<StrategicReviewState, { readonly status: 'closed' }>;
  readonly saving: boolean;
  readonly onChange: (draft: StrategicReviewDraft) => void;
  readonly onSummary: (draft: StrategicReviewDraft) => void;
  readonly onBack: (draft: StrategicReviewDraft) => void;
  readonly onApply: (draft: StrategicReviewDraft) => void;
  readonly onClose: () => void;
}) {
  if (props.state.status === 'complete') {
    const result = props.state.result;
    return (
      <section className="direction-review direction-review-complete" aria-live="polite">
        <p className="section-page-eyebrow">Обзор завершён</p>
        <h2>Курс направления обновлён</h2>
        <dl className="direction-review-result">
          <div>
            <dt>Что изменено</dt>
            <dd>
              {result.directionChanged ? 'Направление и ' : ''}
              {result.changedProjectCount} целей
              {result.createdProject === null ? '' : ', создана новая цель'}
            </dd>
          </div>
          <div>
            <dt>Новая главная цель</dt>
            <dd>{result.mainProject?.title ?? 'Не выбран'}</dd>
          </div>
          <div>
            <dt>Текущее состояние направления</dt>
            <dd>
              {result.direction.status === DIRECTION_STATUS.active ? 'Активно' : 'Архив'} ·{' '}
              {operationalStateLabel(props.snapshot.operationalState)}
            </dd>
          </div>
          <div>
            <dt>Последний стратегический обзор</dt>
            <dd>{formatDateTime(result.reviewedAt)}</dd>
          </div>
        </dl>
        <button className="primary-button" type="button" onClick={props.onClose}>
          Готово
        </button>
      </section>
    );
  }

  const draft = props.state.draft;
  if (props.state.status === 'summary') {
    const changes = strategicReviewSummary(props.snapshot, draft);
    return (
      <section className="direction-review" aria-labelledby="direction-review-summary-title">
        <p className="section-page-eyebrow">Подтверждение</p>
        <h2 id="direction-review-summary-title">Резюме изменений</h2>
        {changes.length === 0 ? (
          <p>Изменений сущностей нет. Будет зафиксирован только факт стратегического обзора.</p>
        ) : (
          <ul className="direction-review-summary">
            {changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        )}
        <p className="direction-review-confirmation">
          Изменения применятся одной операцией только после подтверждения.
        </p>
        <div className="management-form-actions">
          <button
            className="primary-button"
            type="button"
            disabled={props.saving}
            onClick={() => props.onApply(draft)}
          >
            {props.saving ? 'Применяем…' : 'Подтвердить и применить'}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={props.saving}
            onClick={() => props.onBack(draft)}
          >
            Назад
          </button>
        </div>
      </section>
    );
  }

  const activeProjects = props.snapshot.projects.filter(
    (project) => draft.projectStatuses[project.id.toString()] === PROJECT_STATUS.active,
  );
  return (
    <section className="direction-review" aria-labelledby="direction-review-title">
      <div className="direction-review-heading">
        <div>
          <p className="section-page-eyebrow">Короткий обзор курса</p>
          <h2 id="direction-review-title">Стратегический обзор</h2>
        </div>
        <button className="secondary-button" type="button" onClick={props.onClose}>
          Закрыть
        </button>
      </div>

      <DirectionReviewFacts snapshot={props.snapshot} />

      <div className="direction-review-questions">
        <fieldset>
          <legend>Направление всё ещё актуально?</legend>
          <label>
            <input
              type="radio"
              name="direction-relevant"
              checked={draft.remainsRelevant}
              onChange={() => props.onChange({ ...draft, remainsRelevant: true })}
            />{' '}
            Да, продолжить
          </label>
          <label>
            <input
              type="radio"
              name="direction-relevant"
              checked={!draft.remainsRelevant}
              onChange={() => props.onChange({ ...draft, remainsRelevant: false })}
            />{' '}
            Нет, перенести направление в архив
          </label>
        </fieldset>

        {draft.remainsRelevant ? (
          <>
            <VoiceField className="management-field">
              <span>Стратегический замысел остаётся верным?</span>
              <VoiceTextArea
                rows={3}
                maxLength={MAX_DIRECTION_STRATEGIC_TEXT_LENGTH}
                value={draft.strategicIntent}
                onValueChange={(value) => props.onChange({ ...draft, strategicIntent: value })}
              />
            </VoiceField>
            <VoiceField className="management-field">
              <span>Желаемое состояние нужно изменить?</span>
              <VoiceTextArea
                rows={3}
                maxLength={MAX_DIRECTION_STRATEGIC_TEXT_LENGTH}
                value={draft.desiredState}
                onValueChange={(value) => props.onChange({ ...draft, desiredState: value })}
              />
            </VoiceField>

            <fieldset>
              <legend>Какие цели продолжить, приостановить или архивировать?</legend>
              <div className="direction-review-projects">
                {reviewableProjects(props.snapshot).map((project) => (
                  <label key={project.id.toString()}>
                    <span>{project.title}</span>
                    <select
                      aria-label={`Состояние цели ${project.title}`}
                      value={draft.projectStatuses[project.id.toString()]}
                      onChange={(event) =>
                        props.onChange({
                          ...draft,
                          projectStatuses: {
                            ...draft.projectStatuses,
                            [project.id.toString()]: event.currentTarget
                              .value as StrategicReviewProjectStatus,
                          },
                          mainProjectId:
                            event.currentTarget.value !== PROJECT_STATUS.active &&
                            draft.mainProjectId === project.id.toString()
                              ? ''
                              : draft.mainProjectId,
                        })
                      }
                    >
                      <option value={PROJECT_STATUS.active}>Продолжить</option>
                      <option value={PROJECT_STATUS.paused}>Приостановить</option>
                      <option value={PROJECT_STATUS.archived}>Архивировать</option>
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="management-field">
              <span>Какая цель сейчас должна быть главной?</span>
              <select
                value={draft.newProjectIsMain ? '__new__' : draft.mainProjectId}
                onChange={(event) =>
                  props.onChange({
                    ...draft,
                    mainProjectId:
                      event.currentTarget.value === '__new__' ? '' : event.currentTarget.value,
                    newProjectIsMain: event.currentTarget.value === '__new__',
                  })
                }
              >
                <option value="">Не выбирать</option>
                {activeProjects.map((project) => (
                  <option key={project.id.toString()} value={project.id.toString()}>
                    {project.title}
                  </option>
                ))}
                {draft.createProject && draft.newProjectTitle.trim().length > 0 ? (
                  <option value="__new__">Новая цель</option>
                ) : null}
              </select>
            </label>

            <fieldset>
              <legend>Нужна ли новая цель?</legend>
              <label>
                <input
                  type="checkbox"
                  checked={draft.createProject}
                  onChange={(event) =>
                    props.onChange({
                      ...draft,
                      createProject: event.currentTarget.checked,
                      newProjectIsMain: event.currentTarget.checked
                        ? draft.newProjectIsMain
                        : false,
                    })
                  }
                />{' '}
                Создать цель в этом направлении
              </label>
              {draft.createProject ? (
                <div className="direction-review-new-project">
                  <VoiceField className="management-field">
                    <span>Название</span>
                    <VoiceTextInput
                      required
                      maxLength={MAX_PROJECT_TITLE_LENGTH}
                      value={draft.newProjectTitle}
                      onValueChange={(value) =>
                        props.onChange({ ...draft, newProjectTitle: value })
                      }
                    />
                  </VoiceField>
                  <VoiceField className="management-field">
                    <span>Желаемый результат</span>
                    <VoiceTextArea
                      rows={2}
                      maxLength={MAX_PROJECT_DESIRED_RESULT_LENGTH}
                      value={draft.newProjectDesiredResult}
                      onValueChange={(value) =>
                        props.onChange({
                          ...draft,
                          newProjectDesiredResult: value,
                        })
                      }
                    />
                  </VoiceField>
                </div>
              ) : null}
            </fieldset>
          </>
        ) : null}
      </div>
      <button
        className="primary-button"
        type="button"
        disabled={draft.createProject && draft.newProjectTitle.trim().length === 0}
        onClick={() => props.onSummary(draft)}
      >
        Проверить изменения
      </button>
    </section>
  );
}

function DirectionReviewFacts(props: { readonly snapshot: DirectionDetailsSnapshot }) {
  const { direction, mainProject, pulse } = props.snapshot;
  return (
    <dl className="direction-review-facts" aria-label="Данные стратегического обзора">
      <div>
        <dt>Стратегический замысел</dt>
        <dd>{direction.strategicIntent ?? 'Не задан'}</dd>
      </div>
      <div>
        <dt>Желаемое состояние</dt>
        <dd>{direction.desiredState ?? 'Не задано'}</dd>
      </div>
      <div>
        <dt>Главная цель</dt>
        <dd>{mainProject?.title ?? 'Не выбран'}</dd>
      </div>
      <div>
        <dt>Цели</dt>
        <dd>
          {pulse.activeProjectCount} активных · {pulse.pausedProjectCount} приостановленных ·{' '}
          {pulse.completedProjectCount} завершённых
        </dd>
      </div>
      <div>
        <dt>Решения</dt>
        <dd>{pulse.activeDecisionCount} активных</dd>
      </div>
      <div>
        <dt>Действия</dt>
        <dd>
          {pulse.unfinishedActionCount} незавершённых · {pulse.completedActionCount} выполнено
        </dd>
      </div>
      <div>
        <dt>Сессии</dt>
        <dd>{pulse.completedSessionCount} завершено</dd>
      </div>
      <div>
        <dt>Фактическое время</dt>
        <dd>{formatActualTime(pulse.totalActualTimeMs)}</dd>
      </div>
      <div>
        <dt>Последнее движение</dt>
        <dd>
          {pulse.lastRealMovementAt === null
            ? 'Не зафиксировано'
            : formatDateTime(pulse.lastRealMovementAt)}
        </dd>
      </div>
      <div>
        <dt>Текущее состояние направления</dt>
        <dd>{operationalStateLabel(pulse.operationalState)}</dd>
      </div>
    </dl>
  );
}

function reviewableProjects(snapshot: DirectionDetailsSnapshot) {
  return [
    ...(snapshot.mainProject ? [snapshot.mainProject] : []),
    ...snapshot.activeProjects,
    ...snapshot.pausedProjects,
  ];
}

function strategicReviewSummary(
  snapshot: DirectionDetailsSnapshot,
  draft: StrategicReviewDraft,
): readonly string[] {
  if (!draft.remainsRelevant) return ['Направление будет перенесено в архив.'];
  const changes: string[] = [];
  if ((snapshot.direction.strategicIntent ?? '') !== draft.strategicIntent.trim())
    changes.push('Обновить стратегический замысел.');
  if ((snapshot.direction.desiredState ?? '') !== draft.desiredState.trim())
    changes.push('Обновить желаемое состояние.');
  for (const project of reviewableProjects(snapshot)) {
    const nextStatus = draft.projectStatuses[project.id.toString()];
    if (nextStatus !== project.status)
      changes.push(`${project.title}: ${projectStatusLabel(nextStatus!)}.`);
  }
  if (draft.createProject) changes.push(`Создать цель «${draft.newProjectTitle.trim()}».`);
  const currentMainId = snapshot.mainProject?.id.toString() ?? '';
  if (draft.newProjectIsMain) changes.push('Назначить новую цель главной.');
  else if (draft.mainProjectId !== currentMainId) {
    const main = snapshot.projects.find((project) => project.id.toString() === draft.mainProjectId);
    changes.push(
      main === undefined
        ? 'Снять текущую главную цель.'
        : `Назначить главной цель «${main.title}».`,
    );
  }
  return changes;
}

function DirectionProjectGroup(props: {
  readonly title: string;
  readonly projects: DirectionDetailsSnapshot['projects'];
  readonly directionId: string;
  readonly onOpen: (projectId: string, directionId: string) => void;
  readonly onMakeMain?:
    ((project: DirectionDetailsSnapshot['projects'][number]) => void) | undefined;
  readonly busyId?: string | null;
}) {
  return (
    <section className="direction-project-group">
      <h3>{props.title}</h3>
      <div className="direction-project-grid">
        {props.projects.map((project) => (
          <div
            className={`direction-project-row${project.isMain ? ' direction-project-row-main' : ''}`}
            key={project.id.toString()}
          >
            <button
              className="direction-project-row-open"
              type="button"
              onClick={() => props.onOpen(project.id.toString(), props.directionId)}
            >
              <span className="direction-project-row-top">
                <span className="direction-project-row-identity">
                  {project.isMain ? (
                    <span
                      className="direction-project-main-marker"
                      aria-label="Главная цель"
                      title="Главная цель"
                    >
                      ★
                    </span>
                  ) : null}
                  <strong>{project.title}</strong>
                  <span className="management-status">{projectStatusLabel(project.status)}</span>
                </span>
                <span className="direction-project-row-action">Открыть →</span>
              </span>
              <span className="direction-project-row-result">
                {project.desiredResult ?? 'Не задан'}
              </span>
            </button>
            {props.onMakeMain === undefined || project.isMain ? null : (
              <button
                className="secondary-button direction-project-make-main"
                type="button"
                disabled={props.busyId !== null}
                onClick={() => props.onMakeMain?.(project)}
              >
                Сделать главным
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

interface DirectionFormProps {
  readonly mode: 'create' | 'edit';
  readonly draft: DirectionDraft;
  readonly spheres: SpheresSnapshot;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onChange: (draft: DirectionDraft) => void;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function DirectionForm(props: DirectionFormProps) {
  const isCreate = props.mode === 'create';

  return (
    <form
      className={`management-entity-form${isCreate ? ' direction-create-form' : ''}`}
      onSubmit={props.onSubmit}
    >
      <div className="management-form-heading">
        <div>
          {isCreate ? null : <p className="section-page-eyebrow">Редактирование</p>}
          <h2>{isCreate ? 'Новое направление' : 'Изменить направление'}</h2>
          {isCreate ? (
            <p className="direction-create-form-intro">
              Зафиксируйте долгосрочный вектор — детали можно уточнить позже.
            </p>
          ) : null}
        </div>
      </div>
      <div className="management-form-grid">
        <VoiceField className="management-field" htmlFor="direction-name">
          <span>
            Название{' '}
            <span className="direction-required-mark" aria-hidden="true">
              *
            </span>
          </span>
          <VoiceTextInput
            id="direction-name"
            placeholder="Введите название направления"
            required
            autoFocus
            maxLength={MAX_DIRECTION_NAME_LENGTH}
            value={props.draft.name}
            onValueChange={(value) => props.onChange({ ...props.draft, name: value })}
          />
        </VoiceField>
        <label className="management-field" htmlFor="direction-sphere">
          <span>Сфера</span>
          <select
            id="direction-sphere"
            value={props.draft.sphereId}
            onChange={(event) =>
              props.onChange({ ...props.draft, sphereId: event.currentTarget.value })
            }
          >
            <option value="">Без сферы</option>
            <SphereOptions snapshot={props.spheres} />
          </select>
          {isCreate ? <small className="direction-field-helper">Можно выбрать позже</small> : null}
        </label>
        <VoiceField
          className="management-field management-field-wide"
          htmlFor="direction-description"
        >
          <span>{isCreate ? 'Короткое описание' : 'Описание'}</span>
          <VoiceTextArea
            id="direction-description"
            rows={isCreate ? 2 : 3}
            maxLength={MAX_DIRECTION_DESCRIPTION_LENGTH}
            placeholder={isCreate ? 'Одно предложение о долгосрочном векторе' : undefined}
            value={props.draft.description}
            onValueChange={(value) => props.onChange({ ...props.draft, description: value })}
          />
        </VoiceField>
        {props.mode === 'edit' ? (
          <fieldset className="direction-strategic-form-fields management-field-wide">
            <legend>Стратегический контур</legend>
            <VoiceField className="management-field" htmlFor="direction-strategic-intent">
              <span>
                Замысел <small>необязательно</small>
              </span>
              <VoiceTextArea
                id="direction-strategic-intent"
                rows={3}
                maxLength={MAX_DIRECTION_STRATEGIC_TEXT_LENGTH}
                value={props.draft.strategicIntent}
                onValueChange={(value) =>
                  props.onChange({ ...props.draft, strategicIntent: value })
                }
              />
            </VoiceField>
            <VoiceField className="management-field" htmlFor="direction-desired-state">
              <span>
                Желаемое состояние <small>необязательно</small>
              </span>
              <VoiceTextArea
                id="direction-desired-state"
                rows={3}
                maxLength={MAX_DIRECTION_STRATEGIC_TEXT_LENGTH}
                value={props.draft.desiredState}
                onValueChange={(value) => props.onChange({ ...props.draft, desiredState: value })}
              />
            </VoiceField>
            <VoiceField className="management-field" htmlFor="direction-in-scope">
              <span>
                Входит <small>необязательно</small>
              </span>
              <VoiceTextArea
                id="direction-in-scope"
                rows={3}
                maxLength={MAX_DIRECTION_STRATEGIC_TEXT_LENGTH}
                value={props.draft.inScope}
                onValueChange={(value) => props.onChange({ ...props.draft, inScope: value })}
              />
            </VoiceField>
            <VoiceField className="management-field" htmlFor="direction-out-of-scope">
              <span>
                Не входит <small>необязательно</small>
              </span>
              <VoiceTextArea
                id="direction-out-of-scope"
                rows={3}
                maxLength={MAX_DIRECTION_STRATEGIC_TEXT_LENGTH}
                value={props.draft.outOfScope}
                onValueChange={(value) => props.onChange({ ...props.draft, outOfScope: value })}
              />
            </VoiceField>
          </fieldset>
        ) : null}
      </div>
      {props.error !== null ? (
        <p className="form-error" role="alert">
          {props.error}
        </p>
      ) : null}
      <div className="management-form-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={props.saving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
        <button className="primary-button" type="submit" disabled={props.saving}>
          {props.saving ? 'Сохраняем…' : isCreate ? 'Создать направление' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}

export function DirectionStrategicOutline(props: {
  readonly direction: Direction;
  readonly onConfigure: () => void;
}) {
  const items = [
    ['Замысел', props.direction.strategicIntent],
    ['Желаемое состояние', props.direction.desiredState],
    ['Входит', props.direction.inScope],
    ['Не входит', props.direction.outOfScope],
  ] as const;
  const hasContent = items.some(([, value]) => value !== null);

  return (
    <section className="direction-strategic-outline" aria-labelledby="direction-strategic-heading">
      {hasContent ? (
        <>
          <h2 id="direction-strategic-heading">Стратегический контур</h2>
          <dl>
            {items.map(([label, value]) =>
              value === null ? null : (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ),
            )}
          </dl>
        </>
      ) : (
        <div className="direction-strategic-empty">
          <div>
            <h2 id="direction-strategic-heading">Стратегический контур не настроен</h2>
            <p>Определите замысел, желаемое состояние и границы.</p>
          </div>
          <button className="direction-text-action" type="button" onClick={props.onConfigure}>
            Настроить →
          </button>
        </div>
      )}
    </section>
  );
}

function DirectionGroup({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="direction-group" aria-label={title}>
      <div className="management-list-heading">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DirectionCards(props: {
  readonly items: readonly DirectionOverviewItem[];
  readonly spheres: SpheresSnapshot;
  readonly busyId: string | null;
  readonly onOpen: (id: string) => void;
  readonly onEdit?: (direction: Direction) => void;
  readonly onMakeMain?: (direction: Direction) => void;
  readonly onArchive?: (direction: Direction) => void;
  readonly onRestore?: (direction: Direction) => void;
}) {
  return (
    <div className="direction-card-grid">
      {props.items.map((item) => (
        <DirectionCard
          key={item.direction.id.toString()}
          item={item}
          spheres={props.spheres}
          busy={props.busyId !== null}
          onOpen={props.onOpen}
          onEdit={props.onEdit}
          onMakeMain={props.onMakeMain}
          onArchive={props.onArchive}
          onRestore={props.onRestore}
        />
      ))}
    </div>
  );
}

export function DirectionCard(props: {
  readonly item: DirectionOverviewItem;
  readonly spheres: SpheresSnapshot;
  readonly detail?: DirectionDetailsSnapshot | undefined;
  readonly busy: boolean;
  readonly onOpen: (id: string) => void;
  readonly onEdit: ((direction: Direction) => void) | undefined;
  readonly onMakeMain: ((direction: Direction) => void) | undefined;
  readonly onArchive: ((direction: Direction) => void) | undefined;
  readonly onRestore: ((direction: Direction) => void) | undefined;
}) {
  const { direction } = props.item;
  const sphere = findSphere(props.spheres, direction.sphereId?.toString() ?? null);
  const hasLeadingEmoji = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(
    direction.name.trimStart(),
  );
  return (
    <article
      data-direction-id={direction.id.toString()}
      className={`direction-card${direction.isMain ? ' direction-card-main' : ''}`}
    >
      <button
        role="link"
        className="direction-card-open"
        type="button"
        onClick={() => props.onOpen(direction.id.toString())}
      >
        {hasLeadingEmoji ? null : (
          <span className="direction-card-identity">
            <DirectionSphereIcon
              className="direction-card-sphere-icon"
              sphereName={sphere?.name ?? null}
            />
          </span>
        )}
        <span className="direction-card-content">
          <strong>{direction.name}</strong>
          {direction.description ? (
            <span className="direction-card-description">{direction.description}</span>
          ) : null}
        </span>
        <span className="direction-card-sphere">{sphere?.name ?? 'Без сферы'}</span>
        <AppIcon className="direction-card-arrow" name="arrow-right" />
      </button>
      <DirectionMenu
        direction={direction}
        busy={props.busy}
        onEdit={props.onEdit}
        onMakeMain={props.onMakeMain}
        onArchive={props.onArchive}
        onRestore={props.onRestore}
      />
    </article>
  );
}

function DirectionMenu(props: {
  readonly direction: Direction;
  readonly busy: boolean;
  readonly onEdit: ((direction: Direction) => void) | undefined;
  readonly onMakeMain: ((direction: Direction) => void) | undefined;
  readonly onArchive: ((direction: Direction) => void) | undefined;
  readonly onRestore: ((direction: Direction) => void) | undefined;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  function close(): void {
    if (!menu.current) return;
    menu.current.open = false;
    menu.current.querySelector('summary')?.focus();
  }
  return (
    <details
      ref={menu}
      className="direction-card-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) close();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
    >
      <summary aria-label={`Действия: ${props.direction.name}`}>⋯</summary>
      <div className="direction-card-menu-popover">
        {props.onMakeMain === undefined || props.direction.isMain ? null : (
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onMakeMain?.(props.direction)}
          >
            Сделать главным
          </button>
        )}
        {props.onEdit === undefined ? null : (
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onEdit?.(props.direction)}
          >
            Редактировать
          </button>
        )}
        {props.onArchive === undefined ? null : (
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onArchive?.(props.direction)}
          >
            Архивировать
          </button>
        )}
        {props.onRestore === undefined ? null : (
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onRestore?.(props.direction)}
          >
            Восстановить
          </button>
        )}
      </div>
    </details>
  );
}

export function EmptyDirections({ onCreate }: { readonly onCreate: () => void }) {
  return (
    <div className="management-empty-state direction-empty-state">
      <div>
        <strong>Пока нет направлений</strong>
        <p>Создайте первое направление.</p>
      </div>
      <button className="primary-button" type="button" onClick={onCreate}>
        Создать направление
      </button>
    </div>
  );
}

function DirectionToast({ message }: { readonly message: string | null }) {
  return message === null ? null : (
    <p className="direction-toast" role="status">
      {message}
    </p>
  );
}

function SphereOptions({ snapshot }: { readonly snapshot: SpheresSnapshot }) {
  return (
    <>
      {snapshot.active.map((sphere) => (
        <option key={sphere.id.toString()} value={sphere.id.toString()}>
          {sphere.name}
        </option>
      ))}
      {snapshot.archived.map((sphere) => (
        <option key={sphere.id.toString()} value={sphere.id.toString()}>
          {sphere.name} · архив
        </option>
      ))}
    </>
  );
}

function findSphere(snapshot: SpheresSnapshot, id: string | null): Sphere | null {
  if (id === null) return null;
  return (
    [...snapshot.active, ...snapshot.archived].find((sphere) => sphere.id.toString() === id) ?? null
  );
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(
    value,
  );
}

function operationalStateLabel(state: DirectionDetailsSnapshot['operationalState']): string {
  return state === 'moving'
    ? 'Движется'
    : state === 'no_active_project'
      ? 'Нет активной цели'
      : 'Нет исполнения';
}

function formatActualTime(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}
