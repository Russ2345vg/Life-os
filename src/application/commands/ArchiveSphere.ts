import type { EntityId, Sphere } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { SphereRepository } from '../ports/SphereRepository';
import {
  sphereFailure,
  sphereNotFound,
  sphereVersionConflict,
  validSphereExpectedVersion,
} from './sphereCommandSupport';

export interface ArchiveSphereInput {
  readonly id: EntityId;
  readonly expectedVersion: number;
}

export class ArchiveSphere {
  public constructor(
    readonly repository: SphereRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: ArchiveSphereInput): Promise<Result<Sphere, DomainError>> {
    if (!validSphereExpectedVersion(input.expectedVersion)) {
      return failure(
        new DomainError('sphere.invalid_expected_version', 'Версия сферы указана неверно.'),
      );
    }
    const stored = await this.repository.findById(input.id);
    if (stored === null) return sphereNotFound();
    if (stored.version !== input.expectedVersion) return sphereVersionConflict();
    try {
      const archived = stored.archive(this.clock.now());
      if (archived === stored) return success(stored);
      const result = await this.repository.updateIfVersionMatchesAndNameAvailable(
        archived,
        input.expectedVersion,
      );
      return result === 'saved' ? success(archived) : sphereVersionConflict();
    } catch (error: unknown) {
      return sphereFailure(error);
    }
  }
}
