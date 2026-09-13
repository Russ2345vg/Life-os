import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GOAL_STATUS } from '../../domain';
import { GoalCard, GoalCardPreview } from './GoalCard';
import type { GoalCardViewModel } from './goalAlbumPresentation';

const MODEL: GoalCardViewModel = {
  id: 'goal-home',
  title: 'Собственный дом',
  coverImageUrl: 'data:image/png;base64,YQ==',
  direction: {
    kind: 'assigned',
    id: 'direction-home',
    name: 'Среда жизни',
    sphere: { id: 'sphere-home', name: 'Дом' },
  },
  status: GOAL_STATUS.active,
  statusLabel: 'Активная',
  stageLabel: 'Активная цель',
  horizonLabel: '1–3 года',
  progress: {
    kind: 'metric',
    label: '25 из 100 %',
    percent: 25,
    current: 25,
    target: 100,
    unit: '%',
  },
  nextProgress: 'Согласовать цель',
  updatedAtMs: 0,
};

describe('GoalCard sharing', () => {
  it('keeps the A1 default variant as one whole-card route link', () => {
    const markup = renderToStaticMarkup(createElement(GoalCard, { goal: MODEL, onOpen: vi.fn() }));

    expect(markup).toContain('href="#/goals/goal-home"');
    expect(markup.match(/<a /gu)).toHaveLength(1);
    expect(markup).toContain('Собственный дом');
    expect(markup).toContain('25 из 100 %');
    expect(markup).toContain('data:image/png;base64,YQ==');
  });

  it('renders the same visible content in a non-interactive preview', () => {
    const markup = renderToStaticMarkup(createElement(GoalCardPreview, { goal: MODEL }));

    expect(markup).not.toContain('href=');
    expect(markup).toContain('aria-label="Предпросмотр цели"');
    expect(markup).toContain('Собственный дом');
    expect(markup).toContain('25 из 100 %');
    expect(markup).toContain('data:image/png;base64,YQ==');
  });
});
