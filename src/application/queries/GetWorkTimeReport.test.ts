import { describe, expect, it } from 'vitest';
import { ActionSession, DayDate, EntityId, type LifeAction } from '../../domain';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { buildWorkTimeReport } from './GetWorkTimeReport';

const id = (value: string) => EntityId.create(value);
const local = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute);
const capacity = [null, null, null, null, null, null, null];
function session(name: string, action: string, start: Date, goal: string | null = null) {
  return ActionSession.start({
    id: id(name),
    lifeActionId: id(action),
    goalIdAtStart: goal ? id(goal) : null,
    startedAt: start,
    eventId: id(`start-${name}`),
  });
}
function planned(name: string, estimate: number | null, goal: string | null = null): LifeAction {
  const action = createLifeActionDraft(name);
  action.setPlan(DayDate.create('2026-09-28'), false);
  action.setTimePlanning({
    estimateMinutes: estimate,
    scheduledStartMinute: null,
    scheduledDurationMinutes: null,
  });
  if (goal) action.setGoal(id(goal));
  return action;
}

describe('buildWorkTimeReport', () => {
  it('counts completed actions by completion day separately from finished sessions', () => {
    const done = planned('done', 60);
    done.complete(null, local(29, 9), id('done-event'));
    const work = session('done-session', 'other-action', local(28, 8));
    work.complete({
      completedAt: local(28, 8, 10),
      completionKind: 'completed',
      eventId: id('work-finish'),
    });
    const report = buildWorkTimeReport({
      from: '2026-09-28',
      to: '2026-09-29',
      asOf: local(29, 12),
      actions: [done],
      sessions: [work],
      weekdays: capacity,
    });
    expect(report.days.map((day) => day.completedActionCount)).toEqual([0, 1]);
    expect(report.completedActionCount).toBe(1);
    expect(report.rows.find((row) => row.actionId === 'done')?.completed).toBe(true);
  });

  it('keeps a zero-duration session in history without inventing worked time', () => {
    const empty = session('empty-session', 'empty-action', local(28, 8));
    empty.complete({
      completedAt: local(28, 8),
      completionKind: 'completed',
      eventId: id('empty-finish'),
    });
    const report = buildWorkTimeReport({
      from: '2026-09-28',
      to: '2026-09-28',
      asOf: local(28, 9),
      actions: [],
      sessions: [empty],
      weekdays: capacity,
    });
    expect(report.rows[0]?.sessionCount).toBe(1);
    expect(report.actualMilliseconds).toBe(0);
  });

  it('uses the exact valid DayDate year for local midnight', () => {
    const ancient = new Date(0);
    ancient.setFullYear(42, 0, 5);
    ancient.setHours(9, 0, 0, 0);
    const report = buildWorkTimeReport({
      from: '0042-01-05',
      to: '0042-01-05',
      asOf: ancient,
      actions: [],
      sessions: [],
      weekdays: capacity,
    });
    expect(report.days[0]?.date).toBe('0042-01-05');
  });
  it('splits real work at local midnight and subtracts a pause crossing midnight', () => {
    const work = session('overnight', 'action', local(28, 23, 30));
    work.pause(local(28, 23, 50), id('pause'));
    work.resume(local(29, 0, 10), id('resume'));
    work.complete({
      completedAt: local(29, 0, 40),
      completionKind: 'completed',
      eventId: id('finish'),
    });
    const report = buildWorkTimeReport({
      from: '2026-09-28',
      to: '2026-09-29',
      asOf: local(29, 2),
      actions: [],
      sessions: [work],
      weekdays: capacity,
    });
    expect(report.days.map((day) => day.actualMilliseconds)).toEqual([20 * 60000, 30 * 60000]);
    expect(report.actualMilliseconds).toBe(50 * 60000);
    expect(report.rows[0]?.title).toBe('Действие недоступно');
  });

  it('counts a running session only to asOf and freezes an open pause', () => {
    const running = session('running', 'active', local(28, 8));
    const paused = session('paused', 'paused-action', local(28, 7));
    paused.pause(local(28, 7, 15), id('open-pause'));
    const future = session('future', 'future-action', local(29, 9));
    const report = buildWorkTimeReport({
      from: '2026-09-28',
      to: '2026-09-28',
      asOf: local(28, 8, 30),
      actions: [],
      sessions: [running, paused, future],
      weekdays: capacity,
    });
    expect(report.actualMilliseconds).toBe(45 * 60000);
    expect(report.rows).toHaveLength(2);
  });

  it('keeps unknown estimates explicit and uses goal at session start after relinking the action', () => {
    const action = planned('linked', 60, 'new-goal');
    const unknown = planned('unknown', null);
    const timed = planned('timed', 90);
    timed.setTimePlanning({
      estimateMinutes: 90,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 30,
    });
    const work = session('historical', 'linked', local(28, 8), 'old-goal');
    work.complete({
      completedAt: local(28, 8, 20),
      completionKind: 'completed',
      eventId: id('finish-goal'),
    });
    const legacy = session('legacy', 'linked', local(28, 9));
    legacy.complete({
      completedAt: local(28, 9, 10),
      completionKind: 'completed',
      eventId: id('finish-legacy'),
    });
    const report = buildWorkTimeReport({
      from: '2026-09-28',
      to: '2026-09-28',
      asOf: local(28, 12),
      actions: [action, unknown, timed],
      sessions: [work, legacy],
      weekdays: [120, null, null, null, null, null, null],
    });
    expect(report.plannedMinutes).toBe(90);
    expect(report.unknownEstimateCount).toBe(1);
    expect(report.capacityMinutes).toBe(120);
    expect(report.goals.find((row) => row.goalId === 'old-goal')?.actualMilliseconds).toBe(
      20 * 60000,
    );
    expect(report.goals.find((row) => row.goalId === 'new-goal')?.actualMilliseconds).toBe(0);
    expect(report.goals.find((row) => row.goalId === null)?.actualMilliseconds).toBe(10 * 60000);
    expect(report.rows.find((row) => row.actionId === 'unknown')?.plannedMinutes).toBeNull();
  });

  it('keeps actual time for an archived action and clips work to the selected range', () => {
    const action = planned('archived', 60);
    action.complete(null, local(29, 11), id('complete-archive'));
    action.archive(local(29, 12), id('archive'));
    const work = session('long', 'archived', local(27, 23, 40));
    work.complete({
      completedAt: local(28, 0, 20),
      completionKind: 'completed',
      eventId: id('long-finish'),
    });
    const report = buildWorkTimeReport({
      from: '2026-09-28',
      to: '2026-09-28',
      asOf: local(29, 12),
      actions: [action],
      sessions: [work],
      weekdays: capacity,
    });
    expect(report.actualMilliseconds).toBe(20 * 60000);
    expect(report.plannedMinutes).toBe(0);
    expect(report.rows[0]?.plannedMinutes).toBeNull();
    expect(report.days[0]?.capacityMinutes).toBeNull();
  });
});
