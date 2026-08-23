import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionSession, DayDate, EntityId, Project, type LifeAction } from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { CurrentActionCard } from './CurrentActionCard';
import {
  CURRENT_ACTION_COMMAND,
  resolveCurrentActionCardState,
  totalWorkedDurationAt,
} from './CurrentActionCardState';

const DATE = DayDate.create('2026-08-05');
const NOW = new Date('2026-08-05T11:00:00.000+09:00');
const NOOP = () => undefined;

describe('CurrentActionCardState', () => {
  it('строит карточку готового действия со связанным решением и одной командой запуска', () => {
    const decision = createPlannedDecision('card-decision', DATE);
    const lifeAction = createReadyLifeAction('card-action', DATE, { decisionId: decision.id });

    const state = resolveCurrentActionCardState({
      lifeAction,
      decisions: [decision],
      sessions: [],
      unfinishedSession: null,
    });

    expect(state.decisionTitle).toBe('Решение card-decision');
    expect(state.statusLabel).toBe('Готово');
    expect(state.primaryCommand).toBe(CURRENT_ACTION_COMMAND.startSession);
    expect(state.primaryLabel).toBe('Начать');
    expect(state.canManageAction).toBe(true);
  });

  it('делает завершение главной командой работающей сессии', () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('running-card', DATE));
    const session = createSession('running-session', lifeAction);

    const state = resolveCurrentActionCardState({
      lifeAction,
      decisions: [],
      sessions: [session],
      unfinishedSession: session,
    });

    expect(state.primaryCommand).toBe(CURRENT_ACTION_COMMAND.completeSession);
    expect(state.primaryLabel).toBe('Завершить');
    expect(state.statusLabel).toBe('Сессия идёт');
    expect(state.canManageAction).toBe(false);
  });

  it('не обрушает экран при первом кадре сразу после запуска сессии', () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('fresh-session-card', DATE));
    const session = createSession('fresh-session', lifeAction);
    const state = resolveCurrentActionCardState({
      lifeAction,
      decisions: [],
      sessions: [session],
      unfinishedSession: session,
    });
    const staleClockTime = new Date('2026-08-05T09:59:59.999+09:00');

    const markup = renderToStaticMarkup(
      createElement(CurrentActionCard, {
        state,
        clock: { now: () => staleClockTime },
        isMutating: false,
        error: null,
        onStart: NOOP,
        onPause: NOOP,
        onResume: NOOP,
        onCompleteSession: NOOP,
        onOpen: NOOP,
        onReschedule: NOOP,
        onCancel: NOOP,
      }),
    );

    expect(markup).toContain('Сессия идёт');
    expect(markup).toContain('00:00');
    expect(markup).toContain('Завершить');
    expect(markup).toContain('Пауза');
  });

  it('делает продолжение единственной главной командой приостановленной сессии', () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('paused-card', DATE));
    const session = createSession('paused-session', lifeAction);
    session.pause(new Date('2026-08-05T10:30:00.000+09:00'), EntityId.create('pause-event'));

    const state = resolveCurrentActionCardState({
      lifeAction,
      decisions: [],
      sessions: [session],
      unfinishedSession: session,
    });

    expect(state.primaryCommand).toBe(CURRENT_ACTION_COMMAND.resumeSession);
    expect(state.primaryLabel).toBe('Продолжить');
    expect(state.statusLabel).toBe('Сессия на паузе');
    expect(state.canManageAction).toBe(false);
  });

  it('не примешивает время и сессию другого действия', () => {
    const lifeAction = createReadyLifeAction('target-card', DATE);
    const foreignAction = markLifeActionInProgress(createReadyLifeAction('foreign-card', DATE));
    const foreignSession = createSession('foreign-session', foreignAction);

    const state = resolveCurrentActionCardState({
      lifeAction,
      decisions: [],
      sessions: [foreignSession],
      unfinishedSession: foreignSession,
    });

    expect(state.sessions).toEqual([]);
    expect(state.unfinishedSession).toBeNull();
    expect(state.primaryCommand).toBe(CURRENT_ACTION_COMMAND.startSession);
  });

  it('суммирует завершённые и текущие рабочие интервалы', () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('duration-card', DATE));
    const completed = createSession('completed-session', lifeAction);
    completed.complete({
      completedAt: new Date('2026-08-05T10:20:00.000+09:00'),
      completionKind: 'completed',
      eventId: EntityId.create('completed-event'),
    });
    const running = ActionSession.start({
      id: EntityId.create('duration-running'),
      lifeActionId: lifeAction.id,
      startedAt: new Date('2026-08-05T10:30:00.000+09:00'),
      eventId: EntityId.create('duration-running-event'),
    });

    expect(totalWorkedDurationAt([completed, running], NOW)).toBe(50 * 60 * 1_000);
  });

  it('показывает все обязательные поля и ровно одну главную кнопку', () => {
    const decision = createPlannedDecision('markup-decision', DATE);
    const lifeAction = createReadyLifeAction('markup-action', DATE, { decisionId: decision.id });
    const state = resolveCurrentActionCardState({
      lifeAction,
      decisions: [decision],
      sessions: [],
      unfinishedSession: null,
    });

    const markup = renderToStaticMarkup(
      createElement(CurrentActionCard, {
        state,
        clock: { now: () => NOW },
        isMutating: false,
        error: null,
        onStart: NOOP,
        onPause: NOOP,
        onResume: NOOP,
        onCompleteSession: NOOP,
        onOpen: NOOP,
        onReschedule: NOOP,
        onCancel: NOOP,
      }),
    );

    expect(markup).toContain('Текущее действие');
    expect(markup).toContain('Связанное решение');
    expect(markup).toContain('Решение markup-decision');
    expect(markup).toContain('Ожидаемый результат');
    expect(markup).toContain('Учтённое время');
    expect(markup).toContain('Начать');
    expect(markup.match(/current-action-primary-button/g)).toHaveLength(1);
    expect(markup).toContain('>Открыть<');
    expect(markup).toContain('>Перенести<');
    expect(markup).toContain('>Отменить<');
    expect(markup).toContain('Последняя сессия');
    expect(markup).toContain('Сессий пока нет');
  });

  it('показывает Project-контекст действия и последнюю завершённую сессию', () => {
    const project = Project.create({
      id: EntityId.create('current-action-project'),
      title: 'Полноценный День',
      now: new Date('2026-08-05T08:00:00.000+09:00'),
    });
    const decision = createPlannedDecision('project-card-decision', DATE, undefined, 1, project.id);
    const lifeAction = createReadyLifeAction('project-card-action', DATE, {
      decisionId: decision.id,
    });
    const session = createSession('last-project-session', lifeAction);
    session.complete({
      completedAt: new Date('2026-08-05T10:20:00.000+09:00'),
      completionKind: 'completed',
      eventId: EntityId.create('last-project-session-completed'),
    });
    const state = resolveCurrentActionCardState({
      lifeAction,
      decisions: [decision],
      sessions: [session],
      unfinishedSession: null,
    });

    const markup = renderToStaticMarkup(
      createElement(CurrentActionCard, {
        state,
        project,
        onOpenProject: NOOP,
        clock: { now: () => NOW },
        isMutating: false,
        error: null,
        onStart: NOOP,
        onPause: NOOP,
        onResume: NOOP,
        onCompleteSession: NOOP,
        onOpen: NOOP,
        onReschedule: NOOP,
        onCancel: NOOP,
      }),
    );

    expect(markup).toContain('Полноценный День');
    expect(markup).toContain('today-project-link');
    expect(markup).toContain('Последняя сессия');
    expect(markup).toContain('20:00');
  });

  it('блокирует перенос и отмену во время сессии, сохраняя завершение доступным', () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('blocked-card', DATE));
    const session = createSession('blocked-session', lifeAction);
    const state = resolveCurrentActionCardState({
      lifeAction,
      decisions: [],
      sessions: [session],
      unfinishedSession: session,
    });

    const markup = renderToStaticMarkup(
      createElement(CurrentActionCard, {
        state,
        clock: { now: () => NOW },
        isMutating: false,
        error: null,
        onStart: NOOP,
        onPause: NOOP,
        onResume: NOOP,
        onCompleteSession: NOOP,
        onOpen: NOOP,
        onReschedule: NOOP,
        onCancel: NOOP,
      }),
    );

    expect(markup).toContain('Завершить');
    expect(markup).toContain('Пауза');
    expect(markup).toContain('Перенос и отмена доступны после завершения текущей сессии.');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });
});

function createSession(id: string, lifeAction: LifeAction): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId: lifeAction.id,
    startedAt: new Date('2026-08-05T10:00:00.000+09:00'),
    eventId: EntityId.create(`${id}-event`),
  });
}
