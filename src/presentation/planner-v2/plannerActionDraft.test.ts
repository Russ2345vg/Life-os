import { describe, expect, it } from 'vitest';
import { editPlannerField, plannerFieldState } from './plannerActionDraft';
describe('action fields receiving synced changes', () => {
  it('shows the current saved value while pristine', () => {
    expect(plannerFieldState(null, '2026-09-14')).toEqual({ value: '2026-09-14', conflict: false });
    expect(plannerFieldState(null, '2026-09-15').value).toBe('2026-09-15');
  });
  it('retains typed text and flags an external change until explicitly reloaded', () => {
    const typed = editPlannerField(null, 'goal-a', 'goal-b');
    expect(plannerFieldState(typed, 'goal-c')).toEqual({ value: 'goal-b', conflict: true });
    expect(plannerFieldState(null, 'goal-c')).toEqual({ value: 'goal-c', conflict: false });
    expect(plannerFieldState(typed, 'goal-b').conflict).toBe(false);
  });
});
