import { describe, expect, it } from 'vitest';
import type { PlannerRoute } from './PlannerNavigation';
import { aiScopeForRoute } from './aiScopeForRoute';
import { routeForSource } from './aiSourceRoute';
import { contextualAiExamples } from './contextualAiExamples';

describe('assistant route context', () => {
  it('uses factual non-medical sleep wording', () => {
    expect(contextualAiExamples.sleep).toContain('время в постели');
    expect(contextualAiExamples.sleep).not.toMatch(/качество|диагноз|лечен/iu);
  });
  it.each([
    [{ view: 'today' }, 'today'],
    [{ view: 'spheres' }, 'spheres'],
    [{ view: 'directions' }, 'directions'],
    [{ view: 'needs' }, 'needs'],
    [{ view: 'goals' }, 'goals'],
    [{ view: 'actions' }, 'actions'],
    [{ view: 'inbox' }, 'inbox'],
    [{ view: 'walks' }, 'walks'],
    [{ view: 'diary' }, 'diary'],
    [{ view: 'memory' }, 'memory'],
    [{ view: 'sleep' }, 'sleep'],
    [{ view: 'analytics' }, 'analytics'],
    [{ view: 'account' }, 'account'],
  ] as const)('offers the right data family for %j', (route, section) => {
    expect(aiScopeForRoute(route as PlannerRoute, '2026-10-03').section).toBe(section);
  });
  it('keeps selected entities and period attached to the request', () => {
    expect(aiScopeForRoute({ view: 'goal', id: 'goal-1' }, '2026-10-03')).toMatchObject({
      section: 'goals',
      selectedId: 'goal-1',
    });
    expect(
      aiScopeForRoute({ view: 'diary', period: 'week', date: '2026-09-28' }, '2026-10-03'),
    ).toMatchObject({ section: 'diary', period: 'week', date: '2026-09-28' });
    expect(aiScopeForRoute({ view: 'today', day: 'tomorrow' }, '2026-10-03')).toMatchObject({
      section: 'today',
      tomorrow: true,
    });
    expect(
      aiScopeForRoute(
        { view: 'analytics', period: 'month', date: '2026-09-01', topic: 'rest' },
        '2026-10-03',
      ),
    ).toMatchObject({
      section: 'analytics',
      period: 'month',
      date: '2026-09-01',
      topic: 'rest',
    });
  });
  it('opens analytics evidence at its original daily record', () => {
    const scope = aiScopeForRoute(
      {
        view: 'analytics',
        period: 'month',
        date: '2026-10-01',
        topic: 'rest',
      },
      '2026-10-03',
    );
    expect(
      routeForSource(
        {
          kind: 'diary',
          id: 'diary:day:2026-10-02',
          title: 'Дневник',
          detail: 'Энергия: 3',
          date: '2026-10-02',
        },
        scope,
      ),
    ).toEqual({ view: 'diary', period: 'day', date: '2026-10-02' });
    expect(
      routeForSource(
        {
          kind: 'sleep',
          id: '2026-10-02',
          title: 'Подготовка ко сну',
          detail: 'Статус: ALL_DONE',
          date: '2026-10-02',
        },
        scope,
      ),
    ).toEqual({ view: 'sleep' });
  });
});
