import { Project, type EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { ProjectRepository } from '../ports/ProjectRepository';
import { projectFailure, validateProjectReferences } from './projectCommandSupport';

export interface CreateProjectInput {
  readonly sphereId?: EntityId | null;
  readonly directionId?: EntityId | null;
  readonly title: string;
  readonly description?: string | null;
  readonly desiredResult?: string | null;
  readonly makeMain?: boolean;
}

export class CreateProject {
  public constructor(
    readonly repository: ProjectRepository,
    readonly directionRepository: DirectionRepository,
    readonly clock: Clock,
    readonly idGenerator: IdGenerator,
  ) {}

  public async execute(input: CreateProjectInput): Promise<Result<Project, DomainError>> {
    const directionId = input.directionId ?? null;
    const direction =
      directionId === null ? null : await this.directionRepository.findById(directionId);
    if (directionId !== null && direction === null) {
      return failure(
        new DomainError('project.direction_not_found', 'Направление цели не найдено.'),
      );
    }
    if (direction?.status === 'archived') {
      return failure(
        new DomainError(
          'project.archived_direction',
          'Нельзя создать новую цель в архивном направлении.',
        ),
      );
    }
    const sphereId = input.sphereId === undefined ? (direction?.sphereId ?? null) : input.sphereId;
    const referenceFailure = await validateProjectReferences(
      this.directionRepository,
      directionId,
      sphereId,
    );
    if (referenceFailure !== null) return referenceFailure;
    try {
      const now = this.clock.now();
      const project = Project.create({
        id: this.idGenerator.generate(),
        sphereId,
        directionId,
        title: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.desiredResult === undefined ? {} : { desiredResult: input.desiredResult }),
        isMain: input.makeMain ?? false,
        now,
      });
      const created = project.isMain
        ? await this.repository.createAndReplaceMain(project, now)
        : await this.repository.create(project);
      return created
        ? success(project)
        : failure(new DomainError('project.id_conflict', 'Не удалось создать цель.'));
    } catch (error: unknown) {
      return projectFailure(error);
    }
  }
}
