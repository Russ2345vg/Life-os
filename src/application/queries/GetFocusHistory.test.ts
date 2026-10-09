import { describe, expect, it } from 'vitest';
import { ActionSession, EntityId } from '../../domain';
import { buildFocusHistory } from './GetFocusHistory';
import { buildWorkTimeReport } from './GetWorkTimeReport';

const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute);
const id = EntityId.create;
function session(kind: 'focus' | 'work', name: string, start: Date) {
  return ActionSession.start({
    id: id(name),
    lifeActionId: id('action'),
    startedAt: start,
    eventId: id(`${name}-start`),
    kind,
  });
}
describe('focus history', () => {
  it('clips focus across midnight, excludes pauses and ordinary work, and counts it once', () => {
    const focus = session('focus', 'focus', at(8, 23, 50));
    focus.pause(at(8, 23, 55), id('pause'));
    focus.resume(at(9, 0, 5), id('resume'));
    focus.complete({
      completedAt: at(9, 0, 15),
      completionKind: 'completed',
      eventId: id('finish'),
    });
    const work = session('work', 'work', at(9, 1, 0));
    work.complete({
      completedAt: at(9, 2, 0),
      completionKind: 'completed',
      eventId: id('work-finish'),
    });
    const input = {
      from: '2026-10-08',
      to: '2026-10-09',
      asOf: at(9, 3, 0),
      sessions: [focus, work],
      actions: [],
    };
    const result = buildFocusHistory(input);
    expect(result.totalMilliseconds).toBe(15 * 60_000);
    expect(
      buildWorkTimeReport({ ...input, weekdays: [null, null, null, null, null, null, null] })
        .actualMilliseconds,
    ).toBe(75 * 60_000);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.available).toBe(false);
    expect(buildFocusHistory({ ...input, from: '2026-10-09' }).totalMilliseconds).toBe(10 * 60_000);
    expect(buildFocusHistory({ ...input, to: '2026-10-08' }).totalMilliseconds).toBe(5 * 60_000);
  });
  it('retains actual partial time for an interrupted focus and does not count future time', () => {
    const focus = session('focus', 'partial', at(9, 9, 0));
    focus.complete({
      completedAt: at(9, 9, 7),
      completionKind: 'interrupted',
      eventId: id('partial-end'),
    });
    const input = {
      from: '2026-10-09',
      to: '2026-10-09',
      asOf: at(9, 9, 5),
      sessions: [focus],
      actions: [],
    };
    expect(buildFocusHistory(input).totalMilliseconds).toBe(5 * 60_000);
    expect(buildFocusHistory({ ...input, asOf: at(9, 10, 0) }).rows[0]?.status).toBe('interrupted');
  });
});
