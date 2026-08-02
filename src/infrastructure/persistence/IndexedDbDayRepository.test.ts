import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { Day, DayDate, EntityId } from '../../domain';
import { IndexedDbDayRepository } from './IndexedDbDayRepository';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DayRecordMapper } from './mappers/DayRecordMapper';

const DATE = DayDate.create('2026-08-02');
const OPENED_AT = new Date('2026-08-02T06:00:00.000Z');

describe('IndexedDbDayRepository', () => {
  it('сохраняет день, находит его через byDate и восстанавливает через mapper', async () => {
    const { database, repository } = createContext();
    const day = createDay('day-1');
    const sourceEventCount = day.getUncommittedEvents().length;

    await repository.save(day);
    const restored = await repository.findByDate(DATE);

    expect(restored).not.toBe(day);
    expect(restored).not.toBeNull();
    expect(DayRecordMapper.toRecord(restored!)).toEqual(DayRecordMapper.toRecord(day));
    expect(day.getUncommittedEvents()).toHaveLength(sourceEventCount);
    expect(restored?.getUncommittedEvents()).toHaveLength(0);
    database.close();
  });

  it('возвращает null для неизвестной даты', async () => {
    const { database, repository } = createContext();

    await expect(repository.findByDate(DATE)).resolves.toBeNull();
    database.close();
  });

  it('повторным save обновляет существующий день и сохраняет version', async () => {
    const { database, repository } = createContext();
    const day = createDay('day-1');
    await repository.save(day);
    day.recordFirstActivity(new Date('2026-08-02T06:15:00.000Z'), id('activity-event'));

    await repository.save(day);
    const restored = await repository.findByDate(DATE);

    expect(restored?.version).toBe(2);
    expect(restored?.firstActivityAt?.toISOString()).toBe('2026-08-02T06:15:00.000Z');
    database.close();
  });

  it('не допускает два разных дня одной даты', async () => {
    const { database, repository } = createContext();
    await repository.save(createDay('day-1'));

    await expect(repository.save(createDay('day-2'))).rejects.toMatchObject({
      code: 'persistence.constraint_violation',
    });
    expect((await repository.findByDate(DATE))?.id.toString()).toBe('day-1');
    database.close();
  });

  it('не маскирует ошибку mapper для повреждённой записи', async () => {
    const { database, repository } = createContext();
    const connection = await database.open();
    const corruptedRecord = {
      ...DayRecordMapper.toRecord(createDay('corrupted')),
      createdAt: 'not-a-date',
    };
    await executeIndexedDbRequest(connection, LIFE_OS_STORE.days, 'readwrite', (store) =>
      store.put(corruptedRecord),
    );

    await expect(repository.findByDate(DATE)).rejects.toMatchObject({
      code: 'persistence.invalid_date',
    });
    database.close();
  });
});

function createContext(): {
  readonly database: LifeOsIndexedDb;
  readonly repository: IndexedDbDayRepository;
} {
  const database = new LifeOsIndexedDb(new IDBFactory());
  return { database, repository: new IndexedDbDayRepository(database) };
}

function createDay(dayId: string): Day {
  return Day.openCurrent({
    id: id(dayId),
    currentDate: DATE,
    occurredAt: OPENED_AT,
    createdEventId: id(`${dayId}-created-event`),
    openedEventId: id(`${dayId}-opened-event`),
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
