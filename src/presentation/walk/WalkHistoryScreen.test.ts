import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WalkHistoryDetail } from '../../application';
import { EntityId, WalkCapture } from '../../domain';
import { historyWalk } from '../../test/helpers/WalkHistoryFixtures';
import * as screen from './WalkHistoryScreen';
import * as details from './WalkHistoryDetails';

function renderDetail(overrides: Partial<WalkHistoryDetail> = {}) {
  expect(details.WalkHistoryDetails).toBeTypeOf('function');
  return renderToStaticMarkup(
    createElement(details.WalkHistoryDetails, {
      detail: { walk: historyWalk(), captures: [], sourceContext: null, ...overrides },
      onBack: vi.fn(),
      onOpenDecision: vi.fn(),
      onOpenRoutine: vi.fn(),
    }),
  );
}
function renderList(count: number, filter: 'all' | 'free' = 'all') {
  expect(screen.WalkHistoryList).toBeTypeOf('function');
  return renderToStaticMarkup(
    createElement(screen.WalkHistoryList, {
      walks: Array.from({ length: count }, (_, i) => historyWalk(`walk-${i}`)),
      page: 0,
      filter,
      restoreFocusId: null,
      onPageChange: vi.fn(),
      onOpen: vi.fn(),
      onStart: vi.fn(),
      onResetFilter: vi.fn(),
    }),
  );
}

describe('WALK-11 read-only markup', () => {
  it('accepts the Analytics intent without changing the default all-time History contract', () => {
    const markup = renderToStaticMarkup(
      createElement(screen.WalkHistoryScreen, {
        getWalkHistory: { execute: async () => [] },
        getWalkHistoryDetail: { execute: async () => null },
        initialFilter: 'reflection',
        onClose: vi.fn(),
        onStart: vi.fn(),
        onOpenDecision: vi.fn(),
        onOpenRoutine: vi.fn(),
      }),
    );
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Размышление/);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>Все/);
  });
  it('shows an empty history with the canonical start action, not empty columns', () => {
    const markup = renderList(0);
    expect(markup).toContain('Здесь появятся завершённые прогулки.');
    expect(markup).toContain('Начать прогулку');
    expect(markup).not.toContain('<table');
  });
  it('distinguishes an empty filter from having no completed walks', () => {
    const markup = renderList(0, 'free');
    expect(markup).toContain('Нет завершённых прогулок этого режима.');
    expect(markup).toContain('Показать все');
    expect(markup).not.toContain('Начать прогулку');
  });
  it.each([
    [1, 1],
    [21, 20],
    [100, 20],
  ])('renders %i records as %i bounded native row buttons', (count, expected) => {
    const markup = renderList(count);
    expect(markup.match(/data-walk-history-row=/g)).toHaveLength(expected);
    expect(markup).toContain('Свободная');
    expect(markup).toContain('30 мин');
    expect(markup).toContain('Без итога');
    expect(markup).toContain('<time');
    expect(markup).not.toContain('<table');
  });
  it('renders question, all three state rows and existing impact/result without editable controls', () => {
    const markup = renderDetail({
      walk: historyWalk('facts', {
        intent: 'reflection',
        beforeState: { energy: 4, tension: 7, clarity: 5 },
        afterState: { energy: 6, tension: 4, clarity: 7 },
        impact: 'better',
        result: 'Определён следующий приоритет',
      }),
    });
    for (const text of [
      'Размышление',
      'Что сейчас важно?',
      'Энергия',
      'Напряжение',
      'Ясность',
      'Лучше',
      'Определён следующий приоритет',
      'История прогулок',
    ])
      expect(markup).toContain(text);
    expect(markup).not.toMatch(/<(input|textarea|select)\b/);
    expect(markup).not.toMatch(/Редактировать|Удалить|Сохранить итог|Продолжить прогулку/);
  });
  it('does not replace missing measurements or outcome with invented data', () => {
    const markup = renderDetail();
    expect(markup.match(/Не отмечено/g)).toHaveLength(6);
    expect(markup).toContain('Без итога');
  });
  it('shows all saved thoughts with captured time and pending/processed status', () => {
    const capture = WalkCapture.create({
      id: EntityId.create('a'),
      walkId: EntityId.create('history-walk'),
      content: 'Первая мысль',
      capturedAt: new Date('2026-08-26T08:01:00Z'),
      walkElapsedMs: 60000,
    });
    const second = WalkCapture.create({
      id: EntityId.create('b'),
      walkId: capture.walkId,
      content: 'Обработанная мысль',
      capturedAt: new Date('2026-08-26T08:02:00Z'),
      walkElapsedMs: 120000,
    }).process(new Date('2026-08-26T09:00:00Z'));
    const markup = renderDetail({ captures: [capture, second] });
    for (const text of [
      'Сохранённые мысли · 2',
      'Первая мысль',
      'Обработанная мысль',
      'Не обработано',
      'Обработано',
      '2026-08-26T08:01:00.000Z',
    ])
      expect(markup).toContain(text);
  });
  it.each(['decision', 'routine'] as const)(
    'provides a safe explicit %s link only for a live source',
    (type) => {
      const source = { type, id: EntityId.create('source') };
      const markup = renderDetail({
        walk: historyWalk('context', { linkedEntity: source }),
        sourceContext: { source, label: 'Мой источник', availability: 'available' },
      });
      expect(markup).toContain('Мой источник');
      expect(markup).toContain(type === 'decision' ? 'Открыть решение' : 'Открыть распорядок');
    },
  );
  it.each(['missing', 'unavailable'] as const)(
    'keeps %s source facts visible but removes navigation',
    (availability) => {
      const source = { type: 'decision' as const, id: EntityId.create('gone') };
      const markup = renderDetail({
        walk: historyWalk('gone', { linkedEntity: source }),
        sourceContext: { source, label: null, availability },
      });
      expect(markup).toContain('Связанное решение недоступно');
      expect(markup).not.toContain('Открыть решение');
      expect(markup).toContain('Что сейчас важно?');
    },
  );
});
