import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WalkRecommendation } from '../../application';
const modules = import.meta.glob<typeof import('./WalkRecommendationPanel')>(
  './WalkRecommendationPanel.tsx',
  { eager: true },
);
function screen() {
  const module = Object.values(modules)[0];
  expect(module, 'WALK-13 recommendation panel exists').toBeDefined();
  return module!;
}
const recommendation: WalkRecommendation = {
  intent: 'recovery',
  durationMinutes: 30,
  sampleSize: 8,
  confidenceLevel: 'stable',
  currentState: { energy: 4, tension: 7, clarity: 3 },
  startDate: '2026-07-28',
  endDate: '2026-08-26',
  insight: {
    id: 'beforeState:recovery',
    kind: 'beforeState',
    intent: 'recovery',
    metric: 'tension',
    evidence: { sampleSize: 8, confidenceLevel: 'stable', averageDelta: -2.125, improvedCount: 7 },
  },
};
function render(value: WalkRecommendation | null) {
  return renderToStaticMarkup(
    createElement(screen().WalkRecommendationView, {
      recommendation: value,
      onChoose: vi.fn(),
      onOrdinary: vi.fn(),
    }),
  );
}
describe('WALK-13 explainable optional suggestion', () => {
  it('shows one main action, current context, historical evidence and a noncausal caveat', () => {
    const markup = render(recommendation);
    expect(markup).toContain('Можно попробовать');
    expect(markup).toContain('Почему LifeOS это предлагает?');
    expect(markup).toContain('Напряжение 7/10');
    expect(markup).toContain('7 из 8');
    expect(markup).toContain('−2,1');
    expect(markup).toContain('Устойчивая закономерность');
    expect(markup).toContain('не доказывает причинную связь');
    expect(markup.match(/walk-session-primary-action/g)).toHaveLength(1);
    expect(markup).toContain('Обычный выбор');
    expect(markup).not.toMatch(/точно улучшит|вам необходимо|лучшее время|оптимальн|лечит/iu);
  });
  it('labels duration as editable default, not personalized evidence', () => {
    expect(render(recommendation)).toContain('30 минут — обычная настройка, можно изменить');
  });
  it('does not invent current state from historical evidence', () => {
    const markup = render({ ...recommendation, currentState: null });
    expect(markup).toContain('Текущее состояние не указано');
    expect(markup).not.toContain('Напряжение 7/10');
  });
  it('low data keeps ordinary launch and has no personalized why', () => {
    const markup = render(null);
    expect(markup).toContain('Пока недостаточно данных для персональной рекомендации.');
    expect(markup).toContain('Начать прогулку');
    expect(markup).not.toContain('Почему LifeOS');
  });
});
