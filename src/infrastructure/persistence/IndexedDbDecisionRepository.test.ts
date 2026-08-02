import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, type Decision } from '../../domain';
import {
  archiveDecision,
  confirmDecision,
  createDecisionDraft,
  createPlannedDecision,
  decisionId,
} from '../../test/helpers/DecisionTestFactory';
import { IndexedDbDecisionRepository } from './IndexedDbDecisionRepository';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';

const DATE = DayDate.create('2026-08-02');

describe('IndexedDbDecisionRepository', () => {
  it('сохраняет решение и находит восстановленную сущность по id', async () => {
    const { database, repository } = createContext();
    const decision = createDecisionDraft('decision-1');
    const sourceEventCount = decision.getUncommittedEvents().length;

    await repository.save(decision);
    const restored = await repository.findById(decision.id);

    expect(restored).not.toBe(decision);
    expect(restored).not.toBeNull();
    expect(DecisionRecordMapper.toRecord(restored!)).toEqual(
      DecisionRecordMapper.toRecord(decision),
    );
    expect(decision.getUncommittedEvents()).toHaveLength(sourceEventCount);
    expect(restored?.getUncommittedEvents()).toHaveLength(0);
    await expect(repository.findById(decisionId('missing'))).resolves.toBeNull();
    database.close();
  });

  it('находит через byPlannedDate несколько решений одной даты', async () => {
    const { database, repository } = createContext();
    const first = createPlannedDecision('first', DATE);
    const second = createPlannedDecision('second', DATE);
    const anotherDate = createPlannedDecision('another', DayDate.create('2026-08-03'));
    await repository.save(first);
    await repository.save(second);
    await repository.save(anotherDate);

    const found = await repository.findByDate(DATE);

    expect(found.map((decision) => decision.id.toString())).toEqual(['first', 'second']);
    database.close();
  });

  it('не включает черновик без plannedDate в поиск по дате', async () => {
    const { database, repository } = createContext();
    const draft = createDecisionDraft('draft');
    await repository.save(draft);

    await expect(repository.findByDate(DATE)).resolves.toEqual([]);
    await expect(repository.findById(draft.id)).resolves.not.toBeNull();
    database.close();
  });

  it('повторным save обновляет существующий id и соответствующий индекс даты', async () => {
    const { database, repository } = createContext();
    const decision = createPlannedDecision('decision-1', DATE);
    await repository.save(decision);
    decision.reschedule(
      DayDate.create('2026-08-04'),
      new Date('2026-08-02T07:00:00.000Z'),
      decisionId('rescheduled-event'),
    );

    await repository.save(decision);

    await expect(repository.findByDate(DATE)).resolves.toEqual([]);
    const restored = await repository.findById(decision.id);
    expect(restored?.plannedDate?.toString()).toBe('2026-08-04');
    expect(restored?.rescheduleCount).toBe(1);
    database.close();
  });

  it('восстанавливает все основные состояния и version завершённого решения', async () => {
    const { database, repository } = createContext();
    const decision = archiveDecision(confirmDecision(createPlannedDecision('complete', DATE)));
    await repository.save(decision);

    const restored = await repository.findById(decision.id);

    expect(restored).not.toBeNull();
    expect(DecisionRecordMapper.toRecord(restored!)).toEqual(
      DecisionRecordMapper.toRecord(decision),
    );
    expect(restored?.getUncommittedEvents()).toHaveLength(0);
    database.close();
  });

  it('возвращает новый массив и новые сущности при каждом чтении даты', async () => {
    const { database, repository } = createContext();
    await repository.save(createPlannedDecision('decision-1', DATE));
    const first = await repository.findByDate(DATE);

    (first as Decision[]).length = 0;
    const second = await repository.findByDate(DATE);
    const third = await repository.findByDate(DATE);

    expect(second).toHaveLength(1);
    expect(third).not.toBe(second);
    expect(third[0]).not.toBe(second[0]);
    database.close();
  });

  it('не маскирует ошибку mapper для повреждённой записи', async () => {
    const { database, repository } = createContext();
    const connection = await database.open();
    const decision = createDecisionDraft('corrupted');
    const corruptedRecord = {
      ...DecisionRecordMapper.toRecord(decision),
      title: null,
    };
    await executeIndexedDbRequest(connection, LIFE_OS_STORE.decisions, 'readwrite', (store) =>
      store.put(corruptedRecord),
    );

    await expect(repository.findById(decision.id)).rejects.toMatchObject({
      code: 'persistence.invalid_record',
    });
    database.close();
  });
});

function createContext(): {
  readonly database: LifeOsIndexedDb;
  readonly repository: IndexedDbDecisionRepository;
} {
  const database = new LifeOsIndexedDb(new IDBFactory());
  return { database, repository: new IndexedDbDecisionRepository(database) };
}
