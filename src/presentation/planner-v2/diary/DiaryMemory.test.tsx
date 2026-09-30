import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDiaryDraft, DayDate, diaryPeriod } from '../../../domain';
import { DiaryDayView } from './DiaryDayView';

describe('Diary memory entry point', () => {
  it('offers only a nonempty answer and names the chosen field', () => {
    const draft = createDiaryDraft(diaryPeriod('day', DayDate.create('2026-09-29')), new Date());
    const html = renderToStaticMarkup(
      createElement(DiaryDayView, {
        payload: { ...draft.payload, worldBetter: 'Помог другу', note: '   ' },
        status: 'saved',
        onChange: vi.fn(),
        onComplete: vi.fn(),
        onMemory: vi.fn(),
      }),
    );
    expect(html).toContain('Сохранить в память: Что я сделал сегодня, чтобы мир стал лучше?');
    expect(html.match(/Сохранить в память:/g)).toHaveLength(1);
  });
  it('disables transfer while completion is running', () => {
    const draft = createDiaryDraft(diaryPeriod('day', DayDate.create('2026-09-29')), new Date());
    const html = renderToStaticMarkup(
      createElement(DiaryDayView, {
        payload: { ...draft.payload, worldBetter: 'Помог другу' },
        status: 'saving',
        disabled: true,
        onChange: vi.fn(),
        onComplete: vi.fn(),
        onMemory: vi.fn(),
      }),
    );
    expect(html).toMatch(/<button[^>]*aria-label="Сохранить в память:[^"]*"[^>]*disabled=""/);
  });
});
