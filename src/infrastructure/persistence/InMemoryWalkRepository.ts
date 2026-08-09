import type { StartWalkPersistenceResult, WalkRepository } from '../../application';
import { WALK_STATUS, type DayDate, type EntityId, type Walk } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export class InMemoryWalkRepository implements WalkRepository {
  readonly #walks = new Map<string, Walk>();
  readonly #versions = new Map<string, number>();

  public constructor(walks: readonly Walk[] = []) {
    for (const walk of walks) {
      this.#walks.set(walk.id.toString(), walk);
      this.#versions.set(walk.id.toString(), walk.version);
    }
  }

  public async findById(id: EntityId): Promise<Walk | null> {
    return this.#walks.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly Walk[]> {
    return [...this.#walks.values()];
  }

  public async findByDate(date: DayDate): Promise<readonly Walk[]> {
    return [...this.#walks.values()].filter((walk) => walk.date.equals(date));
  }

  public async findRunning(): Promise<Walk | null> {
    const running = [...this.#walks.values()].filter((walk) => walk.status === WALK_STATUS.running);
    if (running.length > 1) throw multipleRunningWalks();
    return running[0] ?? null;
  }

  public async save(walk: Walk): Promise<void> {
    const key = walk.id.toString();
    this.#walks.set(key, walk);
    this.#versions.set(key, walk.version);
  }

  public async startIfVersionMatches(
    walk: Walk,
    expectedVersion: number,
  ): Promise<StartWalkPersistenceResult> {
    const key = walk.id.toString();
    if (this.#versions.get(key) !== expectedVersion) return 'versionConflict';
    if (
      [...this.#walks.values()].some(
        (stored) => stored.status === WALK_STATUS.running && !stored.id.equals(walk.id),
      )
    ) {
      return 'runningExists';
    }
    this.#walks.set(key, walk);
    this.#versions.set(key, walk.version);
    return 'saved';
  }

  public async deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean> {
    const key = id.toString();
    if (this.#versions.get(key) !== expectedVersion) return false;
    this.#versions.delete(key);
    return this.#walks.delete(key);
  }

  public async updateIfVersionMatches(walk: Walk, expectedVersion: number): Promise<boolean> {
    const key = walk.id.toString();
    if (this.#versions.get(key) !== expectedVersion) return false;
    this.#walks.set(key, walk);
    this.#versions.set(key, walk.version);
    return true;
  }
}

function multipleRunningWalks(): DomainError {
  return new DomainError(
    'walk.multiple_running',
    'Обнаружено несколько идущих прогулок. Данные не изменены.',
  );
}
