import { EntityId } from '../../domain/shared/EntityId';
import type { MemoryDraft, MemoryEvent } from '../../domain/memory';
import type { WalkRepository } from '../ports/WalkRepository';
import type { WalkRequest } from '../ports/WalkUnitOfWork';
import type { MemoryServices } from '../memory/MemoryServices';
import { DomainError } from '../../shared/errors/DomainError';
import { assertCurrent, walkRequest, type WalkCommandTarget } from './WalkCommands';
import { formatWalkReflectionSummary } from './WalkReflectionSummary';
export interface WalkExportReservations {
  reserveExport(request: WalkRequest, candidateId: string): Promise<string>;
}
export class WalkMemoryExport {
  public constructor(
    private readonly walks: WalkRepository,
    private readonly reservations: WalkExportReservations,
    private readonly memory: MemoryServices,
  ) {}
  public async prepare(
    input: WalkCommandTarget,
  ): Promise<{ kind: 'draft'; draft: MemoryDraft } | { kind: 'existing'; event: MemoryEvent }> {
    if (!this.memory.commands.enabled)
      throw new DomainError('memory.disabled', 'Память жизни недоступна.');
    const base = this.memory.commands.prepareCreate();
    const id = EntityId.create(
      await this.reservations.reserveExport(walkRequest('memoryExport', input), base.id.toString()),
    );
    const existing = await this.memory.queries.get(id);
    if (existing) return { kind: 'existing', event: existing };
    const walk = await this.walks.get(input.walkId);
    assertCurrent(walk, input.expectedVersion);
    if (walk.deletedAt || walk.status !== 'completed')
      throw new DomainError(
        'walk.export_unavailable',
        'Для переноса нужна завершённая, неудалённая прогулка.',
      );
    return {
      kind: 'draft',
      draft: {
        ...base,
        id,
        occurredOn: walk.date,
        title: 'Прогулка',
        body: formatWalkReflectionSummary(walk),
        photo: walk.photo,
      },
    };
  }
}
