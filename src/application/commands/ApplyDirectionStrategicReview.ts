import {
  DIRECTION_STATUS,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
  PROJECT_STATUS,
  Project,
  type Direction,
  type EntityId,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { ProjectRepository } from '../ports/ProjectRepository';

export type StrategicReviewProjectStatus =
  typeof PROJECT_STATUS.active | typeof PROJECT_STATUS.paused | typeof PROJECT_STATUS.archived;

export interface DirectionStrategicReviewProjectChange {
  readonly id: EntityId;
  readonly expectedVersion: number;
  readonly status: StrategicReviewProjectStatus;
}

export interface DirectionStrategicReviewNewProject {
  readonly title: string;
  readonly desiredResult?: string | null;
  readonly makeMain: boolean;
}

export interface ApplyDirectionStrategicReviewInput {
  readonly directionId: EntityId;
  readonly expectedDirectionVersion: number;
  readonly remainsRelevant: boolean;
  readonly strategicIntent: string | null;
  readonly desiredState: string | null;
  readonly projectChanges: readonly DirectionStrategicReviewProjectChange[];
  readonly mainProjectId: EntityId | null;
  readonly newProject: DirectionStrategicReviewNewProject | null;
}

export interface ApplyDirectionStrategicReviewResult {
  readonly direction: Direction;
  readonly directionChanged: boolean;
  readonly projects: readonly Project[];
  readonly mainProject: Project | null;
  readonly reviewedAt: Date;
  readonly changedProjectCount: number;
  readonly createdProject: Project | null;
}

export class ApplyDirectionStrategicReview {
  public constructor(
    readonly directions: DirectionRepository,
    readonly projects: ProjectRepository,
    readonly unitOfWork: JournalUnitOfWork,
    readonly clock: Clock,
    readonly currentDate: CurrentDateProvider,
    readonly ids: IdGenerator,
  ) {}

  public async execute(
    input: ApplyDirectionStrategicReviewInput,
  ): Promise<Result<ApplyDirectionStrategicReviewResult, DomainError>> {
    try {
      const [storedDirection, storedProjects] = await Promise.all([
        this.directions.findById(input.directionId),
        this.projects.findByDirectionId(input.directionId),
      ]);
      if (storedDirection === null) return failure(notFound('direction'));
      if (storedDirection.version !== input.expectedDirectionVersion) return failure(conflict());
      if (storedDirection.status !== DIRECTION_STATUS.active) {
        return failure(
          new DomainError(
            'direction_review.archived_direction',
            'Стратегический обзор доступен только для активного направления.',
          ),
        );
      }

      const now = this.clock.now();
      const nextDirection = input.remainsRelevant
        ? updateDirection(storedDirection, input, now)
        : storedDirection.archive(now);
      const changesById = new Map(
        input.projectChanges.map((change) => [change.id.toString(), change]),
      );
      assertUniqueProjectChanges(input.projectChanges, changesById);

      let nextProjects: readonly Project[] = storedProjects.map((project) => {
        const change = changesById.get(project.id.toString());
        if (change === undefined) return project;
        if (project.version !== change.expectedVersion) throw conflict();
        return moveProject(project, change.status, now);
      });
      for (const change of input.projectChanges) {
        if (!storedProjects.some((project) => project.id.equals(change.id))) {
          throw notFound('project');
        }
      }

      let createdProject: Project | null = null;
      if (input.remainsRelevant && input.newProject !== null) {
        createdProject = Project.create({
          id: this.ids.generate(),
          sphereId: storedDirection.sphereId,
          directionId: storedDirection.id,
          title: input.newProject.title,
          desiredResult: input.newProject.desiredResult ?? null,
          isMain: input.newProject.makeMain,
          now,
        });
        nextProjects = [...nextProjects, createdProject];
      }

      if (!input.remainsRelevant) {
        if (
          input.projectChanges.length > 0 ||
          input.mainProjectId !== null ||
          input.newProject !== null
        ) {
          throw new DomainError(
            'direction_review.archived_with_project_changes',
            'При переносе направления в архив нельзя одновременно менять его цели.',
          );
        }
      } else {
        const requestedMainId =
          createdProject?.isMain === true ? createdProject.id : input.mainProjectId;
        nextProjects = assignMainProject(nextProjects, requestedMainId, now);
      }

      const directionChanged = nextDirection !== storedDirection;
      const changedProjects = nextProjects.filter((project) => {
        const stored = storedProjects.find((candidate) => candidate.id.equals(project.id));
        return stored === undefined || stored !== project;
      });
      const eventId = this.ids.generate();
      const entry = JournalEntry.create({
        id: eventId,
        type: JOURNAL_ENTRY_TYPE.directionStrategicReviewed,
        occurredAt: now,
        effectiveDate: this.currentDate.getCurrentDate(),
        subjectType: JOURNAL_SUBJECT_TYPE.direction,
        subjectId: storedDirection.id,
        sphereId: storedDirection.sphereId,
        labelAtEvent: storedDirection.name,
        metadata: {
          remainsRelevant: input.remainsRelevant,
          directionChanged,
          changedProjectCount: changedProjects.length,
          mainProjectId: nextProjects.find((project) => project.isMain)?.id.toString() ?? null,
        },
        createdAt: now,
      });

      await this.unitOfWork.commit({
        directions: directionChanged
          ? [{ direction: nextDirection, expectedVersion: storedDirection.version }]
          : [],
        projects: changedProjects.map((project) => ({
          project,
          expectedVersion:
            storedProjects.find((candidate) => candidate.id.equals(project.id))?.version ?? null,
        })),
        journalEntries: [entry],
      });

      return success({
        direction: nextDirection,
        directionChanged,
        projects: nextProjects,
        mainProject: nextProjects.find((project) => project.isMain) ?? null,
        reviewedAt: now,
        changedProjectCount: changedProjects.length,
        createdProject,
      });
    } catch (error: unknown) {
      return failure(
        error instanceof DomainError
          ? error
          : new DomainError(
              'direction_review.failed',
              'Стратегический обзор не применён. Исходные данные сохранены.',
              { cause: error },
            ),
      );
    }
  }
}

function updateDirection(
  direction: Direction,
  input: ApplyDirectionStrategicReviewInput,
  now: Date,
): Direction {
  const strategicIntent = input.strategicIntent?.trim() || null;
  const desiredState = input.desiredState?.trim() || null;
  if (direction.strategicIntent === strategicIntent && direction.desiredState === desiredState) {
    return direction;
  }
  return direction.update(
    {
      name: direction.name,
      strategicIntent,
      desiredState,
    },
    now,
  );
}

function moveProject(project: Project, status: StrategicReviewProjectStatus, now: Date): Project {
  if (project.status === status) return project;
  if (status === PROJECT_STATUS.archived) return project.archive(now);
  if (status === PROJECT_STATUS.paused) return project.pause(now);
  if (project.status === PROJECT_STATUS.paused) return project.resume(now);
  throw new DomainError(
    'direction_review.invalid_project_transition',
    'Выбранное изменение состояния цели недоступно.',
  );
}

function assignMainProject(
  projects: readonly Project[],
  mainProjectId: EntityId | null,
  now: Date,
): readonly Project[] {
  if (mainProjectId === null) return projects.map((project) => project.removeMain(now));
  const main = projects.find((project) => project.id.equals(mainProjectId));
  if (main === undefined) throw notFound('project');
  if (main.status !== PROJECT_STATUS.active) {
    throw new DomainError(
      'direction_review.inactive_main_project',
      'Главной можно назначить только активную цель.',
    );
  }
  return projects.map((project) =>
    project.id.equals(mainProjectId) ? project.makeMain(now) : project.removeMain(now),
  );
}

function assertUniqueProjectChanges(
  changes: readonly DirectionStrategicReviewProjectChange[],
  byId: ReadonlyMap<string, DirectionStrategicReviewProjectChange>,
): void {
  if (changes.length !== byId.size) {
    throw new DomainError(
      'direction_review.duplicate_project_change',
      'Одну цель нельзя изменить дважды в одном обзоре.',
    );
  }
}

function conflict(): DomainError {
  return new DomainError(
    'direction_review.version_conflict',
    'Направление или цели уже изменились. Обновите обзор и повторите попытку.',
  );
}

function notFound(entity: 'direction' | 'project'): DomainError {
  return new DomainError(
    `direction_review.${entity}_not_found`,
    entity === 'direction' ? 'Направление не найдено.' : 'Цель направления не найдена.',
  );
}
