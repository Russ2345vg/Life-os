import { describe, expect, it } from 'vitest';
import { ActionSession, EntityId } from '../../domain';
import {
  morningFocusWorkedMilliseconds,
  recordMorningFocusSession,
  type MorningFocusLedger,
} from './MorningFocusLedger';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 4, 7, minute));

function session(id: string, actionId: string): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId: EntityId.create(actionId),
    startedAt: at(0),
    eventId: EntityId.create(`event-${id}`),
  });
}

describe('morning focus credit', () => {
  it('counts work on the selected day and action, excluding breaks and earlier work', () => {
    const main = session('main-session', 'main-action');
    main.pause(at(25), EntityId.create('pause-1'));
    main.resume(at(30), EntityId.create('resume-1'));
    main.pause(at(55), EntityId.create('pause-2'));
    main.resume(at(60), EntityId.create('resume-2'));
    const other = session('other-session', 'other-action');
    const ledger: MorningFocusLedger = {
      dateKey: '2026-10-04',
      actionId: 'main-action',
      sessions: [{ sessionId: 'main-session', baselineMs: 0 }],
    };
    expect(morningFocusWorkedMilliseconds(ledger, [main, other], at(70))).toBe(60 * 60_000);
    expect(morningFocusWorkedMilliseconds(ledger, [main, other], at(85))).toBe(75 * 60_000);
  });

  it('records an existing session from its current worked duration only once', () => {
    const main = session('main-session', 'main-action');
    const first = recordMorningFocusSession(null, '2026-10-04', main, at(10));
    const repeated = recordMorningFocusSession(first, '2026-10-04', main, at(20));
    expect(repeated).toEqual(first);
    expect(morningFocusWorkedMilliseconds(first, [main], at(70))).toBe(60 * 60_000);
  });

  it('does not fail while the view clock lags behind a newly started session', () => {
    const main = session('fresh-session', 'main-action');
    const ledger = recordMorningFocusSession(null, '2026-10-04', main, at(0));
    expect(morningFocusWorkedMilliseconds(ledger, [main], new Date(at(0).getTime() - 1))).toBe(0);
  });
});
