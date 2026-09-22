import { describe, expect, it, vi } from 'vitest';
import { DeletePilotDirection } from './DeletePilotDirection';
import { DeletePilotGoal } from './DeletePilotGoal';

describe('pilot delete commands', () => {
  it('keeps explicit delete separate from archive semantics', async () => {
    const repository = { delete: vi.fn(async () => true) };
    await new DeletePilotDirection(repository).execute('direction-1');
    await new DeletePilotGoal(repository).execute('goal-1');
    expect(repository.delete.mock.calls).toEqual([
      ['direction', 'direction-1'],
      ['goal', 'goal-1', { explainBlocked: true }],
    ]);
  });
});
