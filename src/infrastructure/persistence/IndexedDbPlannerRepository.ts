import type { InboxChange, PlannerRepository } from '../../application/ports/PlannerRepository';
import type { InboxIdea } from '../../domain/planner/InboxIdea';
import type { FocusPeriod } from '../../domain/planner/FocusPeriod';
import { DomainError } from '../../shared/errors/DomainError';
import { LifeOsIndexedDb, LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';
import { InboxIdeaRecordMapper, FocusPeriodRecordMapper } from './PlannerRecordMappers';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../sync/pilot/IndexedDbPilotMutationRecorder';

export class IndexedDbPlannerRepository implements PlannerRepository {
  constructor(
    readonly database: LifeOsIndexedDb,
    readonly recorder: IndexedDbPilotMutationRecorder,
  ) {}
  async listInbox() {
    const db = await this.database.open();
    const records = await request<unknown[]>(
      db.transaction(LIFE_OS_STORE.inboxIdeas).objectStore(LIFE_OS_STORE.inboxIdeas).getAll(),
    );
    return records
      .map(InboxIdeaRecordMapper.fromRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async createInbox(idea: InboxIdea) {
    await this.write([LIFE_OS_STORE.inboxIdeas], async (tx) => {
      await request(
        tx.objectStore(LIFE_OS_STORE.inboxIdeas).add(InboxIdeaRecordMapper.toRecord(idea)),
      );
    });
  }
  async changeInbox(id: string, change: (current: InboxIdea) => InboxChange) {
    return this.write(
      [
        LIFE_OS_STORE.inboxIdeas,
        LIFE_OS_STORE.goals,
        LIFE_OS_STORE.lifeActions,
        ...PILOT_MUTATION_STORES,
      ],
      async (tx) => {
        const store = tx.objectStore(LIFE_OS_STORE.inboxIdeas);
        const stored = await request<unknown>(store.get(id));
        if (!stored) throw new DomainError('inbox.not_found', 'Входящая запись не найдена.');
        const current = InboxIdeaRecordMapper.fromRecord(stored);
        const changed = change(current);
        if (changed.idea === current) return current;
        if (changed.goal) {
          const record = GoalRecordMapper.toRecord(changed.goal);
          await request(tx.objectStore(LIFE_OS_STORE.goals).add(record));
          // Goal is manually captured by the existing registry configuration.
          await this.recorder.recordUpsert(tx, 'goal', record);
        }
        if (changed.action)
          await request(
            tx
              .objectStore(LIFE_OS_STORE.lifeActions)
              .add(LifeActionRecordMapper.toRecord(changed.action)),
          );
        await request(store.put(InboxIdeaRecordMapper.toRecord(changed.idea)));
        return changed.idea;
      },
    );
  }
  async getFocus(id: string) {
    const db = await this.database.open();
    const stored = await request<unknown>(
      db.transaction(LIFE_OS_STORE.focusPeriods).objectStore(LIFE_OS_STORE.focusPeriods).get(id),
    );
    return stored === undefined ? null : FocusPeriodRecordMapper.fromRecord(stored);
  }
  async changeFocus(id: string, change: (current: FocusPeriod | null) => FocusPeriod) {
    return this.write([LIFE_OS_STORE.focusPeriods], async (tx) => {
      const store = tx.objectStore(LIFE_OS_STORE.focusPeriods);
      const stored = await request<unknown>(store.get(id));
      const current = stored === undefined ? null : FocusPeriodRecordMapper.fromRecord(stored);
      const next = change(current);
      if (next !== current) await request(store.put(FocusPeriodRecordMapper.toRecord(next)));
      return next;
    });
  }
  private async write<T>(stores: string[], work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await this.database.open();
    const tx = db.transaction(stores, 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      tx.addEventListener('complete', () => resolve());
      tx.addEventListener('abort', () =>
        reject(tx.error ?? new Error('Не удалось сохранить изменения.')),
      );
    });
    // Observe an early abort even while work is rejecting.
    void done.catch(() => {});
    try {
      const result = await work(tx);
      await done;
      this.recorder.notifyCommitted(true);
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
