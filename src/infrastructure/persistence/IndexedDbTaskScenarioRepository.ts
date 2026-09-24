import type { TaskScenarioRepository } from '../../application/ports/TaskScenarioRepository';
import type { TaskScenario } from '../../domain/planner/TaskScenario';
import { DomainError } from '../../shared/errors/DomainError';
import { LifeOsIndexedDb, LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';
import { TaskScenarioRecordMapper as mapper } from './TaskScenarioRecordMapper';

export class IndexedDbTaskScenarioRepository implements TaskScenarioRepository {
  constructor(readonly database: LifeOsIndexedDb) {}
  async list() {
    const db = await this.database.open();
    const records = await request<unknown[]>(
      db.transaction(LIFE_OS_STORE.taskScenarios).objectStore(LIFE_OS_STORE.taskScenarios).getAll(),
    );
    return records
      .map(mapper.fromRecord)
      .sort((a, b) => a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id));
  }
  async create(value: TaskScenario) {
    await this.write(async (store) => {
      await request(store.add(mapper.toRecord(value)));
    });
  }
  async change(id: string, update: (current: TaskScenario) => TaskScenario) {
    return this.write(async (store) => {
      const record = await request<unknown>(store.get(id));
      if (!record)
        throw new DomainError('scenario.not_found', 'Сценарий не найден. Выберите другой.');
      const current = mapper.fromRecord(record);
      const next = update(current);
      if (next !== current) await request(store.put(mapper.toRecord(next)));
      return next;
    });
  }
  private async write<T>(work: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await this.database.open();
    const tx = db.transaction(LIFE_OS_STORE.taskScenarios, 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      tx.addEventListener('complete', () => resolve());
      tx.addEventListener('abort', () =>
        reject(tx.error ?? new Error('Не удалось сохранить сценарий. Повторите попытку.')),
      );
    });
    void done.catch(() => {});
    try {
      const result = await work(tx.objectStore(LIFE_OS_STORE.taskScenarios));
      await done;
      return result;
    } catch (error: unknown) {
      try {
        tx.abort();
      } catch {
        /* Already settled. */
      }
      await done.catch(() => {});
      throw error;
    }
  }
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error));
  });
}
