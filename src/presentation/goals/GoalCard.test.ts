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
  it('does not offer new actions for an archived Goal', () => {
    const markup = renderToStaticMarkup(
      createElement(GoalCard, { goal: { ...MODEL, status: 'archived' }, onOpen: vi.fn() }),
    );
    expect(markup).not.toContain('#/v2/actions/new');
  });
  it('keeps the whole-card Goal route and adds a separate action link with its goalId', () => {
    const markup = renderToStaticMarkup(createElement(GoalCard, { goal: MODEL, onOpen: vi.fn() }));

    expect(markup).toContain('href="#/goals/goal-home"');
    expect(markup.match(/<a /gu)).toHaveLength(2);
    expect(markup).toContain('href="#/v2/actions/new?goalId=goal-home"');
    expect(markup).toContain('Добавить действие');
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
