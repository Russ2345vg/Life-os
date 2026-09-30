import { EntityId } from '../../domain';
import type { MemoryContext } from '../../domain/memory';
import { DomainError } from '../../shared/errors/DomainError';
import type { SphereRepository } from '../ports/SphereRepository';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { GoalRepository } from '../ports/GoalRepository';

export class MemoryContextResolver {
  public constructor(
    private readonly spheres: Pick<SphereRepository, 'findById'>,
    private readonly directions: Pick<DirectionRepository, 'findById'>,
    private readonly goals: Pick<GoalRepository, 'findById'>,
  ) {}

  public async resolve(
    candidate: MemoryContext,
    previous: MemoryContext | null,
  ): Promise<MemoryContext> {
    const [sphereTitle, directionTitle, goalTitle] = await Promise.all([
      this.title(
        candidate.sphereId,
        previous?.sphereId,
        previous?.sphereTitle,
        async (id) => (await this.spheres.findById(id))?.name ?? null,
      ),
      this.title(
        candidate.directionId,
        previous?.directionId,
        previous?.directionTitle,
        async (id) => (await this.directions.findById(id))?.name ?? null,
      ),
      this.title(
        candidate.goalId,
        previous?.goalId,
        previous?.goalTitle,
        async (id) => (await this.goals.findById(id))?.title ?? null,
      ),
    ]);
    return {
      sphereId: candidate.sphereId,
      sphereTitle,
      directionId: candidate.directionId,
      directionTitle,
      goalId: candidate.goalId,
      goalTitle,
    };
  }

  private async title(
    id: string | null,
    previousId: string | null | undefined,
    previousTitle: string | null | undefined,
    lookup: (id: EntityId) => Promise<string | null>,
  ): Promise<string | null> {
    if (id === null) return null;
    if (id === previousId) return previousTitle ?? null;
    const title = await lookup(EntityId.create(id));
    if (title === null)
      throw new DomainError(
        'memory.context_missing',
        'Связанный объект больше недоступен. Обновите выбор.',
      );
    return title;
  }
}
