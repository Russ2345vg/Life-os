import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  JOURNAL_CORRECTION_FIELD,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { FakeClock } from '../../test/helpers/Fakes';
import { cancelDecision, createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  cancelLifeAction,
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import {
  TestDecisionRepository,
  TestJournalRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';
import type { CommitJournalStateInput, JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { CorrectJournalData } from './CorrectJournalData';

const DATE = DayDate.create('2026-08-09');
const OCCURRED_AT = new Date('2026-08-09T10:00:00.000+09:00');
const CORRECTED_AT = new Date('2026-08-09T12:00:00.000+09:00');

describe('CorrectJournalData', () => {
  it('corrects an allowed field and appends a separate immutable event', async () => {
    const action = completeLifeAction(createReadyLifeAction('action', DATE));
    action.clearUncommittedEvents();
    const setup = await createSetup(actionCompletedSource(action.id), { lifeActions: [action] });

    const result = await setup.command.execute({
      commandId: EntityId.create('correction-1'),
      sourceEntryId: EntityId.create('source'),
      newValue: 'Исправленный результат',
      reason: 'В исходной записи была опечатка',
    });

    expect(result.ok).toBe(true);
    expect((await setup.lifeActions.findById(action.id))?.actualResult?.toString()).toBe(
      'Исправленный результат',
    );
    const source = await setup.journal.findById(EntityId.create('source'));
    expect(source?.metadata?.actualResult).toBe('Действие выполнено');
    const correction = await setup.journal.findById(EntityId.create('correction-1'));
    expect(correction).toMatchObject({ type: JOURNAL_ENTRY_TYPE.dataCorrected });
    expect(correction?.correction).toMatchObject({
      field: JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
      previousValue: 'Действие выполнено',
      newValue: 'Исправленный результат',
      reason: 'В исходной записи была опечатка',
    });
  });

  it('is idempotent for the same command and rejects reuse for different data', async () => {
    const action = completeLifeAction(createReadyLifeAction('action', DATE));
    action.clearUncommittedEvents();
    const setup = await createSetup(actionCompletedSource(action.id), { lifeActions: [action] });
    const input = {
      commandId: EntityId.create('correction-1'),
      sourceEntryId: EntityId.create('source'),
      newValue: 'Исправленный результат',
      reason: 'Уточнение фактических данных',
    };

    expect((await setup.command.execute(input)).ok).toBe(true);
    expect((await setup.command.execute(input)).ok).toBe(true);
    const reused = await setup.command.execute({ ...input, newValue: 'Другое значение' });

    expect(reused).toMatchObject({
      ok: false,
      error: { code: 'journal.correction_command_conflict' },
    });
    expect(await setup.journal.findCorrectionsBySourceEntryId(input.sourceEntryId)).toHaveLength(1);
  });

  it('creates a sequential chain and records a return to the original value', async () => {
    const action = completeLifeAction(createReadyLifeAction('action', DATE));
    action.clearUncommittedEvents();
    const setup = await createSetup(actionCompletedSource(action.id), { lifeActions: [action] });
    const sourceEntryId = EntityId.create('source');

    await setup.command.execute({
      commandId: EntityId.create('correction-1'),
      sourceEntryId,
      newValue: 'Второе значение',
      reason: 'Первое уточнение',
    });
    await setup.command.execute({
      commandId: EntityId.create('correction-2'),
      sourceEntryId,
      newValue: 'Действие выполнено',
      reason: 'Возврат после повторной сверки',
    });

    const corrections = await setup.journal.findCorrectionsBySourceEntryId(sourceEntryId);
    expect(corrections).toHaveLength(2);
    expect(corrections[1]?.correction).toMatchObject({
      previousValue: 'Второе значение',
      newValue: 'Действие выполнено',
    });
    expect(corrections[1]?.correction?.previousCorrectionId?.toString()).toBe('correction-1');
  });

  it('supports only cancellation reasons for decisions and cancelled actions', async () => {
    const decision = cancelDecision(createPlannedDecision('decision', DATE));
    const action = cancelLifeAction(createReadyLifeAction('action', DATE));
    decision.clearUncommittedEvents();
    action.clearUncommittedEvents();
    const journal = new TestJournalRepository();
    await journal.appendMany([
      source(
        'decision-source',
        JOURNAL_ENTRY_TYPE.decisionCancelled,
        JOURNAL_SUBJECT_TYPE.decision,
        decision.id,
      ),
      source(
        'action-source',
        JOURNAL_ENTRY_TYPE.actionCancelled,
        JOURNAL_SUBJECT_TYPE.lifeAction,
        action.id,
      ),
    ]);
    const setup = createCommand(journal, [decision], [action]);

    expect(
      (
        await setup.command.execute({
          commandId: EntityId.create('decision-correction'),
          sourceEntryId: EntityId.create('decision-source'),
          newValue: 'Исправленная причина решения',
          reason: 'Уточнена формулировка',
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await setup.command.execute({
          commandId: EntityId.create('action-correction'),
          sourceEntryId: EntityId.create('action-source'),
          newValue: 'Исправленная причина действия',
          reason: 'Уточнена формулировка',
        })
      ).ok,
    ).toBe(true);
    expect((await setup.decisions.findById(decision.id))?.cancelReason?.toString()).toBe(
      'Исправленная причина решения',
    );
    expect((await setup.lifeActions.findById(action.id))?.cancelReason?.toString()).toBe(
      'Исправленная причина действия',
    );
  });

  it('rejects empty reasons, unchanged values and unsupported fields', async () => {
    const action = completeLifeAction(createReadyLifeAction('action', DATE));
    action.clearUncommittedEvents();
    const setup = await createSetup(actionCompletedSource(action.id), { lifeActions: [action] });

    const blank = await setup.command.execute({
      commandId: EntityId.create('blank'),
      sourceEntryId: EntityId.create('source'),
      newValue: 'Новое значение',
      reason: '   ',
    });
    const unchanged = await setup.command.execute({
      commandId: EntityId.create('unchanged'),
      sourceEntryId: EntityId.create('source'),
      newValue: 'Действие выполнено',
      reason: 'Проверка',
    });
    const emptyValue = await setup.command.execute({
      commandId: EntityId.create('empty-value'),
      sourceEntryId: EntityId.create('source'),
      newValue: '   ',
      reason: 'Проверка',
    });
    await setup.journal.append(
      source(
        'unsupported',
        JOURNAL_ENTRY_TYPE.actionRescheduled,
        JOURNAL_SUBJECT_TYPE.lifeAction,
        action.id,
      ),
    );
    const unsupported = await setup.command.execute({
      commandId: EntityId.create('unsupported-command'),
      sourceEntryId: EntityId.create('unsupported'),
      newValue: '2026-08-10',
      reason: 'Проверка запрета',
    });

    expect(blank).toMatchObject({
      ok: false,
      error: { code: 'journal.correction_reason_required' },
    });
    expect(unchanged).toMatchObject({ ok: false, error: { code: 'journal.correction_unchanged' } });
    expect(emptyValue).toMatchObject({
      ok: false,
      error: { code: 'action_actual_result.invalid' },
    });
    expect(unsupported).toMatchObject({
      ok: false,
      error: { code: 'journal.correction_not_allowed' },
    });
    expect(
      await setup.journal.findCorrectionsBySourceEntryId(EntityId.create('source')),
    ).toHaveLength(0);
  });

  it('does not append an event when the current entity cannot accept the change', async () => {
    const action = cancelLifeAction(createReadyLifeAction('action', DATE));
    action.clearUncommittedEvents();
    const setup = await createSetup(actionCompletedSource(action.id), { lifeActions: [action] });

    const result = await setup.command.execute({
      commandId: EntityId.create('invalid-state'),
      sourceEntryId: EntityId.create('source'),
      newValue: 'Новое значение',
      reason: 'Проверка состояния',
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'life_action.actual_result_correction_requires_completed' },
    });
    expect(await setup.journal.findById(EntityId.create('invalid-state'))).toBeNull();
  });

  it('handles missing source and missing related entity without writing', async () => {
    const journal = new TestJournalRepository();
    const missingSource = createCommand(journal, [], []);
    const first = await missingSource.command.execute({
      commandId: EntityId.create('missing-source-command'),
      sourceEntryId: EntityId.create('missing-source'),
      newValue: 'Новое значение',
      reason: 'Проверка',
    });
    await journal.append(actionCompletedSource(EntityId.create('missing-action')));
    const second = await missingSource.command.execute({
      commandId: EntityId.create('missing-entity-command'),
      sourceEntryId: EntityId.create('source'),
      newValue: 'Новое значение',
      reason: 'Проверка',
    });

    expect(first).toMatchObject({ ok: false, error: { code: 'journal.source_not_found' } });
    expect(second).toMatchObject({
      ok: false,
      error: { code: 'journal.correction_entity_not_found' },
    });
  });

  it('does not mutate repository state when the atomic commit fails', async () => {
    const action = completeLifeAction(createReadyLifeAction('action', DATE));
    action.clearUncommittedEvents();
    const journal = new TestJournalRepository();
    await journal.append(actionCompletedSource(action.id));
    const decisions = new TestDecisionRepository();
    const lifeActions = new TestLifeActionRepository([action]);
    const unitOfWork: JournalUnitOfWork = {
      commit: async () => {
        throw new DomainError('test.write_failed', 'Запись события не удалась.');
      },
    };
    const command = new CorrectJournalData(
      journal,
      decisions,
      lifeActions,
      unitOfWork,
      new FakeClock(CORRECTED_AT),
    );

    const result = await command.execute({
      commandId: EntityId.create('failed-correction'),
      sourceEntryId: EntityId.create('source'),
      newValue: 'Несохранённый результат',
      reason: 'Проверка атомарности',
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'test.write_failed' } });
    expect((await lifeActions.findById(action.id))?.actualResult?.toString()).toBe(
      'Действие выполнено',
    );
    expect(await journal.findById(EntityId.create('failed-correction'))).toBeNull();
  });
});

async function createSetup(
  sourceEntry: JournalEntry,
  entities: { readonly lifeActions?: readonly ReturnType<typeof createReadyLifeAction>[] },
) {
  const journal = new TestJournalRepository();
  await journal.append(sourceEntry);
  return createCommand(journal, [], entities.lifeActions ?? []);
}

function createCommand(
  journal: TestJournalRepository,
  decisions: ConstructorParameters<typeof TestDecisionRepository>[0],
  lifeActions: ConstructorParameters<typeof TestLifeActionRepository>[0],
) {
  const decisionRepository = new TestDecisionRepository(decisions);
  const lifeActionRepository = new TestLifeActionRepository(lifeActions);
  const unitOfWork: JournalUnitOfWork = {
    commit: async (input: CommitJournalStateInput) => {
      for (const change of input.decisions ?? []) await decisionRepository.save(change.decision);
      for (const change of input.lifeActions ?? [])
        await lifeActionRepository.save(change.lifeAction);
      await journal.appendMany(input.journalEntries);
    },
  };
  return {
    journal,
    decisions: decisionRepository,
    lifeActions: lifeActionRepository,
    command: new CorrectJournalData(
      journal,
      decisionRepository,
      lifeActionRepository,
      unitOfWork,
      new FakeClock(CORRECTED_AT),
    ),
  };
}

function actionCompletedSource(actionId: EntityId): JournalEntry {
  return JournalEntry.create({
    id: EntityId.create('source'),
    type: JOURNAL_ENTRY_TYPE.actionCompleted,
    occurredAt: OCCURRED_AT,
    effectiveDate: DATE,
    subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
    subjectId: actionId,
    labelAtEvent: 'Действие action',
    metadata: { actualResult: 'Действие выполнено' },
    createdAt: OCCURRED_AT,
  });
}

function source(
  id: string,
  type: JournalEntry['type'],
  subjectType: JournalEntry['subjectType'],
  subjectId: EntityId,
): JournalEntry {
  return JournalEntry.create({
    id: EntityId.create(id),
    type,
    occurredAt: OCCURRED_AT,
    effectiveDate: DATE,
    subjectType,
    subjectId,
    labelAtEvent: subjectId.toString(),
    createdAt: OCCURRED_AT,
  });
}
