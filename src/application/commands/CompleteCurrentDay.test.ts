import { describe, expect, it } from 'vitest';
import type {
  CommitDayCompletionInput,
  DayCompletionUnitOfWork,
} from '../ports/DayCompletionUnitOfWork';
import {
  ActionSession,
  DAY_STATUS,
  DECISION_KIND,
  Day,
  DayDate,
  EntityId,
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
  RoutineOccurrenceExecution,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import type { EveningReviewSnapshot } from '../queries/GetEveningReview';
import { CompleteCurrentDay } from './CompleteCurrentDay';

const TODAY = DayDate.create('2026-08-05');
const TOMORROW = DayDate.create('2026-08-06');
const NOW = new Date('2026-08-05T20:30:00.000+09:00');

class FakeDayCompletionUnitOfWork implements DayCompletionUnitOfWork {
  public commits: CommitDayCompletionInput[] = [];
  public error: DomainError | null = null;

  public async commit(input: CommitDayCompletionInput): Promise<void> {
    if (this.error !== null) {
      throw this.error;
    }
    this.commits.push(input);
  }
}

describe('CompleteCurrentDay', () => {
  it('атомарно завершает, переносит и отменяет остатки, сохраняет итог и решения на завтра', async () => {
    const completing = markLifeActionInProgress(createReadyLifeAction('complete', TODAY));
    const rescheduling = createReadyLifeAction('move', TODAY);
    const cancelling = createReadyLifeAction('cancel', TODAY);
    const alreadyCompleted = completeLifeAction(
      markLifeActionInProgress(createReadyLifeAction('history', TODAY)),
    );
    const completedSession = createCompletedSession(completing);
    const snapshot = createSnapshot({
      lifeActions: [completing, rescheduling, cancelling, alreadyCompleted],
      actionSessions: [completedSession],
    });
    const unitOfWork = new FakeDayCompletionUnitOfWork();
    const command = createCommand(snapshot, unitOfWork);

    const result = await command.execute({
      summary: '  День дал проверенный результат  ',
      actionResolutions: [
        {
          kind: 'complete',
          lifeActionId: completing.id,
          actualResult: 'Готов рабочий вечерний цикл',
        },
        {
          kind: 'reschedule',
          lifeActionId: rescheduling.id,
          newPlannedDate: TOMORROW.toString(),
        },
        {
          kind: 'cancel',
          lifeActionId: cancelling.id,
          reason: 'Потеряло актуальность',
        },
      ],
      tomorrowDecisions: [
        {
          kind: DECISION_KIND.main,
          title: 'Проверить сохранение после F5',
          expectedResult: 'Данные восстановлены без расхождений',
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(unitOfWork.commits).toHaveLength(1);
    const commit = unitOfWork.commits[0]!;
    expect(commit.expectedDayVersion).toBe(snapshot.day.version);
    expect(commit.day.status).toBe(DAY_STATUS.completed);
    expect(commit.day.summary).toBe('День дал проверенный результат');
    expect(commit.lifeActions).toHaveLength(3);
    expect(commit.lifeActions.map((change) => change.lifeAction.status)).toEqual([
      LIFE_ACTION_STATUS.completed,
      LIFE_ACTION_STATUS.ready,
      LIFE_ACTION_STATUS.cancelled,
    ]);
    expect(commit.lifeActions[1]!.lifeAction.plannedDate?.equals(TOMORROW)).toBe(true);
    expect(commit.newTomorrowDecisions).toHaveLength(1);
    expect(commit.newTomorrowDecisions[0]!.plannedDate?.equals(TOMORROW)).toBe(true);
    expect(commit.newTomorrowDecisions[0]!.order).toBe(1);
    expect(result.value.resolvedLifeActions).toHaveLength(3);
    expect(alreadyCompleted.status).toBe(LIFE_ACTION_STATUS.completed);
    expect(completedSession.status).toBe('completed');
  });

  it.each(['running', 'paused'] as const)('запрещает завершение при %s-сессии', async (status) => {
    const action = markLifeActionInProgress(createReadyLifeAction('active', TODAY));
    const session = ActionSession.start({
      id: id(`session-${status}`),
      lifeActionId: action.id,
      startedAt: new Date('2026-08-05T19:00:00.000+09:00'),
      eventId: id(`session-${status}-started`),
    });
    if (status === 'paused') {
      session.pause(new Date('2026-08-05T19:30:00.000+09:00'), id('paused-event'));
    }
    const snapshot = createSnapshot({ lifeActions: [action], unfinishedSession: session });
    const unitOfWork = new FakeDayCompletionUnitOfWork();

    const result = await createCommand(snapshot, unitOfWork).execute({
      summary: 'Итог',
      actionResolutions: [{ kind: 'cancel', lifeActionId: action.id, reason: 'Отмена' }],
      tomorrowDecisions: [mainTomorrowDraft()],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('day.unfinished_session');
    expect(unitOfWork.commits).toHaveLength(0);
  });

  it('blocks day completion while a routine occurrence is running', async () => {
    const runningExecution = RoutineOccurrenceExecution.start({
      id: id('running-routine'),
      routineBlockId: id('routine-block'),
      occurrenceDate: TODAY,
      occurredAt: new Date('2026-08-05T19:00:00.000+09:00'),
    });
    const snapshot = createSnapshot({
      routineSummary: {
        plannedCount: 2,
        startedCount: 1,
        completedCount: 0,
        runningExecution,
      },
    });
    const unitOfWork = new FakeDayCompletionUnitOfWork();
    const result = await createCommand(snapshot, unitOfWork).execute({
      summary: 'Итог',
      actionResolutions: [],
      tomorrowDecisions: [mainTomorrowDraft()],
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'day.running_routine_execution' },
    });
    expect(unitOfWork.commits).toHaveLength(0);
  });

  it('does not block day completion for planned occurrences without execution', async () => {
    const snapshot = createSnapshot({
      routineSummary: {
        plannedCount: 3,
        startedCount: 0,
        completedCount: 0,
        runningExecution: null,
      },
    });
    const result = await createCommand(snapshot).execute({
      summary: 'Итог',
      actionResolutions: [],
      tomorrowDecisions: [mainTomorrowDraft()],
    });
    expect(result.ok).toBe(true);
  });

  it('запрещает повторное завершение дня', async () => {
    const day = createOpenDay();
    day.complete(NOW, id('day-completed'), 'Итог');
    const snapshot = createSnapshot({ day });
    const unitOfWork = new FakeDayCompletionUnitOfWork();

    const result = await createCommand(snapshot, unitOfWork).execute({
      summary: 'Ещё один итог',
      actionResolutions: [],
      tomorrowDecisions: [mainTomorrowDraft()],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('day.already_completed');
    expect(unitOfWork.commits).toHaveLength(0);
  });

  it('требует отдельное решение для каждого незавершённого действия', async () => {
    const first = createReadyLifeAction('first', TODAY);
    const second = createReadyLifeAction('second', TODAY);
    const snapshot = createSnapshot({ lifeActions: [first, second] });

    const result = await createCommand(snapshot).execute({
      summary: 'Итог',
      actionResolutions: [{ kind: 'cancel', lifeActionId: first.id, reason: 'Отмена' }],
      tomorrowDecisions: [mainTomorrowDraft()],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('day.action_resolution_required');
  });

  it('не принимает два решения по одному действию или постороннее действие', async () => {
    const action = createReadyLifeAction('one', TODAY);
    const command = createCommand(createSnapshot({ lifeActions: [action] }));
    const duplicate = await command.execute({
      summary: 'Итог',
      actionResolutions: [
        { kind: 'cancel', lifeActionId: action.id, reason: 'Первое' },
        { kind: 'reschedule', lifeActionId: action.id, newPlannedDate: TOMORROW.toString() },
      ],
      tomorrowDecisions: [mainTomorrowDraft()],
    });
    const unknown = await command.execute({
      summary: 'Итог',
      actionResolutions: [{ kind: 'cancel', lifeActionId: id('other'), reason: 'Постороннее' }],
      tomorrowDecisions: [mainTomorrowDraft()],
    });

    expect(duplicate.ok ? null : duplicate.error.code).toBe('day.duplicate_action_resolution');
    expect(unknown.ok ? null : unknown.error.code).toBe('day.unknown_action_resolution');
  });

  it('не завершает готовое действие без начатого выполнения и подтверждённой сессии', async () => {
    const ready = createReadyLifeAction('ready', TODAY);
    const result = await createCommand(createSnapshot({ lifeActions: [ready] })).execute({
      summary: 'Итог',
      actionResolutions: [{ kind: 'complete', lifeActionId: ready.id, actualResult: 'Сделано' }],
      tomorrowDecisions: [mainTomorrowDraft()],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('day.action_completion_requires_in_progress');
  });

  it('не завершает выполняемое действие без завершённой рабочей сессии', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('without-session', TODAY));
    const result = await createCommand(createSnapshot({ lifeActions: [action] })).execute({
      summary: 'Итог',
      actionResolutions: [{ kind: 'complete', lifeActionId: action.id, actualResult: 'Сделано' }],
      tomorrowDecisions: [mainTomorrowDraft()],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('day.action_completion_requires_session');
  });

  it('требует итог дня и главное решение на завтра', async () => {
    const noSummary = await createCommand(createSnapshot()).execute({
      summary: ' ',
      actionResolutions: [],
      tomorrowDecisions: [mainTomorrowDraft()],
    });
    const noTomorrow = await createCommand(createSnapshot()).execute({
      summary: 'Итог',
      actionResolutions: [],
      tomorrowDecisions: [],
    });

    expect(noSummary.ok ? null : noSummary.error.code).toBe('day.summary_required');
    expect(noTomorrow.ok ? null : noTomorrow.error.code).toBe(
      'day.tomorrow_main_decision_required',
    );
  });

  it('не требует новое решение, если главное решение на завтра уже существует', async () => {
    const existing = createPlannedDecision('existing', TOMORROW, DECISION_KIND.main, 2);
    const unitOfWork = new FakeDayCompletionUnitOfWork();
    const result = await createCommand(
      createSnapshot({ tomorrowDecisions: [existing] }),
      unitOfWork,
    ).execute({ summary: 'Итог', actionResolutions: [], tomorrowDecisions: [] });

    expect(result.ok).toBe(true);
    expect(unitOfWork.commits[0]?.newTomorrowDecisions).toHaveLength(0);
  });

  it('сохраняет исходные сущности неизменными при отказе атомарной записи', async () => {
    const day = createOpenDay();
    const action = createReadyLifeAction('rollback', TODAY);
    const unitOfWork = new FakeDayCompletionUnitOfWork();
    unitOfWork.error = new DomainError('persistence.transaction_failed', 'Сбой');

    const result = await createCommand(
      createSnapshot({ day, lifeActions: [action] }),
      unitOfWork,
    ).execute({
      summary: 'Итог',
      actionResolutions: [
        { kind: 'reschedule', lifeActionId: action.id, newPlannedDate: TOMORROW.toString() },
      ],
      tomorrowDecisions: [mainTomorrowDraft()],
    });

    expect(result.ok).toBe(false);
    expect(day.status).toBe(DAY_STATUS.open);
    expect(day.summary).toBeNull();
    expect(action.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(action.plannedDate?.equals(TODAY)).toBe(true);
  });

  it('разрешает перенос только на будущую дату', async () => {
    const action = createReadyLifeAction('move-invalid', TODAY);
    const result = await createCommand(createSnapshot({ lifeActions: [action] })).execute({
      summary: 'Итог',
      actionResolutions: [
        { kind: 'reschedule', lifeActionId: action.id, newPlannedDate: TODAY.toString() },
      ],
      tomorrowDecisions: [mainTomorrowDraft()],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('day.action_reschedule_requires_future_date');
  });
});

function createCommand(
  snapshot: EveningReviewSnapshot,
  unitOfWork: FakeDayCompletionUnitOfWork = new FakeDayCompletionUnitOfWork(),
): CompleteCurrentDay {
  return new CompleteCurrentDay(
    { execute: async () => snapshot },
    unitOfWork,
    new FakeClock(NOW),
    new FakeIdGenerator('evening'),
  );
}

function createSnapshot(overrides: Partial<EveningReviewSnapshot> = {}): EveningReviewSnapshot {
  return {
    day: overrides.day ?? createOpenDay(),
    currentDate: TODAY,
    tomorrowDate: TOMORROW,
    isRecoveryReview: overrides.isRecoveryReview ?? false,
    decisions: overrides.decisions ?? [createPlannedDecision('today-main', TODAY)],
    lifeActions: overrides.lifeActions ?? [],
    actionSessions: overrides.actionSessions ?? [],
    unfinishedSession: overrides.unfinishedSession ?? null,
    tomorrowDecisions: overrides.tomorrowDecisions ?? [],
    routineSummary: overrides.routineSummary ?? {
      plannedCount: 0,
      startedCount: 0,
      completedCount: 0,
      runningExecution: null,
    },
  };
}

function createOpenDay(): Day {
  return Day.openCurrent({
    id: id('day'),
    currentDate: TODAY,
    occurredAt: new Date('2026-08-05T08:00:00.000+09:00'),
    createdEventId: id('day-created'),
    openedEventId: id('day-opened'),
  });
}

function createCompletedSession(lifeAction: LifeAction): ActionSession {
  const session = ActionSession.start({
    id: id(`session-${lifeAction.id.toString()}`),
    lifeActionId: lifeAction.id,
    startedAt: new Date('2026-08-05T18:00:00.000+09:00'),
    eventId: id(`session-${lifeAction.id.toString()}-started`),
  });
  session.complete({
    completedAt: new Date('2026-08-05T19:00:00.000+09:00'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: id(`session-${lifeAction.id.toString()}-completed`),
  });
  return session;
}

function mainTomorrowDraft() {
  return {
    kind: DECISION_KIND.main,
    title: 'Главное решение на завтра',
    expectedResult: 'Понятный результат на завтра',
  } as const;
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
