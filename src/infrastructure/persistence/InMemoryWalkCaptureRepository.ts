import type { WalkCaptureRepository } from '../../application/ports/WalkCaptureRepository';
import type { EntityId, WalkCapture } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export class InMemoryWalkCaptureRepository implements WalkCaptureRepository {
  readonly #captures = new Map<string, WalkCapture>();

  public async insert(capture: WalkCapture): Promise<void> {
    const id = capture.id.toString();
    if (this.#captures.has(id))
      throw new DomainError(
        'persistence.constraint_violation',
        'Мысль с этим идентификатором уже существует.',
      );
    this.#captures.set(id, capture);
  }

  public async findById(id: EntityId): Promise<WalkCapture | null> {
    return this.#captures.get(id.toString()) ?? null;
  }

  public async findPending(): Promise<readonly WalkCapture[]> {
    return [...this.#captures.values()].filter((capture) => capture.status === 'pending');
  }

  public async findByWalkId(walkId: EntityId): Promise<readonly WalkCapture[]> {
    return [...this.#captures.values()].filter((capture) => capture.walkId.equals(walkId));
  }

  public async updateIfVersionMatches(
    capture: WalkCapture,
    expectedVersion: number,
  ): Promise<boolean> {
    const id = capture.id.toString();
    if (this.#captures.get(id)?.version !== expectedVersion) return false;
    this.#captures.set(id, capture);
    return true;
  }
}
