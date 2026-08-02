import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, type LifeAction } from '../../domain';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  lifeActionId,
} from '../../test/helpers/LifeActionTestFactory';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';

const DATE = DayDate.create('2026-08-01');
const ANOTHER_DATE = DayDate.create('2026-08-02');
const DECISION_ID = EntityId.create('decision-1');

describe('IndexedDbLifeActionRepository', () => {
  it('сохраняет действие и находит новую сущность по id без новых событий', async () => {
    const { database, repository } = createContext();
    const lifeAction = createLifeActionDraft('action-1');
    const sourceEventCount = lifeAction.getUncommittedEvents().length;

    await repository.save(lifeAction);
    const restored = await repository.findById(lifeAction.id);

    expect(restored).not.toBe(lifeAction);
    expect(restored).not.toBeNull();
    expect(LifeActionRecordMapper.toRecord(restored!)).toEqual(
      LifeActionRecordMapper.toRecord(lifeAction),
    );
    expect(lifeAction.getUncommittedEvents()).toHaveLength(sourceEventCount);
    expect(restored?.getUncommittedEvents()).toHaveLength(0);
    await expect(repository.findById(lifeActionId('missing'))).resolves.toBeNull();
    database.close();
  });

  it('повторным save обновляет существующий id и индекс plannedDate', async () => {
    const { database, repository } = createContext();
    const lifeAction = createLifeActionDraft('same-id');
    await repository.save(lifeAction);
    lifeAction.makeReady({
      expectedResult: createReadyLifeAction('source', DATE).expectedResult!,
      plannedDate: DATE,
      occurredAt: new Date('2026-08-01T00:00:00.000Z'),
      eventId: lifeActionId('same-id-ready-event'),
    });

    await repository.save(lifeAction);

    const restored = await repository.findById(lifeAction.id);
    expect(restored?.version).toBe(2);
    expect(restored?.plannedDate?.toString()).toBe(DATE.toString());
    await expect(repository.findByDate(DATE)).resolves.toHaveLength(1);
    database.close();
  });

  it('находит через byPlannedDate несколько действий и исключает другую дату и черновик', async () => {
    const { database, repository } = createContext();
    await repository.save(createReadyLifeAction('first', DATE));
    await repository.save(createReadyLifeAction('second', DATE));
    await repository.save(createReadyLifeAction('another-date', ANOTHER_DATE));
    const draft = createLifeActionDraft('draft');
    await repository.save(draft);

    const found = await repository.findByDate(DATE);

    expect(found.map((lifeAction) => lifeAction.id.toString())).toEqual(['first', 'second']);
    await expect(repository.findById(draft.id)).resolves.not.toBeNull();
    database.close();
  });

  it('находит через byDecisionId только связанные с указанным решением действия', async () => {
    const { database, repository } = createContext();
    await repository.save(createLifeActionDraft('linked', { decisionId: DECISION_ID }));
    await repository.save(
      createLifeActionDraft('another-decision', {
        decisionId: EntityId.create('decision-2'),
      }),
    );
    const unlinked = createLifeActionDraft('unlinked');
    await repository.save(unlinked);

    const found = await repository.findByDecisionId(DECISION_ID);

    expect(found.map((lifeAction) => lifeAction.id.toString())).toEqual(['linked']);
    await expect(repository.findById(unlinked.id)).resolves.not.toBeNull();
    database.close();
  });

  it('восстанавливает completed, cancelled, archived и version полностью', async () => {
    const { database, repository } = createContext();
    const completedAndArchived = archiveLifeAction(
      completeLifeAction(createReadyLifeAction('completed', DATE)),
    );
    const cancelled = cancelLifeAction(createLifeActionDraft('cancelled'));
    await repository.save(completedAndArchived);
    await repository.save(cancelled);

    const restoredCompleted = await repository.findById(completedAndArchived.id);
    const restoredCancelled = await repository.findById(cancelled.id);

    expect(LifeActionRecordMapper.toRecord(restoredCompleted!)).toEqual(
      LifeActionRecordMapper.toRecord(completedAndArchived),
    );
    expect(LifeActionRecordMapper.toRecord(restoredCancelled!)).toEqual(
      LifeActionRecordMapper.toRecord(cancelled),
    );
    expect(restoredCompleted?.getUncommittedEvents()).toHaveLength(0);
    expect(restoredCancelled?.getUncommittedEvents()).toHaveLength(0);
    database.close();
  });

  it('возвращает независимые массивы и новые сущности при каждом списочном чтении', async () => {
    const { database, repository } = createContext();
    await repository.save(createReadyLifeAction('linked', DATE, { decisionId: DECISION_ID }));
    const first = await repository.findByDate(DATE);
    const byDecision = await repository.findByDecisionId(DECISION_ID);

    (first as LifeAction[]).length = 0;
    (byDecision as LifeAction[]).length = 0;
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
    const lifeAction = createLifeActionDraft('corrupted');
    const corruptedRecord = {
      ...LifeActionRecordMapper.toRecord(lifeAction),
      title: null,
    };
    await executeIndexedDbRequest(connection, LIFE_OS_STORE.lifeActions, 'readwrite', (store) =>
      store.put(corruptedRecord),
    );

    await expect(repository.findById(lifeAction.id)).rejects.toMatchObject({
      code: 'persistence.invalid_record',
    });
    database.close();
  });
});

function createContext(): {
  readonly database: LifeOsIndexedDb;
  readonly repository: IndexedDbLifeActionRepository;
} {
  const database = new LifeOsIndexedDb(new IDBFactory());
  return { database, repository: new IndexedDbLifeActionRepository(database) };
}
