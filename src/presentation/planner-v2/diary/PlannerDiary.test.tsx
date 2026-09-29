import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, diaryPeriod, createDiaryDraft } from '../../../domain';
import type { DiaryService } from '../../../application';
import { DiaryDayView } from './DiaryDayView';
import { PlannerDiary } from './PlannerDiary';

describe('PlannerDiary daily view', () => {
  it('renders an accessible loading state before the entry arrives', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerDiary, {
        service: { get: vi.fn(() => new Promise(() => undefined)) } as unknown as DiaryService,
        route: { view: 'diary', period: 'day', date: '2026-09-29' },
        currentDate: DayDate.create('2026-09-29'),
        onNavigate: vi.fn(),
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('Загружаем дневник');
    expect(html).toContain('День');
    expect(html).toContain('Неделя');
    expect(html).toContain('Месяц');
  });

  it('renders four named 1–5 radiogroups and optional reflection questions', () => {
    const draft = createDiaryDraft(diaryPeriod('day', DayDate.create('2026-09-29')), new Date());
    const html = renderToStaticMarkup(
      createElement(DiaryDayView, {
        payload: draft.payload,
        status: 'saved',
        onChange: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(html.match(/role="radiogroup"/g)).toHaveLength(4);
    for (const label of ['Продуктивность', 'Энергия', 'Настроение', 'Общая оценка дня'])
      expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('Что я сделал сегодня, чтобы мир стал лучше?');
    expect(html).toContain('Что давало силы, а что забирало?');
    expect(html).toContain('disabled=""');
  });

  it('enables completion only after four independent ratings', () => {
    const draft = createDiaryDraft(diaryPeriod('day', DayDate.create('2026-09-29')), new Date());
    const html = renderToStaticMarkup(
      createElement(DiaryDayView, {
        payload: { ...draft.payload, productivity: 5, energy: 4, mood: 3, overall: 4 },
        status: 'saved',
        onChange: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(html).toMatch(/<button[^>]*class="planner-primary"[^>]*>Завершить день<\/button>/);
  });

  it('blocks ratings, reflections and completion while the entry is being completed', () => {
    const draft = createDiaryDraft(diaryPeriod('day', DayDate.create('2026-09-29')), new Date());
    const html = renderToStaticMarkup(
      createElement(DiaryDayView, {
        payload: { ...draft.payload, productivity: 5, energy: 4, mood: 3, overall: 4 },
        status: 'saving',
        disabled: true,
        onChange: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(html.match(/<fieldset[^>]*disabled=""/g)).toHaveLength(4);
    expect(html.match(/<textarea[^>]*disabled=""/g)).toHaveLength(4);
    expect(html).toMatch(
      /<button[^>]*class="planner-primary"[^>]*disabled=""[^>]*>Завершить день<\/button>/,
    );
  });
});
