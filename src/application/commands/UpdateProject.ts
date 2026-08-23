import type { EntityId, Project } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { DecisionsByProjectReader } from '../ports/DecisionsByProjectReader';
import type { ProjectRepository } from '../ports/ProjectRepository';
import {
  projectFailure,
  projectVersionConflict,
  validateProjectReferences,
} from './projectCommandSupport';

export interface UpdateProjectInput {
  readonly id: EntityId;
  readonly expectedVersion: number;
  readonly sphereId?: EntityId | null;
  readonly directionId?: EntityId | null;
  readonly title: string;
  readonly description?: string | null;
  readonly desiredResult?: string | null;
}

export class UpdateProject {
  public constructor(
    readonly repository: ProjectRepository,
    readonly directionRepository: DirectionRepository,
    readonly clock: Clock,
    readonly decisionsByProjectReader?: DecisionsByProjectReader,
  ) {}

  public async execute(input: UpdateProjectInput): Promise<Result<Project, DomainError>> {
    const stored = await this.repository.findById(input.id);
    if (stored === null) return failure(new DomainError('project.not_found', 'Проект не найден.'));
    if (stored.version !== input.expectedVersion) return projectVersionConflict();
    const sphereId = input.sphereId === undefined ? stored.sphereId : input.sphereId;
    const directionId = input.directionId === undefined ? stored.directionId : input.directionId;
    const referenceFailure = await validateProjectReferences(
      this.directionRepository,
      directionId,
      sphereId,
    );
    if (referenceFailure !== null) return referenceFailure;
    if (
      sphereId !== null &&
      !sameOptionalEntityId(stored.sphereId, sphereId) &&
      this.decisionsByProjectReader !== undefined
    ) {
      const decisions = await this.decisionsByProjectReader.findByProjectId(stored.id);
      const hasIncompatibleDecision = decisions.some(
        (decision) => decision.sphereId === null || !decision.sphereId.equals(sphereId),
      );
      if (hasIncompatibleDecision) {
        return failure(
          new DomainError(
            'project.decision_sphere_mismatch',
            'Нельзя изменить сферу проекта: она не совпадает со сферой связанного решения.',
          ),
        );
      }
    }
    try {
      const updated = stored.update(
        {
          title: input.title,
          sphereId,
          directionId,
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.desiredResult === undefined ? {} : { desiredResult: input.desiredResult }),
        },
        this.clock.now(),
      );
      return (await this.repository.updateIfVersionMatches(updated, input.expectedVersion))
        ? success(updated)
        : projectVersionConflict();
    } catch (error: unknown) {
      return projectFailure(error);
    }
  }
}

function sameOptionalEntityId(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}
