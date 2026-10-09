import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RoutineLanding } from './RoutineLanding';

describe('RoutineLanding', () => {
  it('links walks from the text chronology between the day plan and evening ritual', () => {
    const html = renderToStaticMarkup(createElement(RoutineLanding, { onNavigate: vi.fn() }));
    expect(html).toContain('href="#/v2/routine/morning"');
    expect(html).toContain('href="#/v2/routine/day"');
    expect(html).toContain('href="#/v2/sleep?from=routine"');
    expect(html).toContain('href="#/v2/walks"');
    expect(html).toContain('Утренние практики');
    expect(html).toContain('Автопилот дня');
    expect(html).toContain('Прогулка');
    expect(html).toContain('Вечерний ритуал');
    expect(html.indexOf('Автопилот дня')).toBeLessThan(html.indexOf('Прогулка'));
    expect(html.indexOf('Прогулка')).toBeLessThan(html.indexOf('Вечерний ритуал'));
    expect(html).not.toContain('planner-day-autopilot');
    expect(html).not.toContain('morning-workout');
    expect(html).not.toContain('sleep-preparation');
  });
});
