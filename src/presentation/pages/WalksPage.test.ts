import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, EntityId, WALK_MODE, WALK_TYPE, Walk } from '../../domain';
import { WALK_STATISTICS_PERIOD, type WalkStatistics } from '../../application';
import { WalkSubmissionGuard } from '../walk/WalkSubmissionGuard';
import { formatStatisticsDuration } from '../walk/walkPresentation';
import {
  WalkCompletionForm,
  WalkList,
  WalkResultCard,
  WalkRunningPanel,
  WalkStatisticsPanel,
  WalkStartForm,
  WalkTypeForm,
} from './WalksPage';

const DATE = DayDate.create('2026-08-08');

describe('WalksPage stage 14.4 UI', () => {
  it('renders compact statistics, every type and all three period controls', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkStatisticsPanel, {
        state: { status: 'ready', value: statistics() },
        period: WALK_STATISTICS_PERIOD.last7Days,
        onPeriodChange: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    for (const text of [
      'Сводка прогулок',
      '7 дней',
      '30 дней',
      'Всё время',
      'Прогулок',
      'Всего времени',
      'Средняя',
      '2 ч 45 мин',
      '33 мин',
      'Восстановительные',
      'Осознанные',
      'Размышление',
      'Физические',
      'Без телефона',
      'Прервано',
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup.match(/aria-pressed=/g)).toHaveLength(3);
    expect(markup).not.toContain('<table');
  });

  it('renders the empty state without a meaningless average', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkStatisticsPanel, {
        state: {
          status: 'ready',
          value: statistics({
            completedCount: 0,
            totalDurationMilliseconds: 0,
            averageDurationMilliseconds: null,
          }),
        },
        period: WALK_STATISTICS_PERIOD.last30Days,
        onPeriodChange: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain('Пока нет завершённых прогулок за этот период.');
    expect(markup).toContain('<dd>0 мин</dd>');
    expect(markup).toContain('<dd>—</dd>');
    expect(markup).not.toContain('walk-statistics-types');
  });

  it('formats statistics duration without milliseconds', () => {
    expect(formatStatisticsDuration(45 * 60 * 1000)).toBe('45 мин');
    expect(formatStatisticsDuration(80 * 60 * 1000)).toBe('1 ч 20 мин');
    expect(formatStatisticsDuration(185 * 60 * 1000)).toBe('3 ч 05 мин');
  });

  it('shows all five neutral type choices and no later-stage fields', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkTypeForm, {
        selectedType: WALK_TYPE.restorative,
        isSaving: false,
        onSelectType: vi.fn(),
        onCancel: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    for (const text of [
      'Восстановительная',
      'снизить нагрузку и переключиться.',
      'Осознанная',
      'обратить внимание на окружающее и текущее состояние.',
      'Размышление',
      'спокойно обдумать один вопрос.',
      'Физическая',
      'прогулка с акцентом на движение.',
      'Без телефона',
      'прогулка без использования телефона.',
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup.match(/type="radio"/g)).toHaveLength(5);
    expect(markup).not.toMatch(
      /startedAt|endedAt|duration|timer|stopwatch|question|notes|photos|result/,
    );
  });

  it('renders a planned walk with the canonical start control', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-mobile'),
      date: DATE,
      type: WALK_TYPE.phoneFree,
      now: new Date('2026-08-08T08:00:00.000Z'),
    });
    const markup = renderToStaticMarkup(
      createElement(WalkList, {
        walks: [walk],
        currentDate: DATE,
        selectedDate: DATE,
        deletingId: null,
        onDelete: vi.fn(),
        onStart: vi.fn(),
      }),
    );

    expect(markup).toContain('walk-list');
    expect(markup).toContain('walk-card');
    expect(markup).toContain('Без телефона');
    expect(markup).toContain('Удалить');
    expect(markup).toContain('Начать прогулку');
    expect(markup).not.toContain('<table');
  });

  it('offers stopwatch, timer, presets and a custom duration', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-start-form'),
      date: DATE,
      type: WALK_TYPE.restorative,
      now: new Date('2026-08-08T07:00:00.000Z'),
    });
    const markup = renderToStaticMarkup(
      createElement(WalkStartForm, {
        walk,
        isSaving: false,
        onCancel: vi.fn(),
        onStart: vi.fn(),
      }),
    );

    expect(markup).toContain('Секундомер');
    expect(markup).toContain('Таймер');
    expect(markup).toContain('Начать прогулку');
  });

  it('shows a running timer, question and startedAt without a completion button', () => {
    const running = Walk.create({
      id: EntityId.create('walk-running'),
      date: DATE,
      type: WALK_TYPE.reflection,
      now: new Date('2026-08-08T07:00:00.000Z'),
    }).start({
      mode: WALK_MODE.timer,
      startedAt: new Date('2026-08-08T08:00:00.000Z'),
      timerTargetMinutes: 20,
      reflectionQuestion: 'Что сейчас хочется понять яснее?',
    });
    const markup = renderToStaticMarkup(
      createElement(WalkRunningPanel, {
        walk: running,
        now: new Date('2026-08-08T08:02:34.000Z'),
      }),
    );

    expect(markup).toContain('Идёт');
    expect(markup).toContain('осталось 17:26');
    expect(markup).toContain('Что сейчас хочется понять яснее?');
    expect(markup).toContain('Начало:');
    expect(markup).not.toMatch(/Завершить|Итог|Фото/);
  });

  it('shows timer expiry without completing the walk', () => {
    const running = Walk.create({
      id: EntityId.create('walk-expired'),
      date: DATE,
      type: WALK_TYPE.physical,
      now: new Date('2026-08-08T07:00:00.000Z'),
    }).start({
      mode: WALK_MODE.timer,
      startedAt: new Date('2026-08-08T08:00:00.000Z'),
      timerTargetMinutes: 10,
      reflectionQuestion: 'Что стоит заметить?',
    });
    const markup = renderToStaticMarkup(
      createElement(WalkRunningPanel, {
        walk: running,
        now: new Date('2026-08-08T08:20:00.000Z'),
      }),
    );

    expect(markup).toContain('осталось 00:00');
    expect(markup).toContain('Время прогулки истекло');
  });

  it('blocks a fast double click until the first create finishes', () => {
    const guard = new WalkSubmissionGuard();
    expect(guard.tryAcquire()).toBe(true);
    expect(guard.tryAcquire()).toBe(false);
    guard.release();
    expect(guard.tryAcquire()).toBe(true);
  });

  it('shows explicit complete and abandon actions while keeping timer expiry manual', () => {
    const running = createRunningWalk('running-actions');
    const markup = renderToStaticMarkup(
      createElement(WalkRunningPanel, {
        walk: running,
        now: new Date('2026-08-08T08:20:00.000Z'),
        onComplete: vi.fn(),
        onAbandon: vi.fn(),
      }),
    );

    expect(markup).toContain('осталось 00:00');
    expect(markup).toContain('Завершить прогулку');
    expect(markup).toContain('Прервать прогулку');
    expect(running.status).toBe('running');
  });

  it('renders a compact optional result and one-image completion form', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkCompletionForm, {
        walk: createRunningWalk('completion-form'),
        isSaving: false,
        onCancel: vi.fn(),
        onComplete: vi.fn(),
      }),
    );

    expect(markup).toContain('Что дала эта прогулка?');
    expect(markup).toContain('Фото (необязательно)');
    expect(markup.match(/type="file"/g)).toHaveLength(1);
    expect(markup).toContain('accept="image/*"');
    expect(markup).toContain('maxLength="1000"');
  });

  it('renders the completed result card without a live timer', () => {
    const completed = createRunningWalk('result-card').complete({
      endedAt: new Date('2026-08-08T08:30:00.000Z'),
      result: 'Стало спокойнее.',
      photo: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', sizeBytes: 3 },
    });
    const markup = renderToStaticMarkup(
      createElement(WalkResultCard, {
        walk: completed,
        isSaving: false,
        onPhotoChange: vi.fn(),
        onError: vi.fn(),
      }),
    );

    for (const text of [
      'Завершена',
      'Дата',
      'Начало',
      'Завершение',
      'Фактическая длительность',
      'Режим',
      'Вопрос',
      'Стало спокойнее.',
      'Заменить фото',
      'Удалить фото',
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain('walk-running-time');
    expect(markup).toContain('30 мин');
  });
});

function createRunningWalk(id: string): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type: WALK_TYPE.reflection,
    now: new Date('2026-08-08T07:00:00.000Z'),
  }).start({
    mode: WALK_MODE.timer,
    startedAt: new Date('2026-08-08T08:00:00.000Z'),
    timerTargetMinutes: 10,
    reflectionQuestion: 'Что сейчас важно заметить?',
  });
}

function statistics(overrides: Partial<WalkStatistics> = {}): WalkStatistics {
  return {
    period: WALK_STATISTICS_PERIOD.last7Days,
    completedCount: 5,
    abandonedCount: 1,
    totalDurationMilliseconds: 165 * 60 * 1000,
    averageDurationMilliseconds: 33 * 60 * 1000,
    completedByType: {
      restorative: 2,
      mindful: 1,
      reflection: 1,
      physical: 1,
      phoneFree: 0,
    },
    ...overrides,
  };
}
