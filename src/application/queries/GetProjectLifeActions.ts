import {
  PROJECT_STATUS,
  type ActionSession,
  type Decision,
  type EntityId,
  type LifeAction,
  type Project,
  type ProjectStatus,
} from '../../domain';
import type { ActionSessionsByLifeActionIdsReader } from '../ports/ActionSessionsByLifeActionIdsReader';
import type { DecisionsByProjectReader } from '../ports/DecisionsByProjectReader';
import type { LifeActionsByDecisionIdsReader } from '../ports/LifeActionsByDecisionIdsReader';
import type { ProjectRepository } from '../ports/ProjectRepository';

export const PROJECT_HISTORY_EVENT_KIND = {
  projectCreated: 'project_created',
  decisionCreated: 'decision_created',
  lifeActionCompleted: 'life_action_completed',
  actionSessionCompleted: 'action_session_completed',
  decisionConfirmed: 'decision_confirmed',
  projectStatusChanged: 'project_status_changed',
} as const;

export type ProjectHistoryEventKind =
  (typeof PROJECT_HISTORY_EVENT_KIND)[keyof typeof PROJECT_HISTORY_EVENT_KIND];

export interface ProjectHistoryEvent {
  readonly id: string;
  readonly kind: ProjectHistoryEventKind;
  readonly occurredAt: Date;
  readonly subjectTitle: string;
  readonly projectStatus: ProjectStatus | null;
}

export interface ProjectHistorySummary {
  readonly decisionCount: number;
  readonly completedLifeActionCount: number;
  readonly completedActionSessionCount: number;
  readonly totalActionDurationMs: number;
}

export interface ProjectLifeActionsSnapshot {
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly history: readonly ProjectHistoryEvent[];
  readonly summary: ProjectHistorySummary;
}

export class GetProjectLifeActions {
  public constructor(
    readonly decisions: DecisionsByProjectReader,
    readonly lifeActions: LifeActionsByDecisionIdsReader,
    readonly actionSessions: ActionSessionsByLifeActionIdsReader,
    readonly projects: Pick<ProjectRepository, 'findById'>,
  ) {}

  public async execute(projectId: EntityId): Promise<ProjectLifeActionsSnapshot> {
    const [project, decisions] = await Promise.all([
      this.projects.findById(projectId),
      this.decisions.findByProjectId(projectId),
    ]);
    const activeDecisions = decisions.filter((decision) => !decision.isDeleted());
    const decisionIds = activeDecisions.map((decision) => decision.id);
    const lifeActions =
      decisionIds.length === 0 ? [] : await this.lifeActions.findByDecisionIds(decisionIds);
    const actionSessions =
      lifeActions.length === 0
        ? []
        : await this.actionSessions.findByLifeActionIds(
            lifeActions.map((lifeAction) => lifeAction.id),
          );
    const sortedLifeActions = [...lifeActions].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    return {
      decisions: activeDecisions,
      lifeActions: sortedLifeActions,
      history: buildHistory(project, activeDecisions, sortedLifeActions, actionSessions),
      summary: buildSummary(activeDecisions, sortedLifeActions, actionSessions),
    };
  }
}

function buildHistory(
  project: Project | null,
  decisions: readonly Decision[],
  lifeActions: readonly LifeAction[],
  actionSessions: readonly ActionSession[],
): readonly ProjectHistoryEvent[] {
  const events: ProjectHistoryEvent[] = [];
  const lifeActionTitles = new Map(
    lifeActions.map((lifeAction) => [lifeAction.id.toString(), lifeAction.title.toString()]),
  );

  if (project !== null) {
    events.push({
      id: `project-created:${project.id.toString()}`,
      kind: PROJECT_HISTORY_EVENT_KIND.projectCreated,
      occurredAt: project.createdAt,
      subjectTitle: project.title,
      projectStatus: null,
    });
    if (
      project.status !== PROJECT_STATUS.active &&
      project.updatedAt.getTime() > project.createdAt.getTime()
    ) {
      events.push({
        id: `project-status:${project.id.toString()}:${project.updatedAt.toISOString()}`,
        kind: PROJECT_HISTORY_EVENT_KIND.projectStatusChanged,
        occurredAt: project.updatedAt,
        subjectTitle: project.title,
        projectStatus: project.status,
      });
    }
  }

  for (const decision of decisions) {
    events.push({
      id: `decision-created:${decision.id.toString()}`,
      kind: PROJECT_HISTORY_EVENT_KIND.decisionCreated,
      occurredAt: decision.createdAt,
      subjectTitle: decision.title.toString(),
      projectStatus: null,
    });
    const confirmedAt = decision.confirmedAt;
    if (confirmedAt !== null) {
      events.push({
        id: `decision-confirmed:${decision.id.toString()}`,
        kind: PROJECT_HISTORY_EVENT_KIND.decisionConfirmed,
        occurredAt: confirmedAt,
        subjectTitle: decision.title.toString(),
        projectStatus: null,
      });
    }
  }

  for (const lifeAction of lifeActions) {
    const completedAt = lifeAction.completedAt;
    if (completedAt !== null) {
      events.push({
        id: `life-action-completed:${lifeAction.id.toString()}`,
        kind: PROJECT_HISTORY_EVENT_KIND.lifeActionCompleted,
        occurredAt: completedAt,
        subjectTitle: lifeAction.title.toString(),
        projectStatus: null,
      });
    }
  }

  for (const session of actionSessions) {
    const completedAt = session.completedAt;
    if (completedAt !== null) {
      events.push({
        id: `action-session-completed:${session.id.toString()}`,
        kind: PROJECT_HISTORY_EVENT_KIND.actionSessionCompleted,
        occurredAt: completedAt,
        subjectTitle: lifeActionTitles.get(session.lifeActionId.toString()) ?? 'Действие',
        projectStatus: null,
      });
    }
  }

  return events.sort(
    (left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() || left.id.localeCompare(right.id),
  );
}

function buildSummary(
  decisions: readonly Decision[],
  lifeActions: readonly LifeAction[],
  actionSessions: readonly ActionSession[],
): ProjectHistorySummary {
  const completedLifeActions = lifeActions.filter((lifeAction) => lifeAction.completedAt !== null);
  const completedActionSessions = actionSessions.filter(
    (session): session is ActionSession & { readonly completedAt: Date } =>
      session.completedAt !== null,
  );

  return {
    decisionCount: decisions.length,
    completedLifeActionCount: completedLifeActions.length,
    completedActionSessionCount: completedActionSessions.length,
    totalActionDurationMs: completedActionSessions.reduce(
      (total, session) => total + session.workedDurationAt(session.completedAt),
      0,
    ),
  };
}
