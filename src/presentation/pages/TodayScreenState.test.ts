import { describe, expect, it } from 'vitest';
import {
  ActionSession,
  Day,
  DayDate,
  EntityId,
  type Decision,
  type LifeAction,
} from '../../domain';
import {
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { TODAY_SCREEN_STATE, resolveTodayScreenState } from './TodayScreenState';

const DATE = DayDate.create('2026-08-05');

function plannedDay(): Day {
  return Day.createCurrentPlanned({
    id: EntityId.create('today-screen-planned-day'),
    currentDate: DATE,
    occurredAt: new Date('2026-08-05T00:01:00.000+09:00'),
    createdEventId: EntityId.create('today-screen-planned-created'),
  });
}

function openDay(): Day {
  return Day.openCurrent({
    id: EntityId.create('today-screen-open-day'),
    currentDate: DATE,
    occurredAt: new Date('2026-08-05T08:00:00.000+09:00'),
    createdEventId: EntityId.create('today-screen-open-created'),
    openedEventId: EntityId.create('today-screen-opened'),
  });
}

function completedDay(): Day {
  const day = openDay();
  day.complete(
    new Date('2026-08-05T21:00:00.000+09:00'),
    EntityId.create('today-screen-completed-event'),
    'Итог дня',
  );
  return day;
}

function input(
  day: Day,
  options: {
    decisions?: readonly Decision[];
    lifeActions?: readonly LifeAction[];
    unfinishedSession?: ActionSession | null;
    decisionsStatus?: 'loading' | 'ready' | 'error';
    recoveryStatus?: 'loading' | 'ready' | 'error';
    isEveningControlOpen?: boolean;
    preferredLifeActionId?: string | null;
  } = {},
) {
  return {
    day,
    decisionsStatus: options.decisionsStatus ?? 'ready',
    decisions: options.decisions ?? [],
    recoveryStatus: options.recoveryStatus ?? 'ready',
    lifeActions: options.lifeActions ?? [],
    unfinishedSession: options.unfinishedSession ?? null,
    isEveningControlOpen: options.isEveningControlOpen ?? false,
    preferredLifeActionId: options.preferredLifeActionId ?? null,
  } as const;
}

describe('resolveTodayScreenState', () => {
  it('различает незапланированный и запланированный день по главным решениям', () => {
    const unplanned = resolveTodayScreenState(input(plannedDay()));
    const mainDecision = createPlannedDecision('screen-main', DATE, 'main', 1);
    const planned = resolveTodayScreenState(input(plannedDay(), { decisions: [mainDecision] }));

    expect(unplanned.kind).toBe(TODAY_SCREEN_STATE.dayNotPlanned);
    expect(planned.kind).toBe(TODAY_SCREEN_STATE.dayPlanned);
    expect(planned.kind === TODAY_SCREEN_STATE.dayPlanned && planned.mainDecisionCount).toBe(1);
  });

  it('показывает начатый день с текущим действием', () => {
    const action = createReadyLifeAction('screen-current-action', DATE);
    const state = resolveTodayScreenState(input(openDay(), { lifeActions: [action] }));

    expect(state.kind).toBe(TODAY_SCREEN_STATE.dayStarted);
    expect(state.kind === TODAY_SCREEN_STATE.dayStarted && state.currentLifeAction).toBe(action);
  });

  it('отдаёт приоритет выполняемому действию при выборе текущего', () => {
    const ready = createReadyLifeAction('screen-ready-action', DATE);
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('screen-progress-action', DATE),
    );
    const state = resolveTodayScreenState(input(openDay(), { lifeActions: [ready, inProgress] }));

    expect(state.kind === TODAY_SCREEN_STATE.dayStarted && state.currentLifeAction).toBe(
      inProgress,
    );
  });

  it('различает активную и приостановленную рабочую сессию', () => {
    const action = markLifeActionInProgress(createReadyLifeAction('screen-session-action', DATE));
    const runningSession = ActionSession.start({
      id: EntityId.create('screen-running-session'),
      lifeActionId: action.id,
      startedAt: new Date('2026-08-05T09:00:00.000+09:00'),
      eventId: EntityId.create('screen-running-session-event'),
    });
    const active = resolveTodayScreenState(
      input(openDay(), { lifeActions: [action], unfinishedSession: runningSession }),
    );

    runningSession.pause(
      new Date('2026-08-05T09:30:00.000+09:00'),
      EntityId.create('screen-paused-session-event'),
    );
    const paused = resolveTodayScreenState(
      input(openDay(), { lifeActions: [action], unfinishedSession: runningSession }),
    );

    expect(active.kind).toBe(TODAY_SCREEN_STATE.activeSession);
    expect(paused.kind).toBe(TODAY_SCREEN_STATE.pausedSession);
  });

  it('показывает отсутствие текущего действия отдельно от начатого дня', () => {
    const state = resolveTodayScreenState(input(openDay()));

    expect(state.kind).toBe(TODAY_SCREEN_STATE.noCurrentAction);
  });

  it('не выбирает перенесённое действие как текущее для старой даты', () => {
    const action = createReadyLifeAction('screen-moved-action', DATE);
    action.reschedule(
      DayDate.create('2026-08-06'),
      new Date('2026-08-05T11:00:00.000+09:00'),
      EntityId.create('screen-moved-action-event'),
    );
    const state = resolveTodayScreenState(input(openDay(), { lifeActions: [action] }));

    expect(state.kind).toBe(TODAY_SCREEN_STATE.noCurrentAction);
  });

  it('показывает вечерний контроль отдельным состоянием', () => {
    const state = resolveTodayScreenState(input(openDay(), { isEveningControlOpen: true }));

    expect(state.kind).toBe(TODAY_SCREEN_STATE.eveningControl);
  });

  it('показывает завершённый день независимо от фоновой загрузки', () => {
    const state = resolveTodayScreenState(
      input(completedDay(), { decisionsStatus: 'error', recoveryStatus: 'error' }),
    );

    expect(state.kind).toBe(TODAY_SCREEN_STATE.dayCompleted);
  });

  it('показывает ошибку восстановления при сбое чтения или потерянной связи с действием', () => {
    const readFailure = resolveTodayScreenState(input(openDay(), { recoveryStatus: 'error' }));
    const missingActionSession = ActionSession.start({
      id: EntityId.create('screen-orphan-session'),
      lifeActionId: EntityId.create('screen-missing-action'),
      startedAt: new Date('2026-08-05T10:00:00.000+09:00'),
      eventId: EntityId.create('screen-orphan-session-event'),
    });
    const missingAction = resolveTodayScreenState(
      input(openDay(), { unfinishedSession: missingActionSession }),
    );

    expect(readFailure.kind).toBe(TODAY_SCREEN_STATE.recoveryError);
    expect(missingAction.kind).toBe(TODAY_SCREEN_STATE.recoveryError);
  });

  it('оставляет переходное состояние загрузки вне предметных состояний дня', () => {
    const state = resolveTodayScreenState(input(plannedDay(), { decisionsStatus: 'loading' }));

    expect(state.kind).toBe(TODAY_SCREEN_STATE.loading);
  });

  it('считает выполняемое главное решение частью плана дня', () => {
    const mainDecision = markDecisionInProgress(
      createPlannedDecision('screen-main-progress', DATE, 'main', 1),
    );
    const state = resolveTodayScreenState(input(plannedDay(), { decisions: [mainDecision] }));

    expect(state.kind).toBe(TODAY_SCREEN_STATE.dayPlanned);
  });

  it('выбирает следующее доступное действие отдельно от текущего', () => {
    const current = markLifeActionInProgress(
      createReadyLifeAction('screen-current-in-progress', DATE, {
        createdAt: new Date('2026-08-05T08:00:00.000+09:00'),
      }),
    );
    const next = createReadyLifeAction('screen-next-ready', DATE, {
      createdAt: new Date('2026-08-05T08:05:00.000+09:00'),
    });
    const later = createReadyLifeAction('screen-later-ready', DATE, {
      createdAt: new Date('2026-08-05T08:10:00.000+09:00'),
    });

    const state = resolveTodayScreenState(
      input(openDay(), { lifeActions: [later, next, current] }),
    );

    expect(state.kind).toBe(TODAY_SCREEN_STATE.dayStarted);
    if (state.kind !== TODAY_SCREEN_STATE.dayStarted) return;
    expect(state.currentLifeAction).toBe(current);
    expect(state.nextLifeAction).toBe(next);
  });

  it('выбирает сохранённую позицию и определяет следующее действие относительно неё', () => {
    const first = createReadyLifeAction('screen-navigation-first', DATE, {
      createdAt: new Date('2026-08-05T08:00:00.000+09:00'),
    });
    const second = createReadyLifeAction('screen-navigation-second', DATE, {
      createdAt: new Date('2026-08-05T08:05:00.000+09:00'),
    });
    const third = createReadyLifeAction('screen-navigation-third', DATE, {
      createdAt: new Date('2026-08-05T08:10:00.000+09:00'),
    });

    const state = resolveTodayScreenState(
      input(openDay(), {
        lifeActions: [third, first, second],
        preferredLifeActionId: second.id.toString(),
      }),
    );

    expect(state.kind).toBe(TODAY_SCREEN_STATE.dayStarted);
    if (state.kind !== TODAY_SCREEN_STATE.dayStarted) return;
    expect(state.currentLifeAction).toBe(second);
    expect(state.currentLifeActionIndex).toBe(1);
    expect(state.availableLifeActions).toEqual([first, second, third]);
    expect(state.nextLifeAction).toBe(third);
  });

  it('безопасно возвращается к первому доступному действию при устаревшем выборе', () => {
    const first = createReadyLifeAction('screen-navigation-fallback-first', DATE);
    const second = createReadyLifeAction('screen-navigation-fallback-second', DATE, {
      createdAt: new Date('2026-08-05T08:05:00.000+09:00'),
    });

    const state = resolveTodayScreenState(
      input(openDay(), {
        lifeActions: [second, first],
        preferredLifeActionId: 'removed-action',
      }),
    );

    expect(state.kind).toBe(TODAY_SCREEN_STATE.dayStarted);
    if (state.kind !== TODAY_SCREEN_STATE.dayStarted) return;
    expect(state.currentLifeAction).toBe(first);
    expect(state.currentLifeActionIndex).toBe(0);
  });

  it('после завершения текущего действия автоматически продвигает следующее', () => {
    const current = markLifeActionInProgress(
      createReadyLifeAction('screen-promoted-current', DATE, {
        createdAt: new Date('2026-08-05T08:00:00.000+09:00'),
      }),
    );
    const next = createReadyLifeAction('screen-promoted-next', DATE, {
      createdAt: new Date('2026-08-05T08:05:00.000+09:00'),
    });
    const later = createReadyLifeAction('screen-promoted-later', DATE, {
      createdAt: new Date('2026-08-05T08:10:00.000+09:00'),
    });

    completeLifeAction(current);
    const state = resolveTodayScreenState(
      input(openDay(), { lifeActions: [current, later, next] }),
    );

    expect(state.kind).toBe(TODAY_SCREEN_STATE.dayStarted);
    if (state.kind !== TODAY_SCREEN_STATE.dayStarted) return;
    expect(state.currentLifeAction).toBe(next);
    expect(state.nextLifeAction).toBe(later);
  });

  it('сохраняет отдельное следующее действие во время активной сессии', () => {
    const current = markLifeActionInProgress(createReadyLifeAction('screen-session-current', DATE));
    const next = createReadyLifeAction('screen-session-next', DATE, {
      createdAt: new Date('2026-08-05T08:05:00.000+09:00'),
    });
    const session = ActionSession.start({
      id: EntityId.create('screen-session-current-session'),
      lifeActionId: current.id,
      startedAt: new Date('2026-08-05T10:00:00.000+09:00'),
      eventId: EntityId.create('screen-session-current-session-event'),
    });

    const state = resolveTodayScreenState(
      input(openDay(), {
        lifeActions: [next, current],
        unfinishedSession: session,
        preferredLifeActionId: next.id.toString(),
      }),
    );

    expect(state.kind).toBe(TODAY_SCREEN_STATE.activeSession);
    if (state.kind !== TODAY_SCREEN_STATE.activeSession) return;
    expect(state.currentLifeAction).toBe(current);
    expect(state.nextLifeAction).toBe(next);
  });
});
