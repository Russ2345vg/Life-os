import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EntityId, Project } from '../../domain';
import { ActionProjectReference } from './LifeActionDetailsPanel';

describe('ActionProjectReference', () => {
  it('shows the project resolved through the action decision as a navigation control', () => {
    const project = Project.create({
      id: EntityId.create('project-action'),
      title: 'Выпустить LifeOS',
      now: new Date('2026-08-11T08:00:00.000Z'),
    });
    const markup = renderToStaticMarkup(
      createElement(ActionProjectReference, { project, onOpenProject: vi.fn() }),
    );

    expect(markup).toContain('Цель');
    expect(markup).toContain('Выпустить LifeOS');
    expect(markup).toContain('<button');
  });

  it('renders nothing for a standalone action', () => {
    expect(
      renderToStaticMarkup(
        createElement(ActionProjectReference, { project: null, onOpenProject: vi.fn() }),
      ),
    ).toBe('');
  });
});
