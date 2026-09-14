import type { ProjectRepository } from '../../application';
import type { EntityId, Project } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { ProjectGoalCompatibility as ProjectRecordMapper } from './mappers/ProjectGoalCompatibility';
import type { GoalRecord as ProjectRecord } from './records/GoalRecord';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../sync/pilot/IndexedDbPilotMutationRecorder';

export class IndexedDbProjectRepository implements ProjectRepository {
  public constructor(
    readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb(),
    readonly mutationRecorder: IndexedDbPilotMutationRecorder = new IndexedDbPilotMutationRecorder(),
  ) {}

  public async findById(id: EntityId): Promise<Project | null> {
    const database = await this.indexedDb.open();
    const value = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.goals,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return value === undefined ? null : this.projectFromGoalRecord(value);
  }

  public async findAll(): Promise<readonly Project[]> {
    return this.readMany((store) => store.getAll());
  }

  public async findBySphereId(sphereId: EntityId): Promise<readonly Project[]> {
    return (await this.findAll()).filter((goal) => goal.sphereId?.equals(sphereId));
  }

  public async findByDirectionId(directionId: EntityId): Promise<readonly Project[]> {
    return this.readMany((store) => store.index('byDirectionId').getAll(directionId.toString()));
  }

  public async create(project: Project): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = this.writeTransaction(database);
    const completion = observeTransaction(transaction);
    try {
      const record = ProjectRecordMapper.toRecord(project);
      await observeRequest(transaction.objectStore(LIFE_OS_STORE.goals).add(record));
      const recorded = await this.mutationRecorder.recordUpsert(transaction, 'goal', record);
      await this.indexedDb.refreshBalanceSnapshots(transaction, completion);
      await completion;
      this.mutationRecorder.notifyCommitted(recorded);
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      if (isConstraintError(error) || isConstraintDomError(error)) return false;
      throw error;
    }
  }

  public async createAndReplaceMain(project: Project, updatedAt: Date): Promise<boolean> {
    if (!project.isMain) return false;
    const database = await this.indexedDb.open();
    const transaction = this.writeTransaction(database);
    const store = transaction.objectStore(LIFE_OS_STORE.goals);
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
      const demoted = await this.clearMainInDirection(store, project, updatedAt);
      let recorded = false;
      for (const record of demoted) {
        recorded =
          (await this.mutationRecorder.recordUpsert(transaction, 'goal', record)) || recorded;
      }
      const record = ProjectRecordMapper.toRecord(project);
      await observeRequest(store.add(record));
      recorded =
        (await this.mutationRecorder.recordUpsert(transaction, 'goal', record)) || recorded;
      await this.indexedDb.refreshBalanceSnapshots(transaction, completion);
      await completion;
      this.mutationRecorder.notifyCommitted(recorded);
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
    const transaction = this.writeTransaction(database);
    const store = transaction.objectStore(LIFE_OS_STORE.goals);
    const completion = observeTransaction(transaction);
    const stored = await observeRequest<ProjectRecord | undefined>(
      store.get(project.id.toString()),
    );
    if (stored?.version !== expectedVersion) {
      transaction.abort();
      await settleTransaction(completion);
      return false;
    }
    const record = ProjectRecordMapper.toRecord(project, stored);
    await observeRequest(store.put(record));
    const recorded = await this.mutationRecorder.recordUpsert(transaction, 'goal', record);
    await this.indexedDb.refreshBalanceSnapshots(transaction, completion);
    await completion;
    this.mutationRecorder.notifyCommitted(recorded);
    return true;
  }

  public async replaceMain(
    project: Project,
    expectedVersion: number,
    updatedAt: Date,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = this.writeTransaction(database);
    const store = transaction.objectStore(LIFE_OS_STORE.goals);
    const completion = observeTransaction(transaction);
    const stored = await observeRequest<ProjectRecord | undefined>(
      store.get(project.id.toString()),
    );
    if (stored?.version !== expectedVersion) {
      transaction.abort();
      await settleTransaction(completion);
      return false;
    }
    const demoted = await this.clearMainInDirection(store, project, updatedAt);
    let recorded = false;
    for (const record of demoted) {
      recorded =
        (await this.mutationRecorder.recordUpsert(transaction, 'goal', record)) || recorded;
    }
    const record = ProjectRecordMapper.toRecord(project, stored);
    await observeRequest(store.put(record));
    recorded = (await this.mutationRecorder.recordUpsert(transaction, 'goal', record)) || recorded;
    await this.indexedDb.refreshBalanceSnapshots(transaction, completion);
    await completion;
    this.mutationRecorder.notifyCommitted(recorded);
    return true;
  }

  private async clearMainInDirection(
    store: IDBObjectStore,
    project: Project,
    updatedAt: Date,
  ): Promise<readonly ProjectRecord[]> {
    const directionId = project.directionId;
    const records = await observeRequest<ProjectRecord[]>(
      directionId === null
        ? store.getAll()
        : store.index('byDirectionId').getAll(directionId.toString()),
    );
    const changed: ProjectRecord[] = [];
    for (const record of records) {
      if (record.id === project.id.toString()) continue;
      const current = ProjectRecordMapper.fromRecord(record);
      if (current.isMain && (directionId !== null || current.directionId === null)) {
        const updated = ProjectRecordMapper.toRecord(current.removeMain(updatedAt), record);
        await observeRequest(store.put(updated));
        changed.push(updated);
      }
    }
    return changed;
  }

  private writeTransaction(database: IDBDatabase): IDBTransaction {
    return database.transaction(
      this.indexedDb.balanceTransactionStores([LIFE_OS_STORE.goals, ...PILOT_MUTATION_STORES]),
      'readwrite',
    );
  }

  private async projectFromGoalRecord(value: unknown): Promise<Project> {
    const project = ProjectRecordMapper.fromRecord(value);
    if (project.sphereId !== null || project.directionId === null) return project;
    const database = await this.indexedDb.open();
    const direction = await executeIndexedDbRequest<{ sphereId?: string | null } | undefined>(
      database,
      LIFE_OS_STORE.directions,
      'readonly',
      (store) => store.get(project.directionId!.toString()),
    );
    return direction?.sphereId
      ? ProjectRecordMapper.fromRecord({ ...(value as object), sphereId: direction.sphereId })
      : project;
  }

  private async readMany(
    request: (store: IDBObjectStore) => IDBRequest<unknown[]>,
  ): Promise<readonly Project[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest(
      database,
      LIFE_OS_STORE.goals,
      'readonly',
      request,
    );
    return Promise.all(values.map((value) => this.projectFromGoalRecord(value)));
  }
}

function abortQuietly(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    /* Transaction already settled. */
  }
}

function isConstraintDomError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConstraintError'
  );
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
