import type {
  ActionSessionRepository,
  ActionSessionsByLifeActionIdsReader,
} from '../../application';
import type { ActionSession, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { ActionSessionRecordMapper } from './mappers/ActionSessionRecordMapper';
import type { ActionSessionRecord } from './records/ActionSessionRecord';

export class IndexedDbActionSessionRepository
  implements ActionSessionRepository, ActionSessionsByLifeActionIdsReader
{
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async findById(id: EntityId): Promise<ActionSession | null> {
    const database = await this.#indexedDb.open();
    const storedRecord = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.actionSessions,
      'readonly',
      (store) => store.get(id.toString()),
    );

    if (storedRecord === undefined) {
      return null;
    }

    return ActionSessionRecordMapper.fromRecord(storedRecord as ActionSessionRecord);
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.actionSessions,
      'readonly',
      (store) => store.index('byLifeActionId').getAll(lifeActionId.toString()),
    );

    return mapRecords(storedRecords);
  }

  public async findByLifeActionIds(
    lifeActionIds: readonly EntityId[],
  ): Promise<readonly ActionSession[]> {
    if (lifeActionIds.length === 0) return [];

    const acceptedIds = new Set(lifeActionIds.map((lifeActionId) => lifeActionId.toString()));
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.actionSessions,
      'readonly',
      (store) => store.getAll(),
    );

    return mapRecords(storedRecords).filter((session) =>
      acceptedIds.has(session.lifeActionId.toString()),
    );
  }

  public async findAll(): Promise<readonly ActionSession[]> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.actionSessions,
      'readonly',
      (store) => store.getAll(),
    );

    return mapRecords(storedRecords);
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.actionSessions,
      'readonly',
      (store) => store.index('byStatus').getAll(IDBKeyRange.bound('paused', 'running')),
    );
    const unfinishedSessions = mapRecords(storedRecords);

    if (unfinishedSessions.length > 1) {
      throw new DomainError(
        'session.multiple_unfinished_detected',
        'Обнаружено несколько незавершённых сессий.',
      );
    }

    return unfinishedSessions[0] ?? null;
  }

  public async save(session: ActionSession): Promise<void> {
    const database = await this.#indexedDb.open();
    const record = ActionSessionRecordMapper.toRecord(session);

    await executeIndexedDbRequest<IDBValidKey>(
      database,
      LIFE_OS_STORE.actionSessions,
      'readwrite',
      (store) => store.put(record),
    );
  }
}

function mapRecords(records: readonly unknown[]): ActionSession[] {
  return records.map((record) =>
    ActionSessionRecordMapper.fromRecord(record as ActionSessionRecord),
  );
}
