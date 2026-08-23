import { lazy, Suspense, useState, type ReactNode } from 'react';
import type {
  ArchiveDirection,
  ArchiveProject,
  CompleteProject,
  CreateDirection,
  CreateProject,
  CreateDecisionForDate,
  GetDirectionDetails,
  GetDirections,
  GetDirectionsOverview,
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
  UpdateProject,
  ApplyDirectionStrategicReview,
} from '../../application';
import type { DayDate } from '../../domain';
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
const ProjectsSection = lazy(() =>
  import('./ProjectsSection').then((module) => ({ default: module.ProjectsSection })),
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
  readonly renderDecisionsPage: (initialDecisionId: string | null) => ReactNode;
  readonly actionsPage: ReactNode;
  readonly todayPage: ReactNode;
  readonly onOpenDay: () => void;
  readonly initialProjectId?: string | null;
}

export function ManagementPage(props: ManagementPageProps) {
  const [navigation, setNavigation] = useState(() =>
    props.initialProjectId === undefined || props.initialProjectId === null
      ? INITIAL_MANAGEMENT_NAVIGATION
      : pushManagementRoute(openManagementSection(MANAGEMENT_SECTION.projects), {
          section: MANAGEMENT_SECTION.projects,
          directionId: null,
          projectId: props.initialProjectId,
          decisionId: null,
        }),
  );
  const { route } = navigation;

  function openSection(section: ManagementSection): void {
    if (section === MANAGEMENT_SECTION.day) {
      props.onOpenDay();
    }
    setNavigation(openManagementSection(section));
  }

  function openNested(nextRoute: Parameters<typeof pushManagementRoute>[1]): void {
    setNavigation((current) => pushManagementRoute(current, nextRoute));
  }

  function goBack(): void {
    setNavigation((current) => popManagementRoute(current));
  }

  return (
    <div className="management-page">
      <ManagementNavigation activeSection={route.section} onOpenSection={openSection} />
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
              onOpenProject={(projectId, directionId) => {
                setNavigation((current) =>
                  pushManagementRoute(
                    current,
                    {
                      section: MANAGEMENT_SECTION.projects,
                      directionId: null,
                      projectId,
                      decisionId: null,
                    },
                    {
                      section: MANAGEMENT_SECTION.directions,
                      directionId,
                      projectId: null,
                      decisionId: null,
                    },
                  ),
                );
              }}
            />
          ) : null}
          {route.section === MANAGEMENT_SECTION.projects ? (
            <ProjectsSection
              createProject={props.createProject}
              updateProject={props.updateProject}
              archiveProject={props.archiveProject}
              restoreProject={props.restoreProject}
              completeProject={props.completeProject}
              pauseProject={props.pauseProject}
              resumeProject={props.resumeProject}
              makeProjectMain={props.makeProjectMain}
              getProjects={props.getProjects}
              getProjectLifeActions={props.getProjectLifeActions}
              createDecisionForDate={props.createDecisionForDate}
              currentDate={props.currentDate}
              getDirections={props.getDirections}
              getSpheres={props.getSpheres}
              selectedProjectId={route.projectId}
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
              onBack={goBack}
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
