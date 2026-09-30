import { DayDate, type EntityId } from '../../domain';
import {
  sameMemoryContent,
  summarizeMemoryEvent,
  validateMemoryEvent,
  type MemoryEvent,
  type MemoryEventSummary,
} from '../../domain/memory';
import type {
  MemoryCursor,
  MemoryPage,
  MemoryQuery,
  MemoryRepository,
  MemorySaveOptions,
} from '../../application/ports/MemoryRepository';
import { DomainError } from '../../shared/errors/DomainError';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import { LIFE_OS_STORE, type LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { MemoryEventRecordMapper } from './mappers/MemoryEventRecordMapper';
import type { MemoryEventRecord } from './records/MemoryEventRecord';

export class IndexedDbMemoryRepository implements MemoryRepository {
  public constructor(readonly database: LifeOsIndexedDb) {}

  public async findById(id: EntityId): Promise<MemoryEvent | null> {
    const db = await this.database.open();
    const raw = await request<unknown>(
      db
        .transaction(LIFE_OS_STORE.memoryEvents)
        .objectStore(LIFE_OS_STORE.memoryEvents)
        .get(id.toString()),
    );
    return raw === undefined ? null : MemoryEventRecordMapper.fromRecord(raw);
  }

  public async findSummaryById(id: EntityId): Promise<MemoryEventSummary | null> {
    const db = await this.database.open();
    const raw = await request<MemoryEventRecord | undefined>(
      db
        .transaction(LIFE_OS_STORE.memoryEvents)
        .objectStore(LIFE_OS_STORE.memoryEvents)
        .get(id.toString()),
    );
    if (raw === undefined) return null;
    const event = MemoryEventRecordMapper.fromRecord(raw);
    return summarizeMemoryEvent(event, event.photo !== null || raw.syncAttachment != null);
  }

  public async save(
    entry: MemoryEvent,
    expectedVersion: number | null,
    options?: MemorySaveOptions,
  ): Promise<MemoryEvent> {
    const valid = validateMemoryEvent(entry);
    if (expectedVersion !== null && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1))
      throw conflict();
    if (valid.version !== (expectedVersion ?? 0) || (options?.removePhoto && valid.photo !== null))
      throw conflict();
    const db = await this.database.open();
    const transaction = db.transaction(LIFE_OS_STORE.memoryEvents, 'readwrite');
    const completion = done(transaction);
    void completion.catch(() => undefined);
    try {
      const store = transaction.objectStore(LIFE_OS_STORE.memoryEvents);
      const raw = await request<MemoryEventRecord | undefined>(store.get(valid.id.toString()));
      const current = raw === undefined ? null : MemoryEventRecordMapper.fromRecord(raw);
      // A transfer can materialize bytes without changing the user's content version.
      // null keeps the current photo; removal is an explicit application command option.
      const content = {
        ...valid,
        photo: options?.removePhoto ? null : (valid.photo ?? current?.photo ?? null),
      };
      if ((current?.version ?? null) !== expectedVersion) {
        if (
          current !== null &&
          current.version === (expectedVersion ?? 0) + 1 &&
          sameMemoryContent(current, content) &&
          (!options?.removePhoto || raw?.syncAttachment == null)
        ) {
          await completion;
          return current;
        }
        throw conflict();
      }
      const next = validateMemoryEvent(
        { ...content, version: (expectedVersion ?? 0) + 1 },
        { persisted: true },
      );
      const record = MemoryEventRecordMapper.toRecord(next);
      await request(
        store.put({
          ...record,
          syncAttachment: options?.removePhoto ? null : (raw?.syncAttachment ?? null),
        }),
      );
      await completion;
      return next;
    } catch (error: unknown) {
      try {
        transaction.abort();
      } catch {
        /* Transaction already settled. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }

  public async list(query: MemoryQuery): Promise<MemoryPage> {
    validateYear(query.year);
    if (
      query.cursor &&
      (Number(DayDate.create(query.cursor.occurredOn).toString().slice(0, 4)) !== query.year ||
        !Number.isFinite(Date.parse(query.cursor.createdAt)) ||
        !query.cursor.id.trim())
    )
      throw new DomainError('memory.invalid_cursor', 'Обновите список после изменения года.');
    const search = query.search?.trim().toLocaleLowerCase('ru');
    const matches = (event: MemoryEventSummary) =>
      (event.deletedAt !== null) === query.deleted &&
      (!query.kind || event.kind === query.kind) &&
      (!query.sphereId || event.context?.sphereId === query.sphereId) &&
      (!query.highlightOnly || event.isHighlight) &&
      (!search || `${event.title} ${event.body}`.toLocaleLowerCase('ru').includes(search));
    const items = await this.scan(query.year, matches, 31, query.cursor);
    const hasMore = items.length > 30;
    const page = items.slice(0, 30);
    const last = page.at(-1);
    return { items: page, nextCursor: hasMore && last ? cursorOf(last) : null };
  }

  public async listYear(year: number): Promise<readonly MemoryEventSummary[]> {
    validateYear(year);
    return this.scan(year, (event) => event.deletedAt === null);
  }

  private async scan(
    year: number,
    matches: (event: MemoryEventSummary) => boolean,
    limit = Number.POSITIVE_INFINITY,
    after?: MemoryCursor,
  ): Promise<MemoryEventSummary[]> {
    const db = await this.database.open();
    const transaction = db.transaction(LIFE_OS_STORE.memoryEvents);
    const completion = done(transaction);
    void completion.catch(() => undefined);
    const index = transaction.objectStore(LIFE_OS_STORE.memoryEvents).index('byOccurrence');
    const start = `${String(year).padStart(4, '0')}-01-01`;
    const end = `${String(year).padStart(4, '0')}-12-31`;
    const range = after
      ? IDBKeyRange.bound(
          [start, '', ''],
          [after.occurredOn, after.createdAt, after.id],
          false,
          true,
        )
      : IDBKeyRange.bound([start, '', ''], [end, '\uffff', '\uffff']);
    const items = await new Promise<MemoryEventSummary[]>((resolve, reject) => {
      const values: MemoryEventSummary[] = [];
      const cursor = index.openCursor(range, 'prev');
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (current === null || values.length >= limit) {
          resolve(values);
          return;
        }
        try {
          const raw: unknown = current.value;
          const event = MemoryEventRecordMapper.fromRecord(raw);
          const protectedPhoto =
            typeof raw === 'object' &&
            raw !== null &&
            'syncAttachment' in raw &&
            raw.syncAttachment != null;
          const summary = summarizeMemoryEvent(event, event.photo !== null || protectedPhoto);
          if (matches(summary)) values.push(summary);
          current.continue();
        } catch (error: unknown) {
          reject(error);
        }
      };
    });
    await completion;
    return items;
  }
}

function cursorOf(event: MemoryEventSummary): MemoryCursor {
  return {
    occurredOn: event.occurredOn.toString(),
    createdAt: event.createdAt,
    id: event.id.toString(),
  };
}
function validateYear(year: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999)
    throw new DomainError('memory.invalid_year', 'Выберите год от 1 до 9999.');
}
function conflict(): DomainError {
  return new DomainError(
    'persistence.version_conflict',
    'Воспоминание изменилось на другом устройстве. Обновите данные.',
  );
}
