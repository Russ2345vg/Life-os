import type { EntityId, Sphere } from '../../domain';
import type { SphereBalanceSettings } from '../../domain/balance/BalanceImportance';
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

export interface UpdateSphereInput extends SphereBalanceSettings {
  readonly id: EntityId;
  readonly expectedVersion: number;
  readonly name: string;
  readonly description?: string | null;
  readonly icon?: string | null;
  readonly color?: string | null;
}

export class UpdateSphere {
  public constructor(
    readonly repository: SphereRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: UpdateSphereInput): Promise<Result<Sphere, DomainError>> {
    if (!validSphereExpectedVersion(input.expectedVersion)) {
      return failure(
        new DomainError('sphere.invalid_expected_version', 'Версия сферы указана неверно.'),
      );
    }
    const stored = await this.repository.findById(input.id);
    if (stored === null) return sphereNotFound();
    if (stored.version !== input.expectedVersion) return sphereVersionConflict();

    try {
      const updated = stored.update(
        {
          ...input,
          name: input.name,
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.icon === undefined ? {} : { icon: input.icon }),
          ...(input.color === undefined ? {} : { color: input.color }),
        },
        this.clock.now(),
      );
      const result = await this.repository.updateIfVersionMatchesAndNameAvailable(
        updated,
        input.expectedVersion,
      );
      if (result === 'nameConflict') return sphereNameConflict();
      if (result === 'versionConflict') return sphereVersionConflict();
      return success(updated);
    } catch (error: unknown) {
      return sphereFailure(error);
    }
  }
}
