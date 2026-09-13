import { GoalManagementPanel } from '../goals/GoalManagementPanel';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import type {
  ArchiveDirection,
  ArchiveGoal,
  ArchiveProject,
  CompleteProject,
  CreateDirection,
  CreateGoal,
  CreateProject,
  DeletePilotGoal,
  CreateDecisionForDate,
  GetDirectionDetails,
  GetDirections,
  GetDirectionsOverview,
  GetGoalById,
  GetGoals,
  GetManagementOverview,
  GetProjects,
  GetProjectLifeActions,
  GetSpheres,
  MakeDirectionMain,
  MakeProjectMain,
  PauseProject,
  RestoreDirection,
  RestoreProject,
  ResumeProject,
  UpdateDirection,
  UpdateGoal,
  UpdateProject,
  ApplyDirectionStrategicReview,
} from '../../application';
import type { DayDate } from '../../domain';
import type { GoalAlbumRoute } from '../goals/GoalAlbumNavigation';
import { ManagementDaySection } from './ManagementDaySection';
import { ManagementNavigation } from './ManagementNavigation';
import { MANAGEMENT_SECTION, type ManagementSection } from './ManagementSection';
import { ManagementOverview } from './ManagementOverview';
import {
  INITIAL_MANAGEMENT_NAVIGATION,
  openManagementSection,
  popManagementRoute,
  pushManagementRoute,
} from './managementRouting';

const DirectionsSection = lazy(() =>
  import('./DirectionsSection').then((module) => ({ default: module.DirectionsSection })),
);
const GoalAlbumPage = lazy(() =>
  import('../goals/GoalAlbumPage').then((module) => ({ default: module.GoalAlbumPage })),
);

interface ManagementPageProps {
  readonly createDirection: Pick<CreateDirection, 'execute'>;
  readonly updateDirection: Pick<UpdateDirection, 'execute'>;
  readonly archiveDirection: Pick<ArchiveDirection, 'execute'>;
  readonly restoreDirection: Pick<RestoreDirection, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getDirectionsOverview: Pick<GetDirectionsOverview, 'execute'>;
  readonly getManagementOverview: Pick<GetManagementOverview, 'execute'>;
  readonly getDirectionDetails: Pick<GetDirectionDetails, 'execute'>;
  readonly applyDirectionStrategicReview: Pick<ApplyDirectionStrategicReview, 'execute'>;
  readonly makeDirectionMain: Pick<MakeDirectionMain, 'execute'>;
  readonly createProject: Pick<CreateProject, 'execute'>;
  readonly updateProject: Pick<UpdateProject, 'execute'>;
  readonly archiveProject: Pick<ArchiveProject, 'execute'>;
  readonly restoreProject: Pick<RestoreProject, 'execute'>;
  readonly completeProject: Pick<CompleteProject, 'execute'>;
  readonly pauseProject: Pick<PauseProject, 'execute'>;
  readonly resumeProject: Pick<ResumeProject, 'execute'>;
  readonly makeProjectMain: Pick<MakeProjectMain, 'execute'>;
  readonly getProjects: Pick<GetProjects, 'execute'>;
  readonly getProjectLifeActions: Pick<GetProjectLifeActions, 'execute'>;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
  readonly currentDate: DayDate;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getGoalById: Pick<GetGoalById, 'execute'>;
  readonly createGoal: Pick<CreateGoal, 'execute'>;
  readonly updateGoal: Pick<UpdateGoal, 'execute'>;
  readonly archiveGoal: Pick<ArchiveGoal, 'execute'>;
  readonly deleteGoal: Pick<DeletePilotGoal, 'execute'>;
  readonly goalRoute: GoalAlbumRoute;
  readonly onGoalRouteChange: (route: GoalAlbumRoute) => void;
  readonly onLeaveGoalAlbum: () => void;
  readonly renderDecisionsPage: (initialDecisionId: string | null) => ReactNode;
  readonly actionsPage: ReactNode;
  readonly todayPage: ReactNode;
  readonly onOpenDay: () => void;
  readonly initialProjectId?: string | null;
  readonly initialSection?: ManagementSection | undefined;
}

export function ManagementPage(props: ManagementPageProps) {
  const [navigation, setNavigation] = useState(() =>
    props.initialProjectId !== undefined && props.initialProjectId !== null
      ? pushManagementRoute(openManagementSection(MANAGEMENT_SECTION.projects), {
          section: MANAGEMENT_SECTION.projects,
          directionId: null,
          projectId: props.initialProjectId,
          decisionId: null,
        })
      : props.initialSection === undefined
        ? INITIAL_MANAGEMENT_NAVIGATION
        : openManagementSection(props.initialSection),
  );
  const { route } = navigation;

  function openSection(section: ManagementSection): void {
    if (section === MANAGEMENT_SECTION.projects) section = MANAGEMENT_SECTION.goals;
    if (section === MANAGEMENT_SECTION.goals) {
      props.onGoalRouteChange({ view: 'album' });
    } else {
      props.onLeaveGoalAlbum();
    }
    if (section === MANAGEMENT_SECTION.day) {
      props.onOpenDay();
    }
    setNavigation(openManagementSection(section));
  }

  function openNested(nextRoute: Parameters<typeof pushManagementRoute>[1]): void {
    if (nextRoute.section === MANAGEMENT_SECTION.projects) {
      props.onGoalRouteChange(
        nextRoute.projectId ? { view: 'detail', goalId: nextRoute.projectId } : { view: 'album' },
      );
      setNavigation(openManagementSection(MANAGEMENT_SECTION.goals));
      return;
    }
    setNavigation((current) => pushManagementRoute(current, nextRoute));
  }

  function goBack(): void {
    setNavigation((current) => popManagementRoute(current));
  }

  return (
    <div className="management-page">
      <ManagementNavigation
        activeSection={
          route.section === MANAGEMENT_SECTION.projects ? MANAGEMENT_SECTION.goals : route.section
        }
        onOpenSection={openSection}
      />
      <div className="management-page-content">
        <Suspense
          fallback={
            <p className="management-loading" role="status">
              Загружаем раздел…
            </p>
          }
        >
          {route.section === MANAGEMENT_SECTION.overview ? (
            <ManagementOverview
              getManagementOverview={props.getManagementOverview}
              currentDate={props.currentDate}
              onOpenSection={openSection}
              onOpenProject={(projectId) =>
                openNested({
                  section: MANAGEMENT_SECTION.projects,
                  directionId: null,
                  projectId,
                  decisionId: null,
                })
              }
              onOpenDirection={(directionId) =>
                openNested({
                  section: MANAGEMENT_SECTION.directions,
                  directionId,
                  projectId: null,
                  decisionId: null,
                })
              }
              onOpenDecision={(decisionId) =>
                openNested({
                  section: MANAGEMENT_SECTION.decisions,
                  directionId: null,
                  projectId: null,
                  decisionId,
                })
              }
            />
          ) : null}
          {route.section === MANAGEMENT_SECTION.directions ? (
            <DirectionsSection
              createDirection={props.createDirection}
              updateDirection={props.updateDirection}
              archiveDirection={props.archiveDirection}
              restoreDirection={props.restoreDirection}
              makeDirectionMain={props.makeDirectionMain}
              makeProjectMain={props.makeProjectMain}
              createProject={props.createProject}
              getDirectionsOverview={props.getDirectionsOverview}
              getDirectionDetails={props.getDirectionDetails}
              applyDirectionStrategicReview={props.applyDirectionStrategicReview}
              getSpheres={props.getSpheres}
              initialSelectedDirectionId={route.directionId}
              onBackFromInitialDetail={route.directionId === null ? undefined : goBack}
              onOpenProject={(projectId) =>
                openNested({
                  section: MANAGEMENT_SECTION.projects,
                  directionId: null,
                  projectId,
                  decisionId: null,
                })
              }
            />
          ) : null}
          {route.section === MANAGEMENT_SECTION.goals ||
          route.section === MANAGEMENT_SECTION.projects ? (
            <GoalAlbumPage
              renderManagement={(goal, onChanged) => (
                <GoalManagementPanel {...props} goal={goal} onChanged={onChanged} />
              )}
              route={
                route.section === MANAGEMENT_SECTION.projects
                  ? route.projectId
                    ? { view: 'detail', goalId: route.projectId }
                    : { view: 'album' }
                  : props.goalRoute
              }
              getGoals={props.getGoals}
              getDirections={props.getDirections}
              getSpheres={props.getSpheres}
              getGoalById={props.getGoalById}
              createGoal={props.createGoal}
              updateGoal={props.updateGoal}
              archiveGoal={props.archiveGoal}
              deleteGoal={props.deleteGoal}
              onRouteChange={(next) => {
                props.onGoalRouteChange(next);
                setNavigation(openManagementSection(MANAGEMENT_SECTION.goals));
              }}
            />
          ) : null}
          {route.section === MANAGEMENT_SECTION.decisions
            ? props.renderDecisionsPage(route.decisionId)
            : null}
          {route.section === MANAGEMENT_SECTION.actions ? props.actionsPage : null}
          {route.section === MANAGEMENT_SECTION.day ? (
            <ManagementDaySection>{props.todayPage}</ManagementDaySection>
          ) : null}
        </Suspense>
      </div>
    </div>
  );
}
