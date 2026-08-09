import type {
  CreateSpherePersistenceResult,
  SphereRepository,
  UpdateSpherePersistenceResult,
} from '../../application';
import { sphereNameKey, type EntityId, type Sphere } from '../../domain';

export class InMemorySphereRepository implements SphereRepository {
  readonly #spheres = new Map<string, Sphere>();

  public constructor(spheres: readonly Sphere[] = []) {
    for (const sphere of spheres) this.#spheres.set(sphere.id.toString(), sphere);
  }

  public async findById(id: EntityId): Promise<Sphere | null> {
    return this.#spheres.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly Sphere[]> {
    return [...this.#spheres.values()];
  }

  public async createIfNameAvailable(sphere: Sphere): Promise<CreateSpherePersistenceResult> {
    if (this.#spheres.has(sphere.id.toString())) return 'idConflict';
    if (this.hasName(sphere.name)) return 'nameConflict';
    this.#spheres.set(sphere.id.toString(), sphere);
    return 'saved';
  }

  public async updateIfVersionMatchesAndNameAvailable(
    sphere: Sphere,
    expectedVersion: number,
  ): Promise<UpdateSpherePersistenceResult> {
    const stored = this.#spheres.get(sphere.id.toString());
    if (stored?.version !== expectedVersion) return 'versionConflict';
    if (this.hasName(sphere.name, sphere.id)) return 'nameConflict';
    this.#spheres.set(sphere.id.toString(), sphere);
    return 'saved';
  }

  private hasName(name: string, exceptId?: EntityId): boolean {
    const key = sphereNameKey(name);
    return [...this.#spheres.values()].some(
      (sphere) =>
        sphereNameKey(sphere.name) === key &&
        (exceptId === undefined || !sphere.id.equals(exceptId)),
    );
  }
}
