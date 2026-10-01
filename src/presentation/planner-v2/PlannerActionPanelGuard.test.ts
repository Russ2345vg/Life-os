import { describe, expect, it, vi } from 'vitest';
import { createPlannerActionPanelLeaveGuard } from './PlannerActionPanelGuard';

describe('action panel leave guard', () => {
  it('does not ask to discard an unchanged panel even if the background is dirty', async () => {
    const confirm = vi.fn(async () => true);
    const guard = createPlannerActionPanelLeaveGuard(
      () => ({ dirty: false, busy: false }),
      confirm,
    );
    expect(await guard.requestLeave()).toBe(true);
    expect(guard.shouldBlockUnload()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('coalesces two requests for the same dirty draft and preserves it on Stay', async () => {
    let decide: (value: boolean) => void = () => undefined;
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => (decide = resolve)));
    const guard = createPlannerActionPanelLeaveGuard(() => ({ dirty: true, busy: false }), confirm);
    const first = guard.requestLeave();
    const second = guard.requestLeave();
    expect(confirm).toHaveBeenCalledOnce();
    expect(guard.shouldBlockUnload()).toBe(true);
    decide(false);
    expect(await first).toBe(false);
    expect(await second).toBe(false);
  });

  it('blocks writes but allows close after commit while reads are pending', async () => {
    let saving = true;
    const confirm = vi.fn(async () => true);
    const guard = createPlannerActionPanelLeaveGuard(
      () => ({ dirty: false, busy: saving }),
      confirm,
    );
    expect(await guard.requestLeave()).toBe(false);
    saving = false;
    expect(await guard.requestLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
