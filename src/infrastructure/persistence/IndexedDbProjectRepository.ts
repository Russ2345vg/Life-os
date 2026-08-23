import type { ProjectRepository } from '../../application';
import type { EntityId, Project } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { ProjectRecordMapper } from './mappers/ProjectRecordMapper';
import type { ProjectRecord } from './records/ProjectRecord';

export class IndexedDbProjectRepository implements ProjectRepository {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findById(id: EntityId): Promise<Project | null> {
    const database = await this.indexedDb.open();
    const value = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.projects,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return value === undefined ? null : ProjectRecordMapper.fromRecord(value);
  }

  public async findAll(): Promise<readonly Project[]> {
    return this.readMany((store) => store.getAll());
  }

  public async findBySphereId(sphereId: EntityId): Promise<readonly Project[]> {
    return this.readMany((store) => store.index('bySphereId').getAll(sphereId.toString()));
  }

  public async findByDirectionId(directionId: EntityId): Promise<readonly Project[]> {
    return this.readMany((store) => store.index('byDirectionId').getAll(directionId.toString()));
  }

  public async create(project: Project): Promise<boolean> {
    const database = await this.indexedDb.open();
    try {
      await executeIndexedDbRequest(database, LIFE_OS_STORE.projects, 'readwrite', (store) =>
        store.add(ProjectRecordMapper.toRecord(project)),
      );
      return true;
    } catch (error: unknown) {
      if (isConstraintError(error)) return false;
      throw error;
    }
  }

  public async createAndReplaceMain(project: Project, updatedAt: Date): Promise<boolean> {
    if (!project.isMain) return false;
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.projects, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.projects);
    const completion = observeTransaction(transaction);
    try {
      if (
        (await observeRequest<ProjectRecord | undefined>(store.get(project.id.toString()))) !==
        undefined
      ) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }
      await this.clearMainInDirection(store, project, updatedAt);
      await observeRequest(store.add(ProjectRecordMapper.toRecord(project)));
      await completion;
      return true;
    } catch (error: unknown) {
      try {
        transaction.abort();
      } catch {
        /* Transaction already settled. */
      }
      await settleTransaction(completion);
      if (isConstraintError(error)) return false;
      throw error;
    }
  }

  public async updateIfVersionMatches(project: Project, expectedVersion: number): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.projects, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.projects);
    const completion = observeTransaction(transaction);
    const stored = await observeRequest<ProjectRecord | undefined>(
      store.get(project.id.toString()),
    );
    if (stored?.version !== expectedVersion) {
      transaction.abort();
      await settleTransaction(completion);
      return false;
    }
    await observeRequest(store.put(ProjectRecordMapper.toRecord(project)));
    await completion;
    return true;
  }

  public async replaceMain(
    project: Project,
    expectedVersion: number,
    updatedAt: Date,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.projects, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.projects);
    const completion = observeTransaction(transaction);
    const stored = await observeRequest<ProjectRecord | undefined>(
      store.get(project.id.toString()),
    );
    if (stored?.version !== expectedVersion) {
      transaction.abort();
      await settleTransaction(completion);
      return false;
    }
    await this.clearMainInDirection(store, project, updatedAt);
    await observeRequest(store.put(ProjectRecordMapper.toRecord(project)));
    await completion;
    return true;
  }

  private async clearMainInDirection(
    store: IDBObjectStore,
    project: Project,
    updatedAt: Date,
  ): Promise<void> {
    const directionId = project.directionId;
    const records = await observeRequest<ProjectRecord[]>(
      directionId === null
        ? store.getAll()
        : store.index('byDirectionId').getAll(directionId.toString()),
    );
    for (const record of records) {
      if (record.id === project.id.toString()) continue;
      const current = ProjectRecordMapper.fromRecord(record);
      if (current.isMain && (directionId !== null || current.directionId === null)) {
        await observeRequest(
          store.put(ProjectRecordMapper.toRecord(current.removeMain(updatedAt))),
        );
      }
    }
  }

  private async readMany(
    request: (store: IDBObjectStore) => IDBRequest<unknown[]>,
  ): Promise<readonly Project[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest(
      database,
      LIFE_OS_STORE.projects,
      'readonly',
      request,
    );
    return values.map((value) => ProjectRecordMapper.fromRecord(value));
  }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof DomainError && error.code === 'persistence.constraint_violation';
}

function observeRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function observeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected controlled abort.
  }
}
