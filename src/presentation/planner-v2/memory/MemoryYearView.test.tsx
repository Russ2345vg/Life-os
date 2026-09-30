import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildMemoryYearOverview } from '../../../application/memory/MemoryQueries';
import { DayDate, EntityId } from '../../../domain';
import { createMemoryEvent, summarizeMemoryEvent } from '../../../domain/memory';
import { MemoryYearView } from './MemoryYearView';

describe('Memory year view', () => {
  it('renders one unique count while showing a highlighted achievement in all relevant sections', () => {
    const event = summarizeMemoryEvent(
      createMemoryEvent(
        {
          id: EntityId.create('year-memory'),
          occurredOn: DayDate.create('2024-02-29'),
          title: 'Достижение',
          body: 'Смысл',
          kind: 'achievement',
          isHighlight: true,
          context: null,
          diarySource: null,
          photo: null,
        },
        new Date('2024-02-29T08:00:00Z'),
      ),
    );
    const html = renderToStaticMarkup(
      createElement(MemoryYearView, {
        overview: buildMemoryYearOverview([event, event], 2024),
        onOpen: vi.fn(),
      }),
    );
    expect(html).toContain('Воспоминаний за год: 1');
    expect(html).toContain('февраль');
    expect(html).toContain('Главные моменты 2024');
  });
  it('explains an empty year without inventing moments or ratings', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryYearView, {
        overview: buildMemoryYearOverview([], 2025),
        onOpen: vi.fn(),
      }),
    );
    expect(html).toContain('Пока нет воспоминаний за этот год');
    expect(html).not.toContain('Общая оценка');
  });
});
