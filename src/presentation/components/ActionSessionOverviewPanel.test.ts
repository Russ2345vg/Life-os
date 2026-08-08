import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionSession, EntityId, SESSION_COMPLETION_KIND, SessionResultNote } from '../../domain';
import { ActionSessionOverviewPanel } from './ActionSessionOverviewPanel';

const ACTION_ID = EntityId.create('panel-action');

describe('ActionSessionOverviewPanel', () => {
  it('показывает сводку, последнюю сессию и результат каждой завершённой сессии', () => {
    const first = createCompletedSession('first', '08:00', '08:30', 'Собран прототип');
    const second = createCompletedSession('second', '09:00', '10:00', 'Проверены тесты');

    const markup = renderToStaticMarkup(
      createElement(ActionSessionOverviewPanel, {
        sessions: [first, second],
        now: at('11:00'),
      }),
    );

    expect(markup).toContain('История работы');
    expect(markup).toContain('Всего сессий');
    expect(markup).toContain('Общее время');
    expect(markup).toContain('01:30:00');
    expect(markup).toContain('Средняя сессия');
    expect(markup).toContain('45:00');
    expect(markup).toContain('Последняя сессия');
    expect(markup).toContain('Собран прототип');
    expect(markup).toContain('Проверены тесты');
    expect(markup).toContain('Последняя');
  });

  it('показывает активную и приостановленную сессию без выдуманного результата', () => {
    const running = createRunningSession('running', '10:00');
    const paused = createRunningSession('paused', '09:00');
    paused.pause(at('09:20'), EntityId.create('paused-event'));

    const markup = renderToStaticMarkup(
      createElement(ActionSessionOverviewPanel, {
        sessions: [paused, running],
        now: at('10:30'),
      }),
    );

    expect(markup).toContain('Выполняется');
    expect(markup).toContain('На паузе');
    expect(markup).toContain('Результат будет зафиксирован после завершения сессии.');
    expect(markup).not.toContain('undefined');
  });

  it('показывает явное пустое состояние', () => {
    const markup = renderToStaticMarkup(
      createElement(ActionSessionOverviewPanel, { sessions: [], now: at('10:00') }),
    );

    expect(markup).toContain('Завершённых сессий пока нет');
  });
});

function createRunningSession(id: string, startedAt: string): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId: ACTION_ID,
    startedAt: at(startedAt),
    eventId: EntityId.create(`${id}-start-event`),
  });
}

function createCompletedSession(
  id: string,
  startedAt: string,
  completedAt: string,
  result: string,
): ActionSession {
  const session = createRunningSession(id, startedAt);
  session.complete({
    completedAt: at(completedAt),
    completionKind: SESSION_COMPLETION_KIND.completed,
    resultNote: SessionResultNote.create(result),
    eventId: EntityId.create(`${id}-complete-event`),
  });
  return session;
}

function at(time: string): Date {
  return new Date(`2026-08-07T${time}:00.000+09:00`);
}
