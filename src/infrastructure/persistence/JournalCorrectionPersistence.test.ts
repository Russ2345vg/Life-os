import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { CorrectJournalData } from '../../application';
import {
  ActionActualResult,
  DayDate,
  EntityId,
  JOURNAL_CORRECTION_FIELD,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
} from '../../domain';
import { FakeClock } from '../../test/helpers/Fakes';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbDecisionRepository } from './IndexedDbDecisionRepository';
import { IndexedDbJournalRepository } from './IndexedDbJournalRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { JournalEntryRecordMapper } from './mappers/JournalEntryRecordMapper';

const DATE = DayDate.create('2026-08-09');
const OCCURRED_AT = new Date('2026-08-09T10:00:00.000+09:00');
const CORRECTED_AT = new Date('2026-08-09T12:00:00.000+09:00');

describe('Journal correction persistence', () => {
  it('rehydrates stage 16.1 records that do not contain correction data', () => {
    const restored = JournalEntryRecordMapper.fromRecord({
      id: 'legacy-journal-entry',
      type: JOURNAL_ENTRY_TYPE.actionCompleted,
      occurredAt: OCCURRED_AT.toISOString(),
      effectiveDate: DATE.toString(),
      subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
      subjectId: 'legacy-action',
      sphereId: null,
      labelAtEvent: 'Старое действие',
      metadata: { actualResult: 'Старый результат' },
      createdAt: OCCURRED_AT.toISOString(),
    });

    expect(restored.id.toString()).toBe('legacy-journal-entry');
    expect(restored.metadata?.actualResult).toBe('Старый результат');
    expect(restored.correction).toBeNull();
  });

  it('persists the corrected entity and correction chain after reopening IndexedDB', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const firstActions = new IndexedDbLifeActionRepository(firstDatabase);
    const firstJournal = new IndexedDbJournalRepository(firstDatabase);
    const action = completeLifeAction(createReadyLifeAction('action-persisted', DATE));
    action.clearUncommittedEvents();
    await firstActions.save(action);
    await firstJournal.append(sourceEntry(action.id));
    const command = new CorrectJournalData(
      firstJournal,
      new IndexedDbDecisionRepository(firstDatabase),
      firstActions,
      new IndexedDbJournalUnitOfWork(firstDatabase),
      new FakeClock(CORRECTED_AT),
    );

    const result = await command.execute({
      commandId: EntityId.create('correction-persisted'),
      sourceEntryId: EntityId.create('source-persisted'),
      newValue: 'Сохранённое исправление',
      reason: 'Проверка после перезапуска',
    });
    expect(result.ok).toBe(true);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const reopenedActions = new IndexedDbLifeActionRepository(reopenedDatabase);
    const reopenedJournal = new IndexedDbJournalRepository(reopenedDatabase);
    expect((await reopenedActions.findById(action.id))?.actualResult?.toString()).toBe(
      'Сохранённое исправление',
    );
    expect((await reopenedJournal.findById(EntityId.create('source-persisted')))?.type).toBe(
      JOURNAL_ENTRY_TYPE.actionCompleted,
    );
    expect(
      (await reopenedJournal.findById(EntityId.create('correction-persisted')))?.correction,
    ).toMatchObject({
      field: JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
      previousValue: 'Действие выполнено',
      newValue: 'Сохранённое исправление',
      reason: 'Проверка после перезапуска',
    });
    reopenedDatabase.close();
  });

  it('rolls back the entity change when adding the correction event fails', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const actions = new IndexedDbLifeActionRepository(database);
    const journal = new IndexedDbJournalRepository(database);
    const unitOfWork = new IndexedDbJournalUnitOfWork(database);
    const action = completeLifeAction(createReadyLifeAction('action-atomic', DATE));
    action.clearUncommittedEvents();
    await actions.save(action);
    const original = sourceEntry(action.id);
    await journal.append(original);
    const changed = await actions.findById(action.id);
    changed!.correctActualResult(ActionActualResult.create('Значение, которое откатится'));
    const duplicateCorrection = correctionEntry(original, original.id);

    await expect(
      unitOfWork.commit({
        lifeActions: [{ lifeAction: changed!, expectedVersion: action.version }],
        journalEntries: [duplicateCorrection],
      }),
    ).rejects.toMatchObject({ code: 'persistence.transaction_failed' });

    expect((await actions.findById(action.id))?.actualResult?.toString()).toBe(
      'Действие выполнено',
    );
    expect(await journal.findCorrectionsBySourceEntryId(original.id)).toHaveLength(0);
    database.close();
  });
});

function sourceEntry(actionId: EntityId): JournalEntry {
  return JournalEntry.create({
    id: EntityId.create('source-persisted'),
    type: JOURNAL_ENTRY_TYPE.actionCompleted,
    occurredAt: OCCURRED_AT,
    effectiveDate: DATE,
    subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
    subjectId: actionId,
    labelAtEvent: 'Действие action-persisted',
    metadata: { actualResult: 'Действие выполнено' },
    createdAt: OCCURRED_AT,
  });
}

function correctionEntry(source: JournalEntry, id: EntityId): JournalEntry {
  return JournalEntry.create({
    id,
    type: JOURNAL_ENTRY_TYPE.dataCorrected,
    occurredAt: CORRECTED_AT,
    effectiveDate: DATE,
    subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
    subjectId: source.subjectId,
    labelAtEvent: source.labelAtEvent,
    correction: {
      sourceEntryId: source.id,
      previousCorrectionId: null,
      field: JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
      previousValue: 'Действие выполнено',
      newValue: 'Значение, которое откатится',
      reason: 'Проверка атомарности',
      commandId: id,
    },
    createdAt: CORRECTED_AT,
  });
}
