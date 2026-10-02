import { describe, expect, it } from 'vitest';
import { assertWalkPayloadCompatible } from './WalkSyncCompatibility';

describe('walk sync compatibility', () => {
  it('blocks planned walk metadata on actions and recurring rules until clients understand it', () => {
    for (const type of ['life_action', 'recurrence_rule']) {
      expect(() =>
        assertWalkPayloadCompatible(type, {
          id: 'one',
          walkPlan: { kind: 'walk', targetMinutes: 20 },
        }),
      ).toThrowError(/обновлен/i);
      expect(() => assertWalkPayloadCompatible(type, { id: 'one', walkPlan: null })).not.toThrow();
    }
  });
});
