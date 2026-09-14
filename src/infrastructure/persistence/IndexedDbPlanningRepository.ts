import type { PlanningRepository, PlanningState } from '../../application/ports/PlanningRepository';
import { LifeOsIndexedDb, LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import { JournalEntryRecordMapper } from './mappers/JournalEntryRecordMapper';
import { FocusPeriodRecordMapper } from './PlannerRecordMappers';
import {
  PlanningPeriodRecordMapper,
  PeriodMembershipRecordMapper,
  PeriodDecisionRecordMapper,
  ContributionLinkRecordMapper,
  ProgressContributionRecordMapper,
  RecurrenceRuleRecordMapper,
} from './PlanningRecordMappers';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../sync/pilot/IndexedDbPilotMutationRecorder';

const bindings = {
  goals: { store: LIFE_OS_STORE.goals, mapper: GoalRecordMapper },
  actions: { store: LIFE_OS_STORE.lifeActions, mapper: LifeActionRecordMapper },
  periods: { store: LIFE_OS_STORE.planningPeriods, mapper: PlanningPeriodRecordMapper },
  memberships: { store: LIFE_OS_STORE.periodMemberships, mapper: PeriodMembershipRecordMapper },
  decisions: { store: LIFE_OS_STORE.periodDecisions, mapper: PeriodDecisionRecordMapper },
  links: { store: LIFE_OS_STORE.contributionLinks, mapper: ContributionLinkRecordMapper },
  contributions: {
    store: LIFE_OS_STORE.progressContributions,
    mapper: ProgressContributionRecordMapper,
  },
  rules: { store: LIFE_OS_STORE.recurrenceRules, mapper: RecurrenceRuleRecordMapper },
  legacyFocus: { store: LIFE_OS_STORE.focusPeriods, mapper: FocusPeriodRecordMapper },
} as const;
type Key = keyof typeof bindings;
export class IndexedDbPlanningRepository implements PlanningRepository {
  constructor(
    readonly database: LifeOsIndexedDb,
    readonly recorder = new IndexedDbPilotMutationRecorder(),
  ) {}
  async read(): Promise<PlanningState> {
    return this.run('readonly', (s) => s);
  }
  async change<T>(work: (state: PlanningState) => T): Promise<T> {
    return this.run('readwrite', work);
  }
  private async run<T>(mode: IDBTransactionMode, work: (state: PlanningState) => T): Promise<T> {
    const db = await this.database.open();
    const tx = db.transaction(
      [
        ...Object.values(bindings).map((b) => b.store),
        LIFE_OS_STORE.journal,
        ...(mode === 'readwrite' ? PILOT_MUTATION_STORES : []),
      ],
      mode,
    );
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Транзакция отменена.'));
    });
    void done.catch(() => {});
    try {
      const raw = await Promise.all(
        (Object.keys(bindings) as Key[]).map(
          async (key) =>
            [key, await request<unknown[]>(tx.objectStore(bindings[key].store).getAll())] as const,
        ),
      );
      const state: PlanningState = {
        goals: [],
        actions: [],
        periods: [],
        memberships: [],
        decisions: [],
        links: [],
        contributions: [],
        rules: [],
        legacyFocus: [],
        journal: [],
      };
      for (const [key, records] of raw) readTable(state, key, records);
      const fingerprints = new Map(
        (Object.keys(bindings) as Key[]).map((key) => [
          key,
          new Map(writeTable(state, key).map((r) => [r.id, JSON.stringify(r)])),
        ]),
      );
      const result = work(state);
      let changed = false;
      if (mode === 'readwrite') {
        for (const [key, previous] of raw) {
          if (key === 'legacyFocus') continue;
          const store = tx.objectStore(bindings[key].store);
          const old = new Map(
            previous.map((value) => {
              const r = value as Record<string, unknown>;
              return [r.id, r] as const;
            }),
          );
          for (const record of writeTable(state, key)) {
            const before = old.get(record.id);
            const merged = { ...before, ...record };
            if (fingerprints.get(key)?.get(record.id) === JSON.stringify(record)) continue;
            await request(store.put(merged));
            changed = true;
            if (key === 'goals') await this.recorder.recordUpsert(tx, 'goal', merged);
          }
        }
        for (const entry of state.journal)
          await request(
            tx.objectStore(LIFE_OS_STORE.journal).add(JournalEntryRecordMapper.toRecord(entry)),
          );
      }
      await done;
      if (changed || state.journal.length) this.recorder.notifyCommitted(true);
      return result;
    } catch (error: unknown) {
      try {
        tx.abort();
      } catch {
        /* settled */
      }
      await done.catch(() => {});
      throw error;
    }
  }
}
function readTable<K extends Key>(state: PlanningState, key: K, records: unknown[]): void {
  // Each binding fixes the domain type for its matching state key.
  const mapper = bindings[key].mapper as { fromRecord(value: unknown): PlanningState[K][number] };
  (state[key] as PlanningState[K]) = records.map((r) => mapper.fromRecord(r)) as PlanningState[K];
}
function writeTable<K extends Key>(state: PlanningState, key: K): Record<string, unknown>[] {
  const mapper = bindings[key].mapper as { toRecord(value: PlanningState[K][number]): object };
  return state[key].map((value) => mapper.toRecord(value) as Record<string, unknown>);
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
