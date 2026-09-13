import { describe, expect, it, vi } from 'vitest';
import { finishPlannerSubmission } from './plannerRouteSubmission';

describe('Planner submission navigation', () => {
  it('does not navigate or replace a new draft when an earlier save finishes after leaving its route', async () => {
    let finish!: (value: string) => void;
    const saved = new Promise<string>((resolve) => {
      finish = resolve;
    });
    let current = true;
    const onCreated = vi.fn();
    const pending = finishPlannerSubmission(
      () => saved,
      () => current,
      onCreated,
    );
    current = false;
    finish('saved-action');
    await pending;
    expect(onCreated).not.toHaveBeenCalled();
    await expect(saved).resolves.toBe('saved-action');
  });
  it('reports a save failure to the current form and preserves the submitted draft', async () => {
    const onCreated = vi.fn();
    await expect(
      finishPlannerSubmission(
        () => Promise.reject(new Error('Storage unavailable')),
        () => true,
        onCreated,
      ),
    ).rejects.toThrow('Storage unavailable');
    expect(onCreated).not.toHaveBeenCalled();
  });
});
