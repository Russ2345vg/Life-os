import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { STATISTICS_PERIOD_KIND } from '../../application';
import {
  ActionSession,
  DayDate,
  Decision,
  DecisionTitle,
  DECISION_KIND,
  EntityId,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
  LifeAction,
  LifeActionTitle,
  SESSION_COMPLETION_KIND,
  WALK_MODE,
  WALK_TYPE,
  Walk,
} from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

const DATE = DayDate.create('2026-08-09');
const NOW = new Date(2026, 7, 9, 9, 0, 0, 0);

describe('statistics composition', () => {
  it('reads persisted entities, sessions and chronology without rewriting them across reopen', async () => {
    const indexedDbFactory = new IDBFactory();
    const first = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock: new FakeClock(NOW),
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('statistics-first'),
    });
    const decision = Decision.createDraft({
      id: EntityId.create('statistics-decision'),
      title: DecisionTitle.create('Решение для статистики'),
      kind: DECISION_KIND.additional,
      occurredAt: NOW,
      eventId: EntityId.create('statistics-decision-created'),
    });
    const action = LifeAction.createDraft({
      id: EntityId.create('statistics-action'),
      title: LifeActionTitle.create('Действие для статистики'),
      createdAt: NOW,
      eventId: EntityId.create('statistics-action-created'),
    });
    const session = ActionSession.start({
      id: EntityId.create('statistics-session'),
      lifeActionId: action.id,
      startedAt: NOW,
      eventId: EntityId.create('statistics-session-started'),
    });
    const completedAt = new Date(NOW.getTime() + 25 * 60_000);
    session.complete({
      completedAt,
      completionKind: SESSION_COMPLETION_KIND.completed,
      eventId: EntityId.create('statistics-session-completed'),
    });
    const walk = Walk.create({
      id: EntityId.create('statistics-walk'),
      date: DATE,
      type: WALK_TYPE.mindful,
      now: NOW,
    })
      .start({
        mode: WALK_MODE.stopwatch,
        startedAt: NOW,
        reflectionQuestion: 'Что важно заметить?',
      })
      .complete({ endedAt: new Date(NOW.getTime() + 15 * 60_000) });
    const sessionEntry = JournalEntry.create({
      id: EntityId.create('statistics-session-journal-completed'),
      type: JOURNAL_ENTRY_TYPE.workSessionCompleted,
      occurredAt: completedAt,
      effectiveDate: DATE,
      subjectType: JOURNAL_SUBJECT_TYPE.workSession,
      subjectId: session.id,
      metadata: {
        lifeActionId: action.id.toString(),
        workedDurationMilliseconds: 25 * 60_000,
      },
      createdAt: completedAt,
    });
    await Promise.all([
      first.decisionRepository.save(decision),
      first.lifeActionRepository.save(action),
      first.actionSessionRepository.save(session),
      first.walkRepository.save(walk),
      first.journalRepository.append(sessionEntry),
    ]);
    const versionsBefore = {
      decision: decision.version,
      action: action.version,
      session: session.version,
      walk: walk.version,
    };

    const firstSnapshot = await first.getStatistics.execute({
      kind: STATISTICS_PERIOD_KIND.day,
      date: DATE,
    });

    expect(firstSnapshot.metrics).toMatchObject({
      decisionCount: 1,
      lifeActionCount: 1,
      workSessionCount: 1,
      workSessionDurationMilliseconds: 25 * 60_000,
      walks: { completedCount: 1, totalDurationMilliseconds: 15 * 60_000 },
    });
    expect({
      decision: (await first.decisionRepository.findById(decision.id))?.version,
      action: (await first.lifeActionRepository.findById(action.id))?.version,
      session: (await first.actionSessionRepository.findById(session.id))?.version,
      walk: (await first.walkRepository.findById(walk.id))?.version,
    }).toEqual(versionsBefore);
    first.close();

    const reopened = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock: new FakeClock(NOW),
      currentDateProvider: new FakeCurrentDateProvider(DATE),
      idGenerator: new FakeIdGenerator('statistics-reopened'),
    });
    const reopenedSnapshot = await reopened.getStatistics.execute({
      kind: STATISTICS_PERIOD_KIND.day,
      date: DATE,
    });

    expect(reopenedSnapshot).toEqual(firstSnapshot);
    expect(await reopened.journalRepository.findById(sessionEntry.id)).not.toBeNull();
    reopened.close();
  });
});
