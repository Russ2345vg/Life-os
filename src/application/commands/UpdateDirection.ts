import type { Direction, EntityId } from '../../domain';
import type { DirectionBalanceSettings } from '../../domain/balance/BalanceImportance';
import type { DirectionStatus } from '../../domain/direction/DirectionStatus';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { ProjectRepository } from '../ports/ProjectRepository';
import { changeDirection } from './directionCommandSupport';

export interface UpdateDirectionInput extends DirectionBalanceSettings {
  readonly status?: DirectionStatus;
  readonly id: EntityId;
  readonly expectedVersion: number;
  readonly sphereId?: EntityId | null;
  readonly name: string;
  readonly description?: string | null;
  readonly strategicIntent?: string | null;
  readonly desiredState?: string | null;
  readonly inScope?: string | null;
  readonly outOfScope?: string | null;
}

export class UpdateDirection {
  public constructor(
    readonly repository: DirectionRepository,
    readonly projectRepository: ProjectRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: UpdateDirectionInput): Promise<Result<Direction, DomainError>> {
    const stored = await this.repository.findById(input.id);
    if (stored === null) {
      return failure(new DomainError('direction.not_found', 'Направление не найдено.'));
    }
    const nextSphereId = input.sphereId === undefined ? stored.sphereId : input.sphereId;
    if (!sameEntityId(stored.sphereId, nextSphereId)) {
      const projects = await this.projectRepository.findByDirectionId(input.id);
      const hasConflict = projects.some((project) => !sameEntityId(project.sphereId, nextSphereId));
      if (hasConflict) {
        return failure(
          new DomainError(
            'direction.sphere_has_incompatible_projects',
            'Сферу нельзя изменить: у направления есть цели из другой сферы. Сначала измените связи целей.',
          ),
        );
      }
    }
    return changeDirection(this.repository, this.clock, input, (direction, now) =>
      direction.update(
        {
          ...input,
          name: input.name,
          ...(input.sphereId === undefined ? {} : { sphereId: input.sphereId }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.strategicIntent === undefined
            ? {}
            : { strategicIntent: input.strategicIntent }),
          ...(input.desiredState === undefined ? {} : { desiredState: input.desiredState }),
          ...(input.inScope === undefined ? {} : { inScope: input.inScope }),
          ...(input.outOfScope === undefined ? {} : { outOfScope: input.outOfScope }),
        },
        now,
      ),
    );
  }
}

function sameEntityId(left: EntityId | null, right: EntityId | null): boolean {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}
