import type { EntityId } from '../../domain';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DirectionDeletionRepository } from '../ports/DirectionDeletionRepository';

export class RemoveDirectionSafely {
  public constructor(
    private readonly repository: DirectionDeletionRepository,
    private readonly clock: Clock,
    private readonly currentDate: CurrentDateProvider,
  ) {}

  public inspect(id: EntityId) {
    return this.repository.inspect(id.toString(), this.currentDate.getCurrentDate().toString());
  }

  public execute(input: { readonly id: EntityId; readonly expectedVersion: number }) {
    return this.repository.remove(
      input.id.toString(),
      input.expectedVersion,
      this.currentDate.getCurrentDate().toString(),
      this.clock.now(),
    );
  }
}
