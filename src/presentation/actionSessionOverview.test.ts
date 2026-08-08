import { describe, expect, it } from 'vitest';
import { ActionSession, EntityId, SESSION_COMPLETION_KIND, SessionResultNote } from '../domain';
import { buildActionSessionOverview } from './actionSessionOverview';

const ACTION_ID = EntityId.create('overview-action');
const NOW = at('12:00');

describe('buildActionSessionOverview', () => {
  it('считает общее время и среднюю длительность только по завершённым сессиям', () => {
    const first = completedSession('first', '08:00', '08:30', 'Первый результат');
    const second = completedSession('second', '09:00', '10:00', 'Второй результат');
    const running = runningSession('running', '11:30');

    const overview = buildActionSessionOverview([first, second, running], NOW);

    expect(overview.totalSessionCount).toBe(3);
    expect(overview.completedSessionCount).toBe(2);
    expect(overview.totalWorkedDurationMs).toBe(2 * 60 * 60_000);
    expect(overview.averageCompletedWorkedDurationMs).toBe(45 * 60_000);
  });

  it('показывает последней самую поздно начатую сессию и сортирует список от новой к старой', () => {
    const first = completedSession('first', '08:00', '08:30');
    const latest = runningSession('latest', '10:00');
    const middle = completedSession('middle', '09:00', '09:15');

    const overview = buildActionSessionOverview([first, latest, middle], at('10:30'));

    expect(overview.latestSession?.id.toString()).toBe('latest');
    expect(overview.items.map((item) => item.session.id.toString())).toEqual([
      'latest',
      'middle',
      'first',
    ]);
    expect(overview.items[0]?.isLatest).toBe(true);
    expect(overview.items[1]?.isLatest).toBe(false);
  });

  it('учитывает завершённые интервалы и открытую паузу в длительности приостановленной сессии', () => {
    const session = runningSession('paused', '09:00');
    session.pause(at('09:20'), EntityId.create('pause-event'));

    const overview = buildActionSessionOverview([session], at('10:00'));

    expect(overview.totalWorkedDurationMs).toBe(20 * 60_000);
    expect(overview.items[0]?.pausedDurationMs).toBe(40 * 60_000);
    expect(overview.averageCompletedWorkedDurationMs).toBe(0);
  });

  it('возвращает пустую сводку, если сессий ещё нет', () => {
    const overview = buildActionSessionOverview([], NOW);

    expect(overview.totalSessionCount).toBe(0);
    expect(overview.completedSessionCount).toBe(0);
    expect(overview.totalWorkedDurationMs).toBe(0);
    expect(overview.averageCompletedWorkedDurationMs).toBe(0);
    expect(overview.latestSession).toBeNull();
    expect(overview.items).toEqual([]);
  });
});

function runningSession(id: string, startedAt: string): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId: ACTION_ID,
    startedAt: at(startedAt),
    eventId: EntityId.create(`${id}-start-event`),
  });
}

function completedSession(
  id: string,
  startedAt: string,
  completedAt: string,
  resultNote?: string,
): ActionSession {
  const session = runningSession(id, startedAt);
  session.complete({
    completedAt: at(completedAt),
    completionKind: SESSION_COMPLETION_KIND.completed,
    ...(resultNote === undefined ? {} : { resultNote: SessionResultNote.create(resultNote) }),
    eventId: EntityId.create(`${id}-complete-event`),
  });
  return session;
}

function at(time: string): Date {
  return new Date(`2026-08-07T${time}:00.000+09:00`);
}
