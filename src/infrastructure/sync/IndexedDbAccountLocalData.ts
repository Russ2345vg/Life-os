import type { AccountLocalData } from '../../application/sync/account/AccountLocalData';
import { LIFE_OS_DATABASE_NAME, LifeOsIndexedDb } from '../persistence/indexed-db/LifeOsIndexedDb';
import { LIFE_OS_LOCAL_STORAGE_SYNC_ALLOWLIST } from './LifeOsLocalStoragePolicy';

interface AccountLocalStorage {
  removeItem(key: string): void;
}

export class IndexedDbAccountLocalData implements AccountLocalData {
  public constructor(
    private readonly database: LifeOsIndexedDb,
    private readonly indexedDb: IDBFactory = globalThis.indexedDB,
    private readonly localStorage: AccountLocalStorage = globalThis.localStorage,
  ) {}

  public async purge(): Promise<void> {
    this.database.close();
    await deleteDatabase(this.indexedDb, LIFE_OS_DATABASE_NAME);
    for (const key of LIFE_OS_LOCAL_STORAGE_SYNC_ALLOWLIST) this.localStorage.removeItem(key);
    await assertEmptyCurrentSchema(await this.database.open());
  }
}

function deleteDatabase(indexedDb: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.deleteDatabase(name);
    request.addEventListener('success', () => resolve(), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
    request.addEventListener(
      'blocked',
      () => reject(new Error('LifeOS database deletion blocked.')),
      {
        once: true,
      },
    );
  });
}

async function assertEmptyCurrentSchema(database: IDBDatabase): Promise<void> {
  const names = Array.from(database.objectStoreNames);
  if (names.length === 0) throw new Error('LifeOS database schema was not recreated.');
  const transaction = database.transaction(names, 'readonly');
  const [counts, exerciseDefinitions] = await Promise.all([
    Promise.all(names.map((name) => request(transaction.objectStore(name).count()))),
    names.includes('exerciseDefinitions')
      ? request<unknown[]>(transaction.objectStore('exerciseDefinitions').getAll())
      : Promise.resolve([]),
  ]);
  await complete(transaction);
  const populated = names.filter(
    (name, index) => counts[index] !== 0 && name !== 'exerciseDefinitions',
  );
  if (!exerciseDefinitions.every(isSystemExerciseDefinition)) {
    populated.push('exerciseDefinitions');
  }
  if (populated.length > 0) {
    throw new Error(`LifeOS local purge verification failed: ${populated.join(', ')}.`);
  }
}

function isSystemExerciseDefinition(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'source' in value &&
    value.source === 'SYSTEM' &&
    'createdAt' in value &&
    value.createdAt === new Date(0).toISOString()
  );
}

function request<T>(input: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    input.addEventListener('success', () => resolve(input.result), { once: true });
    input.addEventListener('error', () => reject(input.error), { once: true });
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
  });
}
