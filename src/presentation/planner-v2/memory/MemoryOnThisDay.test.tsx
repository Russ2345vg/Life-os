import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId } from '../../../domain';
import { createMemoryEvent, summarizeMemoryEvent } from '../../../domain/memory';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import { MemoryOnThisDay } from './MemoryOnThisDay';

const today = DayDate.create('2026-10-01');
const queries = {} as MemoryServices['queries'];
const noOp = () => undefined;

function item(id: string, date: string) {
  return summarizeMemoryEvent({
    ...createMemoryEvent(
      {
        id: EntityId.create(id),
        occurredOn: DayDate.create(date),
        title: `История ${id}`,
        body: '',
        kind: 'moment',
        isHighlight: false,
        context: null,
        diarySource: null,
        photo: null,
      },
      new Date('2026-09-29T00:00:00Z'),
    ),
    version: 1,
  });
}

function render(props: {
  items?: ReturnType<typeof item>[];
  loading?: boolean;
  error?: string | null;
}) {
  return renderToStaticMarkup(
    createElement(MemoryOnThisDay, {
      today,
      items: props.items ?? [],
      loading: props.loading ?? false,
      error: props.error ?? null,
      queries,
      onRetry: noOp,
      onOpen: noOp,
    }),
  );
}

describe('MemoryOnThisDay', () => {
  it('shows the day and a compact empty state', () => {
    const html = render({});
    expect(html).toContain('В этот день');
    expect(html).toContain('1 октября');
    expect(html).toContain('Пока нет воспоминаний об этой дате');
  });

  it('distinguishes loading and retryable read failure', () => {
    expect(render({ loading: true })).toContain('Ищем воспоминания этой даты');
    const failed = render({ error: 'Нет доступа к данным' });
    expect(failed).toContain('Нет доступа к данным');
    expect(failed).toContain('Повторить');
    expect(failed).not.toContain('Пока нет воспоминаний');
  });

  it('shows three dated previews and offers the remaining events', () => {
    const html = render({
      items: [
        item('first', '2025-10-01'),
        item('second', '2024-10-01'),
        item('third', '2021-10-01'),
        item('fourth', '2020-10-01'),
      ],
    });
    expect(html).toContain('1 год назад');
    expect(html).toContain('2 года назад');
    expect(html).toContain('5 лет назад');
    expect(html).toContain('История third');
    expect(html).not.toContain('История fourth');
    expect(html).toContain('Показать все (4)');
  });
});
