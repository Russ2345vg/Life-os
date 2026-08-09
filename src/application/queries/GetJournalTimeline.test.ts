import { describe, expect, it } from 'vitest';
import {
  ActionActualResult,
  DayDate,
  EntityId,
  JOURNAL_CORRECTION_FIELD,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
} from '../../domain';
import {
  TestDecisionRepository,
  TestJournalRepository,
  TestLifeActionRepository,
  TestSphereRepository,
} from '../../test/helpers/TestRepositories';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { GetJournalTimeline } from './GetJournalTimeline';

const DATE = DayDate.create('2026-08-09');
const FIRST_TIME = new Date('2026-08-09T10:00:00.000+09:00');
const SECOND_TIME = new Date('2026-08-09T12:00:00.000+09:00');

describe('GetJournalTimeline corrections', () => {
  it('exposes only a safe current correction target and resolves the source of a correction', async () => {
    const action = completeLifeAction(createReadyLifeAction('action', DATE));
    action.correctActualResult(ActionActualResult.create('Исправленный результат'));
    action.clearUncommittedEvents();
    const source = sourceEntry(action.id);
    const correction = correctionEntry(action.id, source.id);
    const journal = new TestJournalRepository();
    await journal.appendMany([source, correction]);
    const query = new GetJournalTimeline(
      journal,
      new TestDecisionRepository(),
      new TestLifeActionRepository([action]),
      new TestSphereRepository(),
    );

    const result = await query.execute({ startDate: DATE, endDate: DATE });

    expect(result.items[0]?.correctionTarget).toMatchObject({
      field: JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
      currentValue: 'Исправленный результат',
    });
    expect(result.items[1]?.correctionTarget).toBeNull();
    expect(result.items[1]?.sourceEntry?.id.toString()).toBe('source');
  });
});

function sourceEntry(actionId: EntityId): JournalEntry {
  return JournalEntry.create({
    id: EntityId.create('source'),
    type: JOURNAL_ENTRY_TYPE.actionCompleted,
    occurredAt: FIRST_TIME,
    effectiveDate: DATE,
    subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
    subjectId: actionId,
    labelAtEvent: 'Действие action',
    metadata: { actualResult: 'Действие выполнено' },
    createdAt: FIRST_TIME,
  });
}

function correctionEntry(actionId: EntityId, sourceEntryId: EntityId): JournalEntry {
  const commandId = EntityId.create('correction');
  return JournalEntry.create({
    id: commandId,
    type: JOURNAL_ENTRY_TYPE.dataCorrected,
    occurredAt: SECOND_TIME,
    effectiveDate: DATE,
    subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
    subjectId: actionId,
    labelAtEvent: 'Действие action',
    correction: {
      sourceEntryId,
      previousCorrectionId: null,
      field: JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
      previousValue: 'Действие выполнено',
      newValue: 'Исправленный результат',
      reason: 'Проверена исходная запись',
      commandId,
    },
    createdAt: SECOND_TIME,
  });
}
