import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RoutineWalkActions } from './RoutineWalkActions';

describe('Routine Walk actions', () => {
  const base = {
    linked: false,
    notStarted: true,
    canStart: true,
    disabled: false,
    onStart: vi.fn(),
    onReturn: vi.fn(),
  };
  it('offers one walk start and no generic execution or assignment action', () => {
    const markup = renderToStaticMarkup(createElement(RoutineWalkActions, base));
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toContain('Начать прогулку');
    expect(markup).not.toMatch(/Начать блок|Открыть прогулки/);
  });
  it('returns to the linked walk without generic completion or abandon', () => {
    const markup = renderToStaticMarkup(
      createElement(RoutineWalkActions, { ...base, linked: true, notStarted: false }),
    );
    expect(markup).toContain('Прогулка идёт');
    expect(markup).toContain('Вернуться к прогулке');
    expect(markup).not.toMatch(/Начать|Завершить|Прервать/);
  });
  it('does not present a start for a terminal or unavailable occurrence', () => {
    expect(
      renderToStaticMarkup(createElement(RoutineWalkActions, { ...base, notStarted: false })),
    ).toBe('');
    expect(
      renderToStaticMarkup(createElement(RoutineWalkActions, { ...base, canStart: false })),
    ).toBe('');
    expect(
      renderToStaticMarkup(createElement(RoutineWalkActions, { ...base, disabled: true })),
    ).toContain('disabled=""');
  });
});
