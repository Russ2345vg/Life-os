import { describe, expect, it } from 'vitest';
import {
  WALK_REFLECTION_TEMPLATE,
  getWalkReflectionStages,
} from '../../domain/walk/WalkReflectionTemplate';
import { getWalkPrompt } from './WalkGuidance';
describe('walk guidance', () => {
  it('provides a question for each existing stage and leaves free thought unguided', () => {
    for (const template of Object.values(WALK_REFLECTION_TEMPLATE))
      for (const stage of getWalkReflectionStages(template))
        expect(getWalkPrompt(stage)).toMatch(/\?$/);
    expect(getWalkPrompt(null)).toBeNull();
    expect(getWalkReflectionStages('freeThought')).toEqual([]);
  });
});
