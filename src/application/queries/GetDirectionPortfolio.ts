import {
  ACTION_SESSION_STATUS,
  DECISION_STATUS,
  DayDate,
  LIFE_ACTION_STATUS,
  PROJECT_STATUS,
  type ActionSession,
  type Decision,
  type Direction,
  type EntityId,
  type LifeAction,
  type Project,
  JOURNAL_ENTRY_TYPE,
} from '../../domain';
import type { ActionSessionsByLifeActionIdsReader } from '../ports/ActionSessionsByLifeActionIdsReader';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DecisionsByProjectIdsReader } from '../ports/DecisionsByProjectIdsReader';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { LifeActionsByDecisionIdsReader } from '../ports/LifeActionsByDecisionIdsReader';
import type { ProjectRepository } from '../ports/ProjectRepository';
import type { JournalRepository } from '../ports/JournalRepository';

export const DIRECTION_OPERATIONAL_STATE = {
  moving: 'moving',
  noActiveProject: 'no_active_project',
  noExecution: 'no_execution',
} as const;

export type DirectionOperationalState =
  (typeof DIRECTION_OPERATIONAL_STATE)[keyof typeof DIRECTION_OPERATIONAL_STATE];

export const DIRECTION_BASE_PERIOD_DAYS = [7, 30] as const;

export type DirectionBasePeriodDays = (typeof DIRECTION_BASE_PERIOD_DAYS)[number];

export interface DirectionPulse {
  readonly operationalState: DirectionOperationalState;
  readonly activeProjectCount: number;
  readonly pausedProjectCount: number;
  readonly completedProjectCount: number;
  readonly activeDecisionCount: number;
  readonly unfinishedActionCount: number;
  readonly completedActionCount: number;
  readonly completedSessionCount: number;
  readonly totalActualTimeMs: number;
  readonly lastRealMovementAt: Date | null;
  readonly dynamics: {
    readonly periodDays: DirectionBasePeriodDays;
    readonly startDate: DayDate;
    readonly endDate: DayDate;
    readonly completedActionCount: number;
    readonly completedSessionCount: number;
    readonly actualTimeMs: number;
  };
}

export interface DirectionPortfolioSnapshot {
  readonly direction: Direction;
  readonly mainProject: Project | null;
  readonly activeProjects: readonly Project[];
  readonly pausedProjects: readonly Project[];
  readonly completedProjects: readonly Project[];
  readonly archivedProjects: readonly Project[];
  readonly projects: readonly Project[];
  readonly operationalState: DirectionOperationalState;
  readonly counts: {
    readonly active: number;
    readonly paused: number;
    readonly completed: number;
  };
  readonly pulse: DirectionPulse;
  readonly lastStrategicReviewAt: Date | null;
}

export class GetDirectionPortfolio {
  public constructor(
    readonly directions: DirectionRepository,
    readonly projects: ProjectRepository,
    readonly decisions: DecisionsByProjectIdsReader,
    readonly lifeActions: LifeActionsByDecisionIdsReader,
    readonly actionSessions: ActionSessionsByLifeActionIdsReader,
    readonly currentDate: CurrentDateProvider,
    readonly journal?: JournalRepository,
  ) {}

  public async execute(
    id: EntityId,
    periodDays: DirectionBasePeriodDays = 7,
  ): Promise<DirectionPortfolioSnapshot | null> {
    const [direction, projects] = await Promise.all([
      this.directions.findById(id),
      this.projects.findByDirectionId(id),
    ]);
    if (direction === null) return null;

    const lastReview =
      this.journal === undefined
        ? null
        : await this.journal.findLatestBySubjectAndType(
            direction.id,
            JOURNAL_ENTRY_TYPE.directionStrategicReviewed,
          );

    const active = projects.filter((project) => project.status === PROJECT_STATUS.active);
    const decisions = await this.readDecisions(projects);
    const visibleDecisions = decisions.filter(
      (decision) => !decision.isDeleted() && !decision.isArchived(),
    );
    const lifeActions = await this.readLifeActions(visibleDecisions);
    const actionSessions = await this.readActionSessions(lifeActions);
    const mainProject = active.find((project) => project.isMain) ?? null;
    const activeProjects = active.filter((project) => !project.isMain);
    const pausedProjects = projects.filter((project) => project.status === PROJECT_STATUS.paused);
    const completedProjects = projects.filter(
      (project) => project.status === PROJECT_STATUS.completed,
    );
    const archivedProjects = projects.filter(
      (project) => project.status === PROJECT_STATUS.archived,
    );

    return {
      direction,
      mainProject,
      activeProjects,
      pausedProjects,
      completedProjects,
      archivedProjects,
      projects,
      operationalState: resolveOperationalState(active, visibleDecisions, lifeActions),
      counts: {
        active: active.length,
        paused: pausedProjects.length,
        completed: completedProjects.length,
      },
      pulse: buildPulse(
        active,
        pausedProjects,
        completedProjects,
        visibleDecisions,
        lifeActions,
        actionSessions,
        periodDays,
        this.currentDate.getCurrentDate(),
      ),
      lastStrategicReviewAt: lastReview?.occurredAt ?? null,
    };
  }

  private async readDecisions(projects: readonly Project[]): Promise<readonly Decision[]> {
    return projects.length === 0
      ? []
      : this.decisions.findByProjectIds(projects.map((project) => project.id));
  }

  private async readLifeActions(decisions: readonly Decision[]): Promise<readonly LifeAction[]> {
    return decisions.length === 0
      ? []
      : this.lifeActions.findByDecisionIds(decisions.map((decision) => decision.id));
  }

  private async readActionSessions(
    lifeActions: readonly LifeAction[],
  ): Promise<readonly ActionSession[]> {
    return lifeActions.length === 0
      ? []
      : this.actionSessions.findByLifeActionIds(lifeActions.map((lifeAction) => lifeAction.id));
  }
}

function resolveOperationalState(
  activeProjects: readonly Project[],
  decisions: readonly Decision[],
  lifeActions: readonly LifeAction[],
): DirectionOperationalState {
  if (activeProjects.length === 0) return DIRECTION_OPERATIONAL_STATE.noActiveProject;
  const activeProjectIds = new Set(activeProjects.map((project) => project.id.toString()));
  const hasWorkingDecision = decisions.some(
    (decision) =>
      decision.projectId !== null &&
      activeProjectIds.has(decision.projectId.toString()) &&
      (decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress),
  );
  const workingDecisionIds = new Set(
    decisions
      .filter(
        (decision) =>
          decision.projectId !== null && activeProjectIds.has(decision.projectId.toString()),
      )
      .map((decision) => decision.id.toString()),
  );
  const hasWorkingAction = lifeActions.some(
    (action) =>
      action.decisionId !== null &&
      workingDecisionIds.has(action.decisionId.toString()) &&
      (action.status === LIFE_ACTION_STATUS.ready ||
        action.status === LIFE_ACTION_STATUS.inProgress),
  );
  return hasWorkingDecision || hasWorkingAction
    ? DIRECTION_OPERATIONAL_STATE.moving
    : DIRECTION_OPERATIONAL_STATE.noExecution;
}

function buildPulse(
  activeProjects: readonly Project[],
  pausedProjects: readonly Project[],
  completedProjects: readonly Project[],
  decisions: readonly Decision[],
  lifeActions: readonly LifeAction[],
  actionSessions: readonly ActionSession[],
  periodDays: DirectionBasePeriodDays,
  endDate: DayDate,
): DirectionPulse {
  const activeDecisions = decisions.filter(
    (decision) =>
      decision.status === DECISION_STATUS.planned || decision.status === DECISION_STATUS.inProgress,
  );
  const visibleActions = lifeActions.filter((action) => !action.isArchived());
  const unfinishedActions = visibleActions.filter(
    (action) =>
      action.status === LIFE_ACTION_STATUS.draft ||
      action.status === LIFE_ACTION_STATUS.ready ||
      action.status === LIFE_ACTION_STATUS.inProgress,
  );
  const completedActions = lifeActions.filter(
    (action) => action.status === LIFE_ACTION_STATUS.completed && action.completedAt !== null,
  );
  const completedSessions = actionSessions.filter(
    (session): session is ActionSession & { readonly completedAt: Date } =>
      session.status === ACTION_SESSION_STATUS.completed && session.completedAt !== null,
  );
  const startDate = shiftDayDate(endDate, -(periodDays - 1));
  const periodActions = completedActions.filter((action) =>
    isDateInPeriod(action.completedAt, startDate, endDate),
  );
  const periodSessions = completedSessions.filter((session) =>
    isDateInPeriod(session.completedAt, startDate, endDate),
  );

  return {
    operationalState: resolveOperationalState(activeProjects, decisions, lifeActions),
    activeProjectCount: activeProjects.length,
    pausedProjectCount: pausedProjects.length,
    completedProjectCount: completedProjects.length,
    activeDecisionCount: activeDecisions.length,
    unfinishedActionCount: unfinishedActions.length,
    completedActionCount: completedActions.length,
    completedSessionCount: completedSessions.length,
    totalActualTimeMs: sumSessionTime(completedSessions),
    lastRealMovementAt: latestRealMovement(lifeActions, actionSessions),
    dynamics: {
      periodDays,
      startDate,
      endDate,
      completedActionCount: periodActions.length,
      completedSessionCount: periodSessions.length,
      actualTimeMs: sumSessionTime(periodSessions),
    },
  };
}

function sumSessionTime(
  sessions: readonly (ActionSession & { readonly completedAt: Date })[],
): number {
  return sessions.reduce(
    (total, session) => total + session.workedDurationAt(session.completedAt),
    0,
  );
}

function latestRealMovement(
  lifeActions: readonly LifeAction[],
  actionSessions: readonly ActionSession[],
): Date | null {
  const timestamps = [
    ...lifeActions.flatMap((action) => [action.startedAt, action.completedAt]),
    ...actionSessions.flatMap((session) => [session.startedAt, session.completedAt]),
  ].filter((value): value is Date => value !== null);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps.map((value) => value.getTime())));
}

function isDateInPeriod(value: Date | null, startDate: DayDate, endDate: DayDate): boolean {
  if (value === null) return false;
  const date = DayDate.fromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  return !date.isBefore(startDate) && !date.isAfter(endDate);
}

function shiftDayDate(date: DayDate, days: number): DayDate {
  const [year, month, day] = date.toString().split('-').map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day!));
  value.setUTCDate(value.getUTCDate() + days);
  return DayDate.fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}
