import type { EntityId, Project } from '../../domain';

export interface ProjectRepository {
  findById(id: EntityId): Promise<Project | null>;
  findAll(): Promise<readonly Project[]>;
  findBySphereId(sphereId: EntityId): Promise<readonly Project[]>;
  findByDirectionId(directionId: EntityId): Promise<readonly Project[]>;
  create(project: Project): Promise<boolean>;
  createAndReplaceMain(project: Project, updatedAt: Date): Promise<boolean>;
  updateIfVersionMatches(project: Project, expectedVersion: number): Promise<boolean>;
  replaceMain(project: Project, expectedVersion: number, updatedAt: Date): Promise<boolean>;
}
