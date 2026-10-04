import { describe, expect, it } from 'vitest';
import { assertWalkPayloadCompatible } from './WalkSyncCompatibility';

describe('walk sync compatibility', () => {
  it('keeps new reflection records local until a compatible sync format is negotiated', () => {
    expect(() =>
      assertWalkPayloadCompatible(
        'walk',
        {
          id: 'walk-1',
          status: 'completed',
          reflectionQuestion: 'Что важно?',
          reflectionNotes: { understood: 'Первый шаг', open: null, next: null },
        },
        1,
      ),
    ).toThrowError(/обновлен/i);
    expect(() =>
      assertWalkPayloadCompatible(
        'walk_capture',
        {
          id: 'answer-1',
          promptStage: 'whyImportant',
        },
        1,
      ),
    ).toThrowError(/обновлен/i);
    expect(() =>
      assertWalkPayloadCompatible(
        'walk',
        {
          id: 'walk-1',
          status: 'running',
          reflectionQuestion: 'Что важно?',
          reflectionTemplate: 'ownQuestion',
        },
        1,
      ),
    ).toThrowError(/обновлен/i);
    expect(() =>
      assertWalkPayloadCompatible(
        'walk',
        {
          id: 'walk-1',
          status: 'running',
          reflectionQuestion: 'Что важно?',
          reflectionTemplate: 'ownQuestion',
        },
        2,
      ),
    ).toThrowError(/обновлен/i);
    expect(() =>
      assertWalkPayloadCompatible(
        'walk_capture',
        {
          id: 'answer-1',
          promptStage: 'whyImportant',
        },
        2,
      ),
    ).toThrowError(/обновлен/i);
    expect(() => assertWalkPayloadCompatible('walk_capture', { id: 'thought-1' }, 2)).not.toThrow();
  });
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
