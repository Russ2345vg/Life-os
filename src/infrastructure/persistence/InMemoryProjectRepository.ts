import type { ProjectRepository } from '../../application';
import type { EntityId, Project } from '../../domain';

export class InMemoryProjectRepository implements ProjectRepository {
  readonly #projects = new Map<string, Project>();

  public constructor(projects: readonly Project[] = []) {
    for (const project of projects) this.#projects.set(project.id.toString(), project);
  }

  public async findById(id: EntityId): Promise<Project | null> {
    return this.#projects.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly Project[]> {
    return [...this.#projects.values()];
  }

  public async findBySphereId(sphereId: EntityId): Promise<readonly Project[]> {
    return [...this.#projects.values()].filter((project) => project.sphereId?.equals(sphereId));
  }

  public async findByDirectionId(directionId: EntityId): Promise<readonly Project[]> {
    return [...this.#projects.values()].filter((project) =>
      project.directionId?.equals(directionId),
    );
  }

  public async create(project: Project): Promise<boolean> {
    if (this.#projects.has(project.id.toString())) return false;
    this.#projects.set(project.id.toString(), project);
    return true;
  }

  public async createAndReplaceMain(project: Project, updatedAt: Date): Promise<boolean> {
    if (this.#projects.has(project.id.toString()) || !project.isMain) return false;
    this.replaceMainInDirection(project, updatedAt);
    return true;
  }

  public async updateIfVersionMatches(project: Project, expectedVersion: number): Promise<boolean> {
    if (this.#projects.get(project.id.toString())?.version !== expectedVersion) return false;
    this.#projects.set(project.id.toString(), project);
    return true;
  }

  public async replaceMain(
    project: Project,
    expectedVersion: number,
    updatedAt: Date,
  ): Promise<boolean> {
    if (this.#projects.get(project.id.toString())?.version !== expectedVersion) return false;
    this.replaceMainInDirection(project, updatedAt);
    return true;
  }

  private replaceMainInDirection(project: Project, updatedAt: Date): void {
    const changes = [...this.#projects.values()].map((stored) => {
      if (stored.id.equals(project.id)) return project;
      return stored.isMain && samePortfolio(stored, project)
        ? stored.removeMain(updatedAt)
        : stored;
    });
    for (const changed of changes) this.#projects.set(changed.id.toString(), changed);
    this.#projects.set(project.id.toString(), project);
  }
}

function samePortfolio(left: Project, right: Project): boolean {
  return left.directionId === null
    ? right.directionId === null
    : right.directionId !== null && left.directionId.equals(right.directionId);
}
