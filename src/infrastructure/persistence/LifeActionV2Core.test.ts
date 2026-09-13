import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { CompleteLifeAction } from '../../application/commands/CompleteLifeAction';
import { CreateLifeActionDraft } from '../../application/commands/CreateLifeActionDraft';
import {
  ActionActualResult,
  DayDate,
  EntityId,
  JournalEntry,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  LifeActionTitle,
} from '../../domain';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { InMemoryDecisionRepository } from './InMemoryDecisionRepository';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { IndexedDbJournalRepository } from './IndexedDbJournalRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const CREATED = new Date('2026-09-01T09:00:00+09:00');
const COMPLETED = new Date('2026-09-13T17:00:00+09:00');
const DATE = DayDate.create('2026-09-13');

describe('LifeAction V2 core persistence', () => {
  it('rolls back a simple completion when the Journal write fails', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbLifeActionRepository(database);
      const journal = new IndexedDbJournalRepository(database);
      const clock = new FakeClock(CREATED);
      const created = await new CreateLifeActionDraft(
        repository,
        new InMemoryDecisionRepository(),
        clock,
        new FakeIdGenerator('draft'),
      ).execute({ title: LifeActionTitle.create('Действие') });
      if (!created.ok) throw created.error;
      const collision = JournalEntry.create({
        id: EntityId.create('collision-1'),
        type: JOURNAL_ENTRY_TYPE.dayStarted,
        subjectType: JOURNAL_SUBJECT_TYPE.day,
        occurredAt: COMPLETED,
        createdAt: COMPLETED,
        effectiveDate: DATE,
      });
      await journal.append(collision);
      clock.setTime(COMPLETED);
      const result = await new CompleteLifeAction(
        repository,
        clock,
        new FakeIdGenerator('collision'),
        new IndexedDbJournalUnitOfWork(database),
      ).execute({ lifeActionId: created.value.id });
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'persistence.transaction_failed' },
      });
      await expect(repository.findById(created.value.id)).resolves.toMatchObject({
        status: 'draft',
        completedAt: null,
        actualResult: null,
        version: 1,
      });
      await expect(journal.findByEffectiveDateRange(DATE, DATE)).resolves.toEqual([collision]);
    } finally {
      database.close();
    }
  });

  it.each(['draft', 'ready', 'in_progress'] as const)(
    'completes %s without a session or result note, preserving one Journal fact after reopen and retry',
    async (status) => {
      const factory = new IDBFactory();
      const database = new LifeOsIndexedDb(factory);
      const repository = new IndexedDbLifeActionRepository(database);
      const clock = new FakeClock(CREATED);
      const ids = new FakeIdGenerator('core');
      try {
        const created = await new CreateLifeActionDraft(
          repository,
          new InMemoryDecisionRepository(),
          clock,
          ids,
        ).execute({ title: LifeActionTitle.create('Прогуляться') });
        if (!created.ok) throw created.error;
        let action = created.value;
        if (status !== 'draft') {
          action = createReadyLifeAction(action.id.toString(), DATE);
          if (status === 'in_progress') markLifeActionInProgress(action);
          await repository.save(action);
        }
        clock.setTime(COMPLETED);
        const complete = new CompleteLifeAction(
          repository,
          clock,
          ids,
          new IndexedDbJournalUnitOfWork(database),
        );
        const completed = await complete.execute({ lifeActionId: action.id });
        expect(completed).toMatchObject({
          ok: true,
          value: { status: 'completed', actualResult: null, completedAt: COMPLETED },
        });
        if (!completed.ok) throw completed.error;
        const entries = await new IndexedDbJournalRepository(database).findByEffectiveDateRange(
          DATE,
          DATE,
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          type: JOURNAL_ENTRY_TYPE.actionCompleted,
          subjectId: action.id,
          occurredAt: COMPLETED,
        });
        expect(entries[0]?.metadata).toBeNull();
        await expect(
          new IndexedDbJournalRepository(database).findByEffectiveDateRange(
            DayDate.create('2026-09-01'),
            DayDate.create('2026-09-01'),
          ),
        ).resolves.toEqual([]);
        database.close();
        const restored = await repository.findById(action.id);
        expect(restored).toMatchObject({
          status: 'completed',
          completedAt: COMPLETED,
          actualResult: null,
          goalId: null,
        });
        expect(restored?.startedAt).toEqual(action.startedAt);
        if (status === 'draft') {
          expect(restored?.plannedDate).toBeNull();
          expect(restored?.expectedResult).toBeNull();
        }
        clock.setTime(new Date('2026-09-14T12:00:00+09:00'));
        const retried = await complete.execute({
          lifeActionId: action.id,
          actualResult: ActionActualResult.create('Повтор'),
        });
        expect(retried).toMatchObject({
          ok: true,
          value: { version: completed.value.version, completedAt: COMPLETED, actualResult: null },
        });
        await expect(
          new IndexedDbJournalRepository(database).findByEffectiveDateRange(
            DATE,
            DayDate.create('2026-09-14'),
          ),
        ).resolves.toEqual(entries);
      } finally {
        database.close();
      }
    },
  );
});
