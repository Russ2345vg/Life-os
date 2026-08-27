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
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import {
  closeWalkReentryFlow,
  completeWalkReentryFlow,
  selectWalkSessionEntry,
} from './WalkReentryFlow';

describe('WalkReentryFlow', () => {
  it('opens routine preparation only after active, pending Reentry and load errors', () => {
    const routineLaunchRequest = {
      source: {
        routineBlockId: EntityId.create('source'),
        occurrenceDate: DayDate.create('2026-08-26'),
        effectiveDate: DayDate.create('2026-08-26'),
      },
      sourceTitle: 'Прогулка',
      plannedTimeLabel: '12:00–13:00',
      nextStep: null,
    };
    const input = {
      activeWalk: null,
      pendingReentry: null,
      pendingLoadFailed: false,
      routineLaunchRequest,
    };
    expect(selectWalkSessionEntry(input)).toEqual({ phase: 'routineLaunch', walk: null });
    expect(selectWalkSessionEntry({ ...input, pendingLoadFailed: true }).phase).toBe(
      'reentryError',
    );
    expect(
      selectWalkSessionEntry({ ...input, pendingReentry: pendingWalk('priority') }).phase,
    ).toBe('reentry');
    expect(selectWalkSessionEntry({ ...input, activeWalk: activeWalk('priority') }).phase).toBe(
      'active',
    );
  });

  it('prefers an active Walk, then pending Reentry, load error, and center', () => {
    const active = activeWalk('active');
    const pending = pendingWalk('pending');

    expect(
      selectWalkSessionEntry({
        activeWalk: active,
        pendingReentry: pending,
        pendingLoadFailed: true,
      }),
    ).toEqual({ phase: 'active', walk: active });
    expect(
      selectWalkSessionEntry({
        activeWalk: null,
        pendingReentry: pending,
        pendingLoadFailed: true,
      }),
    ).toEqual({ phase: 'reentry', walk: pending });
    expect(
      selectWalkSessionEntry({
        activeWalk: null,
        pendingReentry: null,
        pendingLoadFailed: true,
      }),
    ).toEqual({ phase: 'reentryError', walk: null });
    expect(
      selectWalkSessionEntry({
        activeWalk: null,
        pendingReentry: null,
        pendingLoadFailed: false,
      }),
    ).toEqual({ phase: 'center', walk: null });
  });

  it('awaits successful completion and reminder refresh before navigation', async () => {
    const pending = pendingWalk('complete-order');
    const resolved = pending.completeReentry(new Date('2026-08-25T10:35:00.000Z'));
    const commandResult = deferred<{ readonly ok: true; readonly value: Walk }>();
    const command = { execute: vi.fn().mockReturnValue(commandResult.promise) };
    const onReentryChanged = vi.fn().mockResolvedValue(undefined);
    const onNavigate = vi.fn();

    const execution = completeWalkReentryFlow({
      walk: pending,
      command,
      onReentryChanged,
      onNavigate,
    });

    expect(onReentryChanged).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    commandResult.resolve({ ok: true, value: resolved });
    await expect(execution).resolves.toEqual({ ok: true, value: resolved });
    expect(onReentryChanged).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(resolved.reentry?.action);
    expect(onReentryChanged.mock.invocationCallOrder[0]).toBeLessThan(
      onNavigate.mock.invocationCallOrder[0]!,
    );
  });

  it('does not refresh or navigate after a failed completion command', async () => {
    const pending = pendingWalk('complete-failure');
    const error = new DomainError('walk.version_conflict', 'Конфликт версии.');
    const onReentryChanged = vi.fn().mockResolvedValue(undefined);
    const onNavigate = vi.fn();

    const result = await completeWalkReentryFlow({
      walk: pending,
      command: { execute: vi.fn().mockResolvedValue({ ok: false, error }) },
      onReentryChanged,
      onNavigate,
    });

    expect(result).toEqual({ ok: false, error });
    expect(onReentryChanged).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('returns a domain failure instead of navigating when action state is unexpectedly missing', async () => {
    const completed = completedWalk('missing-action');
    const onReentryChanged = vi.fn().mockResolvedValue(undefined);
    const onNavigate = vi.fn();

    const result = await completeWalkReentryFlow({
      walk: pendingWalk('stale-input-action'),
      command: { execute: vi.fn().mockResolvedValue({ ok: true, value: completed }) },
      onReentryChanged,
      onNavigate,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'walk.reentry_not_pending' } });
    expect(onReentryChanged).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('awaits close persistence and refresh before returning to Walk Center', async () => {
    const pending = pendingWalk('close-order');
    const resolved = pending.closeReentry(new Date('2026-08-25T10:35:00.000Z'));
    const events: string[] = [];
    const onReentryChanged = vi.fn().mockImplementation(async () => {
      events.push('refresh');
    });
    const onReturnToCenter = vi.fn(() => events.push('center'));

    const result = await closeWalkReentryFlow({
      walk: pending,
      command: { execute: vi.fn().mockResolvedValue({ ok: true, value: resolved }) },
      onReentryChanged,
      onReturnToCenter,
    });

    expect(result).toEqual({ ok: true, value: resolved });
    expect(events).toEqual(['refresh', 'center']);
  });
});

function pendingWalk(id: string): Walk {
  return completedWalk(id).recordOutcome({
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

function completedWalk(id: string): Walk {
  return activeWalk(id).complete({ endedAt: new Date('2026-08-25T10:30:00.000Z') });
}

function activeWalk(id: string): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DayDate.create('2026-08-25'),
    type: WALK_TYPE.reflection,
    now: new Date('2026-08-25T09:00:00.000Z'),
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: new Date('2026-08-25T10:00:00.000Z'),
    reflectionQuestion: 'Что сейчас важно заметить?',
  });
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise!(value),
  };
}
