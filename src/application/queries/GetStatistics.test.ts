import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  DayDate,
  Decision,
  EntityId,
  JOURNAL_CORRECTION_FIELD,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
  SESSION_COMPLETION_KIND,
  WALK_MODE,
  WALK_STATUS,
  WALK_TYPE,
  Walk,
  type LifeAction,
} from '../../domain';
import {
  TestActionSessionRepository,
  TestDecisionRepository,
  TestJournalRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';
import { confirmDecision, createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import type { StartWalkPersistenceResult, WalkRepository } from '../ports/WalkRepository';
import { GetStatistics, STATISTICS_PERIOD_KIND, resolveStatisticsPeriod } from './GetStatistics';

const DATE = DayDate.create('2026-08-09');
const SPHERE_A = EntityId.create('sphere-a');
const SPHERE_B = EntityId.create('sphere-b');

describe('GetStatistics', () => {
  it('returns zero counts and null duration metrics when source data is absent', async () => {
    const { query } = await queryFor();

    const result = await query.execute({ kind: STATISTICS_PERIOD_KIND.day, date: DATE });

    expect(result).toEqual({
      period: { kind: STATISTICS_PERIOD_KIND.day, startDate: DATE, endDate: DATE },
      metrics: {
        decisionCount: 0,
        completedDecisionCount: 0,
        lifeActionCount: 0,
        workSessionCount: 0,
        workSessionDurationMilliseconds: null,
        averageWorkSessionDurationMilliseconds: null,
        walks: {
          completedCount: 0,
          abandonedCount: 0,
          totalDurationMilliseconds: null,
          averageDurationMilliseconds: null,
          completedByType: {
            [WALK_TYPE.restorative]: 0,
            [WALK_TYPE.mindful]: 0,
            [WALK_TYPE.reflection]: 0,
            [WALK_TYPE.physical]: 0,
            [WALK_TYPE.phoneFree]: 0,
          },
        },
      },
      lifeActionTime: [],
      bySphere: [],
    });
  });

  it('resolves inclusive calendar day, Monday-based week, month and custom periods', () => {
    expect(resolveStatisticsPeriod({ kind: STATISTICS_PERIOD_KIND.day, date: DATE })).toMatchObject(
      { startDate: DATE, endDate: DATE },
    );
    expect(
      resolveStatisticsPeriod({ kind: STATISTICS_PERIOD_KIND.week, date: DATE }),
    ).toMatchObject({
      startDate: DayDate.create('2026-08-03'),
      endDate: DayDate.create('2026-08-09'),
    });
    expect(
      resolveStatisticsPeriod({
        kind: STATISTICS_PERIOD_KIND.month,
        date: DayDate.create('2024-02-14'),
      }),
    ).toMatchObject({
      startDate: DayDate.create('2024-02-01'),
      endDate: DayDate.create('2024-02-29'),
    });
    expect(
      resolveStatisticsPeriod({
        kind: STATISTICS_PERIOD_KIND.custom,
        startDate: DayDate.create('2026-07-31'),
        endDate: DayDate.create('2026-08-02'),
      }),
    ).toMatchObject({
      startDate: DayDate.create('2026-07-31'),
      endDate: DayDate.create('2026-08-02'),
    });
    expect(() =>
      resolveStatisticsPeriod({
        kind: STATISTICS_PERIOD_KIND.custom,
        startDate: DayDate.create('2026-08-02'),
        endDate: DayDate.create('2026-08-01'),
      }),
    ).toThrowError('Начальная дата статистики не может быть позже конечной.');
  });

  it('uses local inclusive boundaries, separates spheres and preserves a real zero duration', async () => {
    const firstAction = createLifeActionDraft('action-a', {
      createdAt: localDate(2026, 8, 3, 0, 0),
      sphereId: SPHERE_A,
    });
    const secondAction = createLifeActionDraft('action-b', {
      createdAt: localDate(2026, 8, 9, 23, 59),
      sphereId: SPHERE_B,
    });
    const outsideAction = createLifeActionDraft('action-outside', {
      createdAt: localDate(2026, 8, 10, 0, 0),
      sphereId: SPHERE_B,
    });
    const firstSession = completedSession(
      'session-a',
      firstAction,
      localDate(2026, 8, 3, 23, 30),
      localDate(2026, 8, 4, 0, 30),
    );
    const zeroSession = completedSession(
      'session-zero',
      secondAction,
      localDate(2026, 8, 9, 23, 59),
      localDate(2026, 8, 9, 23, 59),
    );
    const outsideSession = completedSession(
      'session-outside',
      outsideAction,
      localDate(2026, 8, 9, 23, 59),
      localDate(2026, 8, 10, 0, 0),
    );
    const { query } = await queryFor({
      decisions: [
        decisionAt('decision-a', localDate(2026, 8, 3, 0, 0), SPHERE_A, false),
        decisionAt('decision-b', localDate(2026, 8, 9, 23, 59), SPHERE_B, true),
        decisionAt('decision-outside', localDate(2026, 8, 10, 0, 0), SPHERE_B, false),
      ],
      lifeActions: [firstAction, secondAction, outsideAction],
      sessions: [firstSession, zeroSession, outsideSession],
      walks: [
        completedWalk('walk-a', DayDate.create('2026-08-03'), SPHERE_A, 30 * 60_000),
        completedWalk('walk-zero', DayDate.create('2026-08-09'), SPHERE_B, 0),
        completedWalk('walk-outside', DayDate.create('2026-08-10'), SPHERE_B, 60_000),
      ],
    });

    const result = await query.execute({ kind: STATISTICS_PERIOD_KIND.week, date: DATE });

    expect(result.metrics).toMatchObject({
      decisionCount: 2,
      completedDecisionCount: 1,
      lifeActionCount: 2,
      workSessionCount: 2,
      workSessionDurationMilliseconds: 60 * 60_000,
      averageWorkSessionDurationMilliseconds: 30 * 60_000,
      walks: {
        completedCount: 2,
        totalDurationMilliseconds: 30 * 60_000,
        averageDurationMilliseconds: 15 * 60_000,
      },
    });
    expect(result.lifeActionTime).toEqual([
      {
        lifeActionId: firstAction.id,
        sphereId: SPHERE_A,
        workSessionCount: 1,
        durationMilliseconds: 60 * 60_000,
      },
      {
        lifeActionId: secondAction.id,
        sphereId: SPHERE_B,
        workSessionCount: 1,
        durationMilliseconds: 0,
      },
    ]);
    expect(result.bySphere.map((group) => group.sphereId?.toString())).toEqual([
      SPHERE_A.toString(),
      SPHERE_B.toString(),
    ]);
    expect(result.bySphere[0]?.metrics).toMatchObject({
      decisionCount: 1,
      completedDecisionCount: 0,
      lifeActionCount: 1,
      workSessionCount: 1,
    });
    expect(result.bySphere[1]?.metrics).toMatchObject({
      decisionCount: 1,
      completedDecisionCount: 1,
      lifeActionCount: 1,
      workSessionCount: 1,
    });
    expect(result.bySphere[1]?.metrics.workSessionDurationMilliseconds).toBe(0);
  });

  it('deduplicates timeline subjects, ignores correction entries and never mutates sources', async () => {
    const action = createLifeActionDraft('corrected-action', {
      createdAt: localDate(2026, 8, 9, 12, 0),
      sphereId: SPHERE_A,
    });
    const session = completedSession(
      'corrected-session',
      action,
      localDate(2026, 8, 9, 12, 0),
      localDate(2026, 8, 9, 12, 30),
    );
    const decision = decisionAt(
      'corrected-decision',
      localDate(2026, 8, 1, 12, 0),
      SPHERE_A,
      false,
    );
    const sourceEntry = journalEntry(
      'decision-created-event',
      JOURNAL_ENTRY_TYPE.decisionCreated,
      JOURNAL_SUBJECT_TYPE.decision,
      decision.id,
    );
    const correction = JournalEntry.create({
      id: EntityId.create('correction-command'),
      type: JOURNAL_ENTRY_TYPE.dataCorrected,
      occurredAt: localDate(2026, 8, 9, 10, 0),
      effectiveDate: DATE,
      subjectType: JOURNAL_SUBJECT_TYPE.decision,
      subjectId: decision.id,
      correction: {
        sourceEntryId: sourceEntry.id,
        previousCorrectionId: null,
        field: JOURNAL_CORRECTION_FIELD.decisionCancelReason,
        previousValue: 'Старое значение',
        newValue: 'Исправленное значение',
        reason: 'Исправление фактических данных',
        commandId: EntityId.create('correction-command'),
      },
      createdAt: localDate(2026, 8, 9, 10, 0),
    });
    const { query, repositories } = await queryFor({
      decisions: [decision, decision],
      lifeActions: [action, action],
      sessions: [session, session],
      journalEntries: [
        sourceEntry,
        journalEntry(
          'duplicate-decision-event',
          JOURNAL_ENTRY_TYPE.decisionCreated,
          JOURNAL_SUBJECT_TYPE.decision,
          decision.id,
        ),
        journalEntry(
          'session-completed-event',
          JOURNAL_ENTRY_TYPE.workSessionCompleted,
          JOURNAL_SUBJECT_TYPE.workSession,
          session.id,
        ),
        journalEntry(
          'duplicate-session-event',
          JOURNAL_ENTRY_TYPE.workSessionCompleted,
          JOURNAL_SUBJECT_TYPE.workSession,
          session.id,
        ),
        correction,
      ],
    });
    const before = {
      decisionVersion: decision.version,
      actionVersion: action.version,
      sessionVersion: session.version,
      sessionCompletedAt: session.completedAt?.getTime(),
    };
    const saveSpies = [
      vi.spyOn(repositories.decisions, 'save'),
      vi.spyOn(repositories.lifeActions, 'save'),
      vi.spyOn(repositories.sessions, 'save'),
      vi.spyOn(repositories.walks, 'save'),
      vi.spyOn(repositories.journal, 'append'),
      vi.spyOn(repositories.journal, 'appendMany'),
    ];

    const result = await query.execute({ kind: STATISTICS_PERIOD_KIND.day, date: DATE });

    expect(result.metrics).toMatchObject({
      decisionCount: 1,
      lifeActionCount: 1,
      workSessionCount: 1,
      workSessionDurationMilliseconds: 30 * 60_000,
    });
    expect(saveSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect({
      decisionVersion: decision.version,
      actionVersion: action.version,
      sessionVersion: session.version,
      sessionCompletedAt: session.completedAt?.getTime(),
    }).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.metrics)).toBe(true);
    expect(Object.isFrozen(result.lifeActionTime)).toBe(true);
  });
});

interface QueryData {
  readonly decisions?: readonly Decision[];
  readonly lifeActions?: readonly LifeAction[];
  readonly sessions?: readonly ActionSession[];
  readonly walks?: readonly Walk[];
  readonly journalEntries?: readonly JournalEntry[];
}

class TestWalkRepository implements WalkRepository {
  readonly #items = new Map<string, Walk>();

  public async findById(id: EntityId): Promise<Walk | null> {
    return this.#items.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly Walk[]> {
    return [...this.#items.values()];
  }

  public async findByDate(date: DayDate): Promise<readonly Walk[]> {
    return [...this.#items.values()].filter((walk) => walk.date.equals(date));
  }

  public async findRunning(): Promise<Walk | null> {
    return [...this.#items.values()].find((walk) => walk.status === WALK_STATUS.running) ?? null;
  }

  public async save(walk: Walk): Promise<void> {
    this.#items.set(walk.id.toString(), walk);
  }

  public async startIfVersionMatches(walk: Walk): Promise<StartWalkPersistenceResult> {
    await this.save(walk);
    return 'saved';
  }

  public async updateIfVersionMatches(walk: Walk): Promise<boolean> {
    await this.save(walk);
    return true;
  }

  public async deleteIfVersionMatches(id: EntityId): Promise<boolean> {
    return this.#items.delete(id.toString());
  }
}

async function queryFor(data: QueryData = {}) {
  const decisions = new TestDecisionRepository(data.decisions ?? []);
  const lifeActions = new TestLifeActionRepository(data.lifeActions ?? []);
  const sessions = new TestActionSessionRepository(data.sessions ?? []);
  const walks = new TestWalkRepository();
  const journal = new TestJournalRepository();
  await Promise.all((data.walks ?? []).map((walk) => walks.save(walk)));
  await journal.appendMany(data.journalEntries ?? []);
  return {
    query: new GetStatistics(decisions, lifeActions, sessions, walks, journal),
    repositories: { decisions, lifeActions, sessions, walks, journal },
  };
}

function decisionAt(
  id: string,
  occurredAt: Date,
  sphereId: EntityId,
  completed: boolean,
): Decision {
  const source = completed
    ? confirmDecision(createPlannedDecision(id, DATE))
    : createPlannedDecision(id, DATE);
  return Decision.rehydrate({
    id: source.id,
    title: source.title,
    reason: source.reason,
    sphereId,
    price: source.price,
    sacrifices: source.sacrifices,
    priority: source.priority,
    projectReference: source.projectReference,
    expectedResult: source.expectedResult,
    actualResultSummary: source.actualResultSummary,
    status: source.status,
    kind: source.kind,
    plannedDate: source.plannedDate,
    order: source.order,
    createdAt: occurredAt,
    plannedAt: occurredAt,
    startedAt: completed ? occurredAt : null,
    confirmedAt: completed ? occurredAt : null,
    cancelledAt: source.cancelledAt,
    cancelReason: source.cancelReason,
    archivedAt: source.archivedAt,
    deletedAt: source.deletedAt,
    lastDeletedAt: source.lastDeletedAt,
    restoredFromTrashAt: source.restoredFromTrashAt,
    evidenceIds: source.evidenceIds,
    rescheduleCount: source.rescheduleCount,
    rescheduleHistory: source.rescheduleHistory,
    version: source.version,
  });
}

function completedSession(
  id: string,
  action: LifeAction,
  startedAt: Date,
  completedAt: Date,
): ActionSession {
  const session = ActionSession.start({
    id: EntityId.create(id),
    lifeActionId: action.id,
    startedAt,
    eventId: EntityId.create(`${id}-started`),
  });
  session.complete({
    completedAt,
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: EntityId.create(`${id}-completed`),
  });
  expect(session.status).toBe(ACTION_SESSION_STATUS.completed);
  return session;
}

function completedWalk(
  id: string,
  date: DayDate,
  sphereId: EntityId,
  durationMilliseconds: number,
): Walk {
  const startedAt = localDate(2026, 8, Number(date.toString().slice(-2)), 12, 0);
  return Walk.rehydrate({
    id: EntityId.create(id),
    date,
    type: WALK_TYPE.restorative,
    sphereId,
    status: WALK_STATUS.completed,
    mode: WALK_MODE.stopwatch,
    startedAt,
    endedAt: new Date(startedAt.getTime() + durationMilliseconds),
    timerTargetMinutes: null,
    reflectionQuestion: 'Что изменилось?',
    result: null,
    photo: null,
    createdAt: startedAt,
    updatedAt: new Date(startedAt.getTime() + durationMilliseconds),
    version: 3,
  });
}

function journalEntry(
  id: string,
  type: JournalEntry['type'],
  subjectType: JournalEntry['subjectType'],
  subjectId: EntityId,
): JournalEntry {
  const occurredAt = localDate(2026, 8, 9, 9, 0);
  return JournalEntry.create({
    id: EntityId.create(id),
    type,
    occurredAt,
    effectiveDate: DATE,
    subjectType,
    subjectId,
    createdAt: occurredAt,
  });
}

function localDate(year: number, month: number, day: number, hours: number, minutes: number): Date {
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}
