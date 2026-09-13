import {
  ACTION_SESSION_STATUS,
  DECISION_KIND,
  DECISION_STATUS,
  DIRECTION_STATUS,
  LIFE_ACTION_STATUS,
  PROJECT_STATUS,
  type ActionSession,
  type DayDate,
  type Decision,
  type Direction,
  type LifeAction,
  type Project,
} from '../../domain';

export const MANAGEMENT_SIGNAL_KIND = {
  mainProjectWithoutActiveDecisions: 'main_project_without_active_decisions',
  activeProjectWithoutDecisions: 'active_project_without_decisions',
  decisionWithoutUnfinishedActions: 'decision_without_unfinished_actions',
  mainDirectionWithoutActiveProjects: 'main_direction_without_active_projects',
  focusUndefined: 'focus_undefined',
  inactiveMainProject: 'inactive_main_project',
} as const;

export type ManagementSignalKind =
  (typeof MANAGEMENT_SIGNAL_KIND)[keyof typeof MANAGEMENT_SIGNAL_KIND];

export type ManagementOverviewFocus =
  | {
      readonly kind: 'project';
      readonly id: string;
      readonly title: string;
      readonly desiredResult: string | null;
      readonly directionName: string | null;
    }
  | { readonly kind: 'direction'; readonly id: string; readonly title: string }
  | { readonly kind: 'empty' };

export interface ManagementOverviewToday {
  readonly mainDecision: { readonly id: string; readonly title: string } | null;
  readonly decisionCount: number;
  readonly actionCount: number;
  readonly currentSession: {
    readonly actionId: string;
    readonly actionTitle: string | null;
    readonly status: typeof ACTION_SESSION_STATUS.running | typeof ACTION_SESSION_STATUS.paused;
  } | null;
}

export interface ManagementOverviewSignal {
  readonly kind: ManagementSignalKind;
  readonly directionId: string | null;
  readonly projectId: string | null;
  readonly decisionId: string | null;
  readonly title: string;
  readonly detail: string;
}

export interface ManagementOverviewSnapshot {
  readonly focus: ManagementOverviewFocus;
  readonly today: ManagementOverviewToday;
  readonly course: {
    readonly activeDirectionCount: number;
    readonly activeProjectCount: number;
  };
  readonly signals: readonly ManagementOverviewSignal[];
}

interface CollectionReader<T> {
  findAll(): Promise<readonly T[]>;
}

interface UnfinishedSessionReader {
  findUnfinished(): Promise<ActionSession | null>;
}

export class GetManagementOverview {
  public constructor(
    readonly directions: CollectionReader<Direction>,
    readonly projects: CollectionReader<Project>,
    readonly decisions: CollectionReader<Decision>,
    readonly lifeActions: CollectionReader<LifeAction>,
    readonly sessions: UnfinishedSessionReader,
  ) {}

  public async execute(currentDate: DayDate): Promise<ManagementOverviewSnapshot> {
    const [directions, projects, decisions, lifeActions, currentSession] = await Promise.all([
      this.directions.findAll(),
      this.projects.findAll(),
      this.decisions.findAll(),
      this.lifeActions.findAll(),
      this.sessions.findUnfinished(),
    ]);
    const visibleDecisions = decisions.filter((decision) => !decision.isDeleted());

    return {
      focus: selectFocus(directions, projects),
      today: buildToday(currentDate, visibleDecisions, lifeActions, currentSession),
      course: {
        activeDirectionCount: directions.filter(
          (direction) => direction.status === DIRECTION_STATUS.active,
        ).length,
        activeProjectCount: projects.filter((project) => project.status === PROJECT_STATUS.active)
          .length,
      },
      signals: buildSignals(directions, projects, visibleDecisions, lifeActions),
    };
  }
}

function selectFocus(
  directions: readonly Direction[],
  projects: readonly Project[],
): ManagementOverviewFocus {
  const mainProject = projects.find(
    (project) => project.isMain && project.status === PROJECT_STATUS.active,
  );
  if (mainProject !== undefined) {
    const directionId = mainProject.directionId;
    const direction =
      directionId === null ? undefined : directions.find((item) => item.id.equals(directionId));
    return {
      kind: 'project',
      id: mainProject.id.toString(),
      title: mainProject.title,
      desiredResult: mainProject.desiredResult,
      directionName: direction?.name ?? null,
    };
  }

  const mainDirection = directions.find(
    (direction) => direction.isMain && direction.status === DIRECTION_STATUS.active,
  );
  return mainDirection === undefined
    ? { kind: 'empty' }
    : { kind: 'direction', id: mainDirection.id.toString(), title: mainDirection.name };
}

function buildToday(
  currentDate: DayDate,
  decisions: readonly Decision[],
  lifeActions: readonly LifeAction[],
  currentSession: ActionSession | null,
): ManagementOverviewToday {
  const todayDecisions = decisions.filter((decision) => decision.isScheduledFor(currentDate));
  const mainDecision = todayDecisions
    .filter((decision) => decision.kind === DECISION_KIND.main)
    .sort(
      (left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER),
    )[0];
  const todayActions = lifeActions.filter((action) => action.isScheduledFor(currentDate));
  const sessionAction =
    currentSession === null
      ? undefined
      : lifeActions.find((action) => action.id.equals(currentSession.lifeActionId));

  return {
    mainDecision:
      mainDecision === undefined
        ? null
        : { id: mainDecision.id.toString(), title: mainDecision.title.toString() },
    decisionCount: todayDecisions.length,
    actionCount: todayActions.length,
    currentSession:
      currentSession === null
        ? null
        : {
            actionId: currentSession.lifeActionId.toString(),
            actionTitle: sessionAction?.title.toString() ?? null,
            status: currentSession.isPaused()
              ? ACTION_SESSION_STATUS.paused
              : ACTION_SESSION_STATUS.running,
          },
  };
}

function buildSignals(
  directions: readonly Direction[],
  projects: readonly Project[],
  decisions: readonly Decision[],
  lifeActions: readonly LifeAction[],
): readonly ManagementOverviewSignal[] {
  const signals: ManagementOverviewSignal[] = [];
  const activeProjects = projects.filter((project) => project.status === PROJECT_STATUS.active);
  const activeDecisions = decisions.filter(isActiveDecision);
  const decisionProjectIds = new Set(
    decisions.flatMap((decision) =>
      decision.projectId === null ? [] : [decision.projectId.toString()],
    ),
  );
  const activeDecisionProjectIds = new Set(
    activeDecisions.flatMap((decision) =>
      decision.projectId === null ? [] : [decision.projectId.toString()],
    ),
  );
  const unfinishedActionDecisionIds = new Set(
    lifeActions.flatMap((action) =>
      action.decisionId === null || !isUnfinishedAction(action)
        ? []
        : [action.decisionId.toString()],
    ),
  );
  const mainProject = activeProjects.find((project) => project.isMain);
  const mainDirection = directions.find(
    (direction) => direction.isMain && direction.status === DIRECTION_STATUS.active,
  );
  const activeProjectDirectionIds = new Set(
    activeProjects.flatMap((project) =>
      project.directionId === null ? [] : [project.directionId.toString()],
    ),
  );
  const inactiveMainProjects = projects.filter(
    (project) =>
      project.isMain &&
      (project.status === PROJECT_STATUS.paused || project.status === PROJECT_STATUS.completed),
  );

  if (mainProject !== undefined && !activeDecisionProjectIds.has(mainProject.id.toString())) {
    signals.push({
      kind: MANAGEMENT_SIGNAL_KIND.mainProjectWithoutActiveDecisions,
      directionId: null,
      projectId: mainProject.id.toString(),
      decisionId: null,
      title: 'Главная цель без активных решений',
      detail: mainProject.title,
    });
  }

  for (const project of activeProjects) {
    if (project.isMain || decisionProjectIds.has(project.id.toString())) continue;
    signals.push({
      kind: MANAGEMENT_SIGNAL_KIND.activeProjectWithoutDecisions,
      directionId: null,
      projectId: project.id.toString(),
      decisionId: null,
      title: 'Активный цель без решений',
      detail: project.title,
    });
  }

  for (const decision of activeDecisions) {
    if (unfinishedActionDecisionIds.has(decision.id.toString())) continue;
    signals.push({
      kind: MANAGEMENT_SIGNAL_KIND.decisionWithoutUnfinishedActions,
      directionId: null,
      projectId: null,
      decisionId: decision.id.toString(),
      title: 'Решение без незавершённых действий',
      detail: decision.title.toString(),
    });
  }

  if (mainDirection !== undefined && !activeProjectDirectionIds.has(mainDirection.id.toString())) {
    signals.push({
      kind: MANAGEMENT_SIGNAL_KIND.mainDirectionWithoutActiveProjects,
      directionId: mainDirection.id.toString(),
      projectId: null,
      decisionId: null,
      title: 'Главное направление без активных целей',
      detail: mainDirection.name,
    });
  }

  if (selectFocus(directions, projects).kind === 'empty') {
    signals.push({
      kind: MANAGEMENT_SIGNAL_KIND.focusUndefined,
      directionId: null,
      projectId: null,
      decisionId: null,
      title: 'Фокус не определён',
      detail: 'Нет главной цели или главного направления.',
    });
  }

  for (const project of inactiveMainProjects) {
    signals.push({
      kind: MANAGEMENT_SIGNAL_KIND.inactiveMainProject,
      directionId: null,
      projectId: project.id.toString(),
      decisionId: null,
      title: 'Неактивный цель назначен главным',
      detail: project.title,
    });
  }

  return deduplicateSignals(signals);
}

function deduplicateSignals(
  signals: readonly ManagementOverviewSignal[],
): readonly ManagementOverviewSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const targetId = signal.decisionId ?? signal.projectId ?? signal.directionId ?? 'focus';
    const key = `${signal.kind}:${targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isActiveDecision(decision: Decision): boolean {
  return (
    decision.status === DECISION_STATUS.planned || decision.status === DECISION_STATUS.inProgress
  );
}

function isUnfinishedAction(action: LifeAction): boolean {
  return (
    action.status === LIFE_ACTION_STATUS.draft ||
    action.status === LIFE_ACTION_STATUS.ready ||
    action.status === LIFE_ACTION_STATUS.inProgress
  );
}
