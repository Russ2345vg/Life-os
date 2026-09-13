import { describe, expect, it, vi } from 'vitest';
import { APPLICATION_MODE } from '../application';
import { DayDate } from '../domain';
import { loadApplicationStartup } from './ApplicationStartup';

const DATE = DayDate.create('2026-08-25');

describe('loadApplicationStartup', () => {
  it('preserves the explicit V2 preview even when a legacy walk is active', async () => {
    const getActiveWalk = { execute: vi.fn().mockResolvedValue({ date: DATE }) };
    const result = await loadApplicationStartup({
      getActiveWalk,
      getApplicationMode: { execute: vi.fn() },
      hasInitialRoutineRoute: true,
      hasInitialPlannerRoute: true,
    });
    expect(result).toEqual({ status: 'idle' });
    expect(getActiveWalk.execute).not.toHaveBeenCalled();
  });
  it('restores an active walk before an initial Routine deep link', async () => {
    const getApplicationMode = { execute: vi.fn() };

    const result = await loadApplicationStartup({
      getActiveWalk: { execute: vi.fn().mockResolvedValue({ date: DATE }) },
      getApplicationMode,
      hasInitialRoutineRoute: true,
    });

    expect(result).toEqual({ status: 'active-walk', date: DATE });
    expect(getApplicationMode.execute).not.toHaveBeenCalled();
  });

  it('preserves an initial Routine deep link when there is no active walk', async () => {
    const getApplicationMode = { execute: vi.fn() };

    const result = await loadApplicationStartup({
      getActiveWalk: { execute: vi.fn().mockResolvedValue(null) },
      getApplicationMode,
      hasInitialRoutineRoute: true,
    });

    expect(result).toEqual({ status: 'routine-route' });
    expect(getApplicationMode.execute).not.toHaveBeenCalled();
  });

  it('keeps the existing evening startup decision when no walk or Routine route wins', async () => {
    const result = await loadApplicationStartup({
      getActiveWalk: { execute: vi.fn().mockResolvedValue(null) },
      getApplicationMode: {
        execute: vi.fn().mockResolvedValue({
          mode: APPLICATION_MODE.evening,
          cycleDate: DATE,
        }),
      },
      hasInitialRoutineRoute: false,
    });

    expect(result).toEqual({ status: 'evening', date: DATE });
  });
});
