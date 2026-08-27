import { describe, expect, it, vi } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_IMPACT,
  WALK_MODE,
  WALK_REENTRY_ACTION_KIND,
  WALK_RETURN_ORIGIN,
  WALK_TYPE,
  Walk,
} from '../domain';
import { APP_SECTION } from '../presentation/navigation/AppSection';
import { loadPendingWalkReentry, shouldShowWalkReentryReminder } from './WalkReentryStartup';

describe('WalkReentryStartup', () => {
  it('loads pending Reentry independently and converts storage rejection to local error state', async () => {
    const pendingWalk = createPendingWalk();

    await expect(
      loadPendingWalkReentry({ execute: vi.fn().mockResolvedValue(pendingWalk) }),
    ).resolves.toEqual({ status: 'ready', walk: pendingWalk });
    await expect(
      loadPendingWalkReentry({ execute: vi.fn().mockRejectedValue(new Error('storage')) }),
    ).resolves.toEqual({ status: 'error' });
  });

  it('shows a pending reminder outside Walks without changing active section', () => {
    const pendingWalk = createPendingWalk();

    expect(
      shouldShowWalkReentryReminder({
        pendingState: { status: 'ready', walk: pendingWalk },
        activeSection: APP_SECTION.today,
        activeWalkRestored: false,
      }),
    ).toBe(true);
    expect(
      shouldShowWalkReentryReminder({
        pendingState: { status: 'ready', walk: pendingWalk },
        activeSection: APP_SECTION.walks,
        activeWalkRestored: false,
      }),
    ).toBe(false);
    expect(
      shouldShowWalkReentryReminder({
        pendingState: { status: 'ready', walk: pendingWalk },
        activeSection: APP_SECTION.today,
        activeWalkRestored: true,
      }),
    ).toBe(false);
  });

  it.each([
    { status: 'loading' } as const,
    { status: 'error' } as const,
    { status: 'ready', walk: null } as const,
  ])('hides the reminder for $status without a ready pending Walk', (pendingState) => {
    expect(
      shouldShowWalkReentryReminder({
        pendingState,
        activeSection: APP_SECTION.today,
        activeWalkRestored: false,
      }),
    ).toBe(false);
  });
});

function createPendingWalk(): Walk {
  return Walk.create({
    id: EntityId.create('walk-startup-reentry'),
    date: DayDate.create('2026-08-25'),
    type: WALK_TYPE.reflection,
    now: new Date('2026-08-25T09:00:00.000Z'),
  })
    .start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-25T10:00:00.000Z'),
      reflectionQuestion: 'Что сейчас важно заметить?',
    })
    .complete({ endedAt: new Date('2026-08-25T10:30:00.000Z') })
    .recordOutcome({
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reentryAction: {
        kind: WALK_REENTRY_ACTION_KIND.today,
        destination: WALK_RETURN_ORIGIN.today,
        entity: null,
        nextStep: null,
      },
      updatedAt: new Date('2026-08-25T10:32:00.000Z'),
    });
}
