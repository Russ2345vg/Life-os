import type {
  ConnectionMemoryRecord,
  ConnectionPage,
  ConnectionReadRepository,
  ConnectionRoutineRecord,
  ConnectionWalkRecord,
} from '../../application/ports/ConnectionReadRepository';
import type { PlanningState } from '../../application/ports/PlanningRepository';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import { LIFE_OS_STORE, type LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import {
  ContributionLinkRecordMapper,
  ProgressContributionRecordMapper,
  RecurrenceRuleRecordMapper,
} from './PlanningRecordMappers';
import type { MemoryEventRecord } from './records/MemoryEventRecord';
import type { LifeActionRecord } from './records/LifeActionRecord';
import type { RoutineBlockRecord } from './records/RoutineBlockRecord';
import type { WalkRecord } from './records/WalkRecord';

const PAGE_SIZE = 30;

function walkProjection(record: WalkRecord): ConnectionWalkRecord {
  return {
    id: record.id,
    date: record.date,
    title: record.reflectionQuestion?.trim() || `Прогулка ${record.date}`,
    sphereId: record.sphereId ?? null,
    linkedEntity: record.linkedEntity ?? null,
    deletedAt: record.deletedAt ?? null,
  };
}

function memoryProjection(record: MemoryEventRecord): ConnectionMemoryRecord {
  return {
    id: record.id,
    title: record.title,
    occurredOn: record.occurredOn,
    context: record.context,
    diarySource: record.diarySource,
    deletedAt: record.deletedAt,
  };
}

function sortKey(date: string, id: string): string {
  return `${date}\u0000${id}`;
}

export class IndexedDbConnectionReadRepository implements ConnectionReadRepository {
  public constructor(private readonly database: LifeOsIndexedDb) {}

  public async readPlanning(): Promise<
    Pick<PlanningState, 'goals' | 'actions' | 'links' | 'contributions' | 'rules'>
  > {
    const db = await this.database.open();
    const transaction = db.transaction([
      LIFE_OS_STORE.goals,
      LIFE_OS_STORE.lifeActions,
      LIFE_OS_STORE.contributionLinks,
      LIFE_OS_STORE.progressContributions,
      LIFE_OS_STORE.recurrenceRules,
    ]);
    const completion = done(transaction);
    const [goals, actions, links, contributions, rules] = await Promise.all([
      request<unknown[]>(transaction.objectStore(LIFE_OS_STORE.goals).getAll()),
      request<LifeActionRecord[]>(transaction.objectStore(LIFE_OS_STORE.lifeActions).getAll()),
      request<unknown[]>(transaction.objectStore(LIFE_OS_STORE.contributionLinks).getAll()),
      request<unknown[]>(transaction.objectStore(LIFE_OS_STORE.progressContributions).getAll()),
      request<unknown[]>(transaction.objectStore(LIFE_OS_STORE.recurrenceRules).getAll()),
    ]);
    await completion;
    return {
      goals: goals.map(GoalRecordMapper.fromRecord),
      actions: actions.map(LifeActionRecordMapper.fromRecord),
      links: links.map(ContributionLinkRecordMapper.fromRecord),
      contributions: contributions.map(ProgressContributionRecordMapper.fromRecord),
      rules: rules.map(RecurrenceRuleRecordMapper.fromRecord),
    };
  }

  public async getWalk(id: string): Promise<ConnectionWalkRecord | null> {
    const db = await this.database.open();
    const record = await request<WalkRecord | undefined>(
      db.transaction(LIFE_OS_STORE.walks).objectStore(LIFE_OS_STORE.walks).get(id),
    );
    return record ? walkProjection(record) : null;
  }

  public async getMemory(id: string): Promise<ConnectionMemoryRecord | null> {
    const db = await this.database.open();
    const record = await request<MemoryEventRecord | undefined>(
      db.transaction(LIFE_OS_STORE.memoryEvents).objectStore(LIFE_OS_STORE.memoryEvents).get(id),
    );
    return record ? memoryProjection(record) : null;
  }

  public async listWalksBySource(
    source: { readonly type: 'goal' | 'lifeAction'; readonly id: string },
    cursor?: string,
  ): Promise<ConnectionPage<ConnectionWalkRecord>> {
    return this.scanPage(
      LIFE_OS_STORE.walks,
      (record: WalkRecord) =>
        !record.deletedAt &&
        record.linkedEntity?.type === source.type &&
        record.linkedEntity.id === source.id,
      (record) => sortKey(record.date, record.id),
      walkProjection,
      cursor,
    );
  }

  public async listMemoriesByGoal(
    goalId: string,
    cursor?: string,
  ): Promise<ConnectionPage<ConnectionMemoryRecord>> {
    return this.scanPage(
      LIFE_OS_STORE.memoryEvents,
      (record: MemoryEventRecord) => !record.deletedAt && record.context?.goalId === goalId,
      (record) => sortKey(record.occurredOn, record.id),
      memoryProjection,
      cursor,
    );
  }

  private async scanPage<T, R>(
    storeName: string,
    matches: (record: T) => boolean,
    keyOf: (record: T) => string,
    project: (record: T) => R,
    after?: string,
  ): Promise<ConnectionPage<R>> {
    const db = await this.database.open();
    const transaction = db.transaction(storeName);
    const completion = done(transaction);
    const entries = await new Promise<{ key: string; value: R }[]>((resolve, reject) => {
      const selected: { key: string; value: R }[] = [];
      const cursor = transaction.objectStore(storeName).openCursor();
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return resolve(selected);
        const record = entry.value as T;
        if (matches(record)) {
          const key = keyOf(record);
          if (after === undefined || key < after) {
            if (selected.length < PAGE_SIZE + 1 || key > selected[selected.length - 1]!.key) {
              selected.push({ key, value: project(record) });
              selected.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
              if (selected.length > PAGE_SIZE + 1) selected.pop();
            }
          }
        }
        entry.continue();
      };
    });
    await completion;
    return {
      items: entries.slice(0, PAGE_SIZE).map((entry) => entry.value),
      nextCursor: entries.length > PAGE_SIZE ? entries[PAGE_SIZE - 1]!.key : null,
    };
  }

  public async listRoutineAssignments(
    actionId: string,
    ruleId?: string,
  ): Promise<readonly ConnectionRoutineRecord[]> {
    const records = await this.scan<RoutineBlockRecord>(LIFE_OS_STORE.routineBlocks);
    return records
      .filter(
        (record) =>
          (record.assignment === 'existingAction' && record.actionId === actionId) ||
          (record.assignment === 'existingSeries' &&
            ruleId !== undefined &&
            record.ruleId === ruleId),
      )
      .map((record) => ({
        id: record.id,
        title: record.title,
        anchorDate: record.anchorDate,
        assignment: record.assignment!,
      }));
  }

  private async scan<T>(storeName: string): Promise<T[]> {
    const db = await this.database.open();
    const transaction = db.transaction(storeName);
    const completion = done(transaction);
    const rows = await new Promise<T[]>((resolve, reject) => {
      const values: T[] = [];
      const cursor = transaction.objectStore(storeName).openCursor();
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return resolve(values);
        values.push(entry.value as T);
        entry.continue();
      };
    });
    await completion;
    return rows;
  }
}
