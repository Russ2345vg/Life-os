import { Sphere } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { SphereRepository } from '../ports/SphereRepository';
import { sphereFailure, sphereNameConflict } from './sphereCommandSupport';

export interface CreateSphereInput {
  readonly name: string;
  readonly description?: string | null;
  readonly icon?: string | null;
  readonly color?: string | null;
}

export class CreateSphere {
  public constructor(
    readonly repository: SphereRepository,
    readonly clock: Clock,
    readonly idGenerator: IdGenerator,
  ) {}

  public async execute(input: CreateSphereInput): Promise<Result<Sphere, DomainError>> {
    try {
      const sphere = Sphere.create({
        id: this.idGenerator.generate(),
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.icon === undefined ? {} : { icon: input.icon }),
        ...(input.color === undefined ? {} : { color: input.color }),
        now: this.clock.now(),
      });
      const result = await this.repository.createIfNameAvailable(sphere);
      if (result === 'nameConflict') return sphereNameConflict();
      if (result === 'idConflict') {
        return failure(
          new DomainError('sphere.id_conflict', 'Не удалось создать сферу. Повторите попытку.'),
        );
      }
      return success(sphere);
    } catch (error: unknown) {
      return sphereFailure(error);
    }
  }
}
