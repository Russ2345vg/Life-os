import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../../domain';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import { PlannerMemory } from './PlannerMemory';
describe('Memory screen', () => {
  it('shows loading and explains disabled creation without hiding readable history', () => {
    const services = {
      commands: { enabled: false },
      queries: { list: vi.fn() },
      diaryImport: {},
      photoReader: {},
    } as unknown as MemoryServices;
    const html = renderToStaticMarkup(
      createElement(PlannerMemory, {
        services,
        route: { view: 'memory' },
        currentDate: DayDate.create('2026-09-29'),
        catalog: { spheres: [], directions: [], goals: [] },
        onNavigate: vi.fn(),
      }),
    );
    expect(html).toContain('Загружаем воспоминания');
    expect(html).toContain('В этот день');
    expect(html).toContain('после обновления устройств');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Добавить воспоминание/);
  });
});
