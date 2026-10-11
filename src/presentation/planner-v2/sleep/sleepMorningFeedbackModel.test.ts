import { describe, expect, it } from 'vitest';
import { morningFeedbackLabels } from './sleepMorningFeedbackModel';
describe('subjective morning labels', () => {
  it('keeps missing choices neutral and maps independent feedback', () => {
    expect(morningFeedbackLabels(undefined)).toEqual({ sleepQuality: null, energy: null });
    expect(
      morningFeedbackLabels({ sleepQuality: 'GOOD', energy: 'TIRED', recordedAt: new Date() }),
    ).toEqual({ sleepQuality: 'Хорошо', energy: 'Устал' });
    expect(
      morningFeedbackLabels({ sleepQuality: null, energy: 'ENERGETIC', recordedAt: new Date() }),
    ).toEqual({ sleepQuality: null, energy: 'Бодр' });
  });
});
