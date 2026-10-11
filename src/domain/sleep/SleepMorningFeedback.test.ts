import { describe, expect, it } from 'vitest';
import { validateSleepMorningFeedback } from './SleepMorningFeedback';

describe('morning feedback validation', () => {
  it.each([
    { sleepQuality: 'GOOD' as const, energy: null },
    { sleepQuality: null, energy: 'ENERGETIC' as const },
    { sleepQuality: 'POOR' as const, energy: 'OK' as const },
  ])('accepts independent subjective choices %#', (values) => {
    expect(() =>
      validateSleepMorningFeedback({ ...values, recordedAt: new Date('2026-10-11T01:00:00Z') }),
    ).not.toThrow();
  });
  it('rejects empty feedback and invalid dates', () => {
    expect(() =>
      validateSleepMorningFeedback({ sleepQuality: null, energy: null, recordedAt: new Date() }),
    ).toThrow();
    expect(() =>
      validateSleepMorningFeedback({
        sleepQuality: 'GOOD',
        energy: null,
        recordedAt: new Date('bad'),
      }),
    ).toThrow();
  });
});
