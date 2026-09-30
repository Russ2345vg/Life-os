import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, EntityId } from '../../../domain';
import type { MemoryDraft } from '../../../domain/memory';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import { createRouteLeaveGuard, RouteLeaveGuardProvider } from '../../navigation/RouteLeaveGuard';
import { MemoryEditor } from './MemoryEditor';
import { memoryDraftChanged } from './memoryPresentation';

const draft: MemoryDraft = {
  id: EntityId.create('memory-editor'),
  occurredOn: DayDate.create('2026-09-29'),
  title: 'Мой момент',
  body: 'История',
  kind: 'moment',
  isHighlight: false,
  context: null,
  diarySource: null,
  photo: null,
};
describe('Memory editor', () => {
  it('shows a pending photo and retains a missing historical context', () => {
    const initial = {
      ...draft,
      context: {
        sphereId: 'old',
        sphereTitle: 'Старая сфера',
        directionId: null,
        directionTitle: null,
        goalId: null,
        goalTitle: null,
      },
    };
    const html = renderToStaticMarkup(
      createElement(RouteLeaveGuardProvider, {
        guard: createRouteLeaveGuard(),
        children: createElement(MemoryEditor, {
          initialDraft: initial,
          expectedVersion: 2,
          pendingPhoto: true,
          services: {
            commands: { enabled: true },
            photoReader: { read: vi.fn() },
          } as unknown as MemoryServices,
          today: '2026-09-29',
          catalog: { spheres: [], directions: [], goals: [] },
          onSaved: vi.fn(),
          onCancel: vi.fn(),
        }),
      }),
    );
    expect(html).toContain('Фотография ещё загружается');
    expect(html).toContain('Старая сфера');
    expect(html).toContain('Удалить фотографию');
    expect(html).toContain('Мой момент');
  });
  it('protects changes and allows a complete revert without treating photo null as removal', () => {
    expect(memoryDraftChanged(draft, draft)).toBe(false);
    expect(memoryDraftChanged({ ...draft, title: 'Другое' }, draft)).toBe(true);
    expect(memoryDraftChanged(draft, draft, true)).toBe(true);
  });
});
