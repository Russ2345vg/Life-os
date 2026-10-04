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

  it('offers guided questions for a personal question and ready themes', () => {
    for (const template of [
      'ownQuestion',
      'self',
      'dailyReview',
      'priorities',
      'relationships',
      'ideas',
    ] as const) {
      const stages = getWalkReflectionStages(template);
      expect(stages.length).toBeGreaterThanOrEqual(3);
      expect(stages.every((stage) => getWalkPrompt(stage)?.endsWith('?'))).toBe(true);
    }
    expect(getWalkPrompt(getWalkReflectionStages('ownQuestion')[0]!)).toContain('важен');
  });

  it('guides a concrete problem from facts and desired outcome to a small action', () => {
    const prompts = getWalkReflectionStages('problem').map(getWalkPrompt);
    expect(prompts).toHaveLength(7);
    expect(prompts[0]).toContain('происходит');
    expect(prompts[2]).toContain('результат');
    expect(prompts[4]).toContain('пробовали');
    expect(prompts[6]).toContain('шаг');
  });
});
