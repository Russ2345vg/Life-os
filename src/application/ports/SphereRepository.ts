import type { EntityId, Sphere } from '../../domain';

export type CreateSpherePersistenceResult = 'saved' | 'nameConflict' | 'idConflict';
export type UpdateSpherePersistenceResult = 'saved' | 'nameConflict' | 'versionConflict';

export interface SphereRepository {
  findById(id: EntityId): Promise<Sphere | null>;
  findAll(): Promise<readonly Sphere[]>;
  createIfNameAvailable(sphere: Sphere): Promise<CreateSpherePersistenceResult>;
  updateIfVersionMatchesAndNameAvailable(
    sphere: Sphere,
    expectedVersion: number,
  ): Promise<UpdateSpherePersistenceResult>;
}
