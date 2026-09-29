import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  completeDiaryEntry,
  createDiaryDraft,
  DayDate,
  diaryPeriod,
  reviseDiaryEntry,
} from '../../../domain';
import type { DiaryRatingSummary } from '../../../application';
import { DiaryMonthView } from './DiaryMonthView';
import { DiaryWeekView } from './DiaryWeekView';

const summary: DiaryRatingSummary = {
  productivity: { value: 4.5, sampleCount: 2 },
  energy: { value: 3, sampleCount: 2 },
  mood: { value: 4, sampleCount: 2 },
  overall: { value: 4.25, sampleCount: 2 },
  completedDays: 2,
  totalDays: 7,
};

describe('diary period views', () => {
  it('shows weekly coverage, averages and planning facts without treating gaps as zeroes', () => {
    const draft = createDiaryDraft(diaryPeriod('week', DayDate.create('2026-09-21')), new Date());
    const html = renderToStaticMarkup(
      createElement(DiaryWeekView, {
        payload: draft.payload,
        summary,
        completedActions: 3,
        goalsWithRecords: 1,
        status: 'saved',
        onChange: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(html).toContain('<strong>2</strong> из 7 дней');
    expect(html).toContain('4,5');
    expect(html).toContain('Завершено действий: 3');
    expect(html).toContain('Целей с записями результата: 1');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('0 из 7');
  });

  it('allows completing a weekly reflection after one answer', () => {
    const draft = createDiaryDraft(diaryPeriod('week', DayDate.create('2026-09-21')), new Date());
    const html = renderToStaticMarkup(
      createElement(DiaryWeekView, {
        payload: { ...draft.payload, learned: 'Слушать внимательнее' },
        summary,
        completedActions: 0,
        goalsWithRecords: 0,
        status: 'saved',
        onChange: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(html).toMatch(/<button[^>]*class="planner-primary"[^>]*>Завершить неделю<\/button>/);
  });

  it('shows calendar-month coverage, week buckets and saved weekly excerpts only', () => {
    const draft = createDiaryDraft(diaryPeriod('month', DayDate.create('2026-09-01')), new Date());
    const reflectionDraft = createDiaryDraft(
      diaryPeriod('week', DayDate.create('2026-09-21')),
      new Date(),
    );
    const reflection = completeDiaryEntry(
      reviseDiaryEntry(
        reflectionDraft,
        { ...reflectionDraft.payload, memorableMoments: 'Разговор у реки' },
        new Date(),
      ),
      new Date(),
    );
    const html = renderToStaticMarkup(
      createElement(DiaryMonthView, {
        payload: draft.payload,
        summary: { ...summary, completedDays: 5, totalDays: 30 },
        weekBuckets: [
          {
            startDate: '2026-09-01',
            endDate: '2026-09-06',
            summary: { ...summary, completedDays: 2, totalDays: 6 },
          },
        ],
        weeklyReflections: [reflection],
        completedActions: 8,
        goalsWithRecords: 2,
        status: 'saved',
        onChange: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(html).toContain('<strong>5</strong> из 30 дней');
    expect(html).toContain('1–6 сентября');
    expect(html).toContain('Разговор у реки');
    expect(html).not.toContain('Причина');
    expect(html.indexOf('Сводка месяца')).toBeLessThan(html.indexOf('Итоги месяца'));
  });
});
