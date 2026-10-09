import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EntityId, LifeAction, LifeActionTitle } from '../../domain';
import type { GetConnections } from '../../application/connections/GetConnections';
import type { PlannerActionOperations } from './PlannerActionList';
import type { usePlannerLibraryReadModel } from './usePlannerLibraryReadModel';
import { PlannerActionPanel } from './PlannerActionPanel';

describe('action panel connections', () => {
  it('offers connections inside the existing action dialog', () => {
    const action = LifeAction.createDraft({
      id: EntityId.create('action-1'),
      eventId: EntityId.create('event-1'),
      title: LifeActionTitle.create('Сравнить маршрут'),
      createdAt: new Date('2026-10-05T10:00:00Z'),
    });
    const reads = {
      snapshot: {
        data: { actions: [action], goals: [], directions: [], spheres: [] },
        error: null,
      },
    } as unknown as ReturnType<typeof usePlannerLibraryReadModel>;
    const html = renderToStaticMarkup(
      createElement(PlannerActionPanel, {
        actionId: 'action-1',
        today: '2026-10-05',
        reads,
        operations: {} as PlannerActionOperations,
        onClose: vi.fn(),
        onRetry: vi.fn(),
        onReturnFocus: () => null,
        registerGuard: () => () => undefined,
        feedback: null,
        onRetryCompletion: vi.fn(),
        commandError: null,
        onDismissCommandError: vi.fn(),
        connections: { read: vi.fn(), more: vi.fn() } as Pick<GetConnections, 'read' | 'more'>,
        onNavigate: vi.fn(),
      }),
    );
    expect(html).toContain('Посмотреть связи');
    expect(html.match(/<dialog/g)).toHaveLength(1);
  });
});
