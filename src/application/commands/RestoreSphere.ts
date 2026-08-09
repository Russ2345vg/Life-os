import type { EntityId, Sphere } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { SphereRepository } from '../ports/SphereRepository';
import {
  sphereFailure,
  sphereNameConflict,
  sphereNotFound,
  sphereVersionConflict,
  validSphereExpectedVersion,
} from './sphereCommandSupport';

export interface RestoreSphereInput {
  readonly id: EntityId;
  readonly expectedVersion: number;
}

export class RestoreSphere {
  public constructor(
    readonly repository: SphereRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: RestoreSphereInput): Promise<Result<Sphere, DomainError>> {
    if (!validSphereExpectedVersion(input.expectedVersion)) {
      return failure(
        new DomainError('sphere.invalid_expected_version', 'Версия сферы указана неверно.'),
      );
    }
    const stored = await this.repository.findById(input.id);
    if (stored === null) return sphereNotFound();
    if (stored.version !== input.expectedVersion) return sphereVersionConflict();
    try {
      const restored = stored.restore(this.clock.now());
      if (restored === stored) return success(stored);
      const result = await this.repository.updateIfVersionMatchesAndNameAvailable(
        restored,
        input.expectedVersion,
      );
      if (result === 'nameConflict') return sphereNameConflict();
      return result === 'saved' ? success(restored) : sphereVersionConflict();
    } catch (error: unknown) {
      return sphereFailure(error);
    }
  }
}
