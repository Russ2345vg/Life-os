import { describe, expect, it } from 'vitest';

const modules = import.meta.glob<typeof import('./WalkAnalyticsPresentation')>(
  './WalkAnalyticsPresentation.ts',
  { eager: true },
);
function presentation() {
  const module = Object.values(modules)[0];
  expect(module, 'WALK-12 presentation is implemented').toBeDefined();
  return module!;
}

describe('WALK-12 factual wording', () => {
  it.each([0, 1, 2])('does not claim a pattern for %i observations', (sampleSize) => {
    expect(presentation().walkAnalyticsObservation(sampleSize)).toBeNull();
  });
  it.each([3, 7])('marks %i observations preliminary with an explicit caveat', (sampleSize) => {
    const text = presentation().walkAnalyticsObservation(sampleSize);
    expect(text).toContain('Предварительное наблюдение');
    expect(text).toContain('мало данных');
    expect(text).not.toContain('устойчивая');
  });
  it.each([8, 12])(
    'permits the stable observation category at %i, without causal wording',
    (sampleSize) => {
      const text = presentation().walkAnalyticsObservation(sampleSize);
      expect(text).toContain('Наблюдается устойчивая закономерность');
      expect(text).toContain('не доказывает');
      expect(text).not.toMatch(/вызывают|рекомендуем|вам стоит/i);
    },
  );
  it.each([
    [null, '—'],
    [0, '0'],
    [2, '+2'],
    [-3, '−3'],
    [1.25, '+1,3'],
    [-0.01, '0'],
  ] as const)(
    'formats signed delta %s without fabricating a value or negative zero',
    (value, expected) => {
      expect(presentation().formatWalkAnalyticsValue(value, true)).toBe(expected);
    },
  );
  it.each([
    [1, 'На основе 1 прогулки'],
    [2, 'На основе 2 прогулок'],
    [11, 'На основе 11 прогулок'],
    [21, 'На основе 21 прогулки'],
  ] as const)('labels the actual sample %i', (count, expected) => {
    expect(presentation().walkAnalyticsSample(count)).toBe(expected);
  });
});
