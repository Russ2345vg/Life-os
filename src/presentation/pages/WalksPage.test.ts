import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, EntityId, WALK_INTENT, WALK_MODE, WALK_TYPE, Walk } from '../../domain';
import { WALK_STATISTICS_PERIOD, type WalkStatistics } from '../../application';
import { WalkSubmissionGuard } from '../walk/WalkSubmissionGuard';
import { formatStatisticsDuration } from '../walk/walkPresentation';
import {
  WalkActivePanel,
  WalkCenterPanel,
  WalkIntentSelector,
  WalkPreparationForm,
} from '../walk/WalkSessionFlow';
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
  it('shows the routine source and next step in preparation without another start action', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkPreparationForm, {
        intent: WALK_INTENT.free,
        isSaving: false,
        onBack: vi.fn(),
        onStart: vi.fn(),
        routineLaunchRequest: {
          source: {
            routineBlockId: EntityId.create('routine-walk'),
            occurrenceDate: DATE,
            effectiveDate: DATE,
          },
          sourceTitle: 'Прогулка после обеда',
          plannedTimeLabel: '14:00–14:30',
          nextStep: 'Чтение',
        },
      }),
    );
    expect(markup).toContain('Из распорядка');
    expect(markup).toContain('Прогулка после обеда');
    expect(markup).toContain('14:00–14:30');
    expect(markup).toContain('Далее: Чтение');
    expect(markup.match(/Начать прогулку/g)).toHaveLength(1);
  });

  it('offers an explicit abandon confirmation without promising outcome or Reentry', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-abandon-ui'),
      date: DATE,
      type: WALK_TYPE.mindful,
      now: new Date('2026-08-08T07:00:00Z'),
    }).start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T08:00:00Z'),
      reflectionQuestion: 'Что вокруг?',
    });
    const markup = renderToStaticMarkup(
      createElement(WalkActivePanel, {
        walk,
        now: new Date('2026-08-08T08:10:00Z'),
        isSaving: false,
        finishConfirmationOpen: false,
        abandonConfirmationOpen: true,
        onRequestAbandon: vi.fn(),
        onConfirmAbandon: vi.fn(),
        onPause: vi.fn(),
        onResume: vi.fn(),
        onRequestFinish: vi.fn(),
        onConfirmFinish: vi.fn(),
        onCancelFinish: vi.fn(),
        onAdvanceReflection: vi.fn(),
        onDisableReflectionGuidance: vi.fn(),
      }),
    );
    expect(markup).toContain('Прервать прогулку?');
    expect(markup).toContain('Итог и возвращение не будут созданы');
    expect(markup).not.toContain('Завершить прогулку?');
  });

  it('renders one dominant center action and three quick intent choices', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkCenterPanel, {
        hasActiveWalk: false,
        onBegin: vi.fn(),
        onQuickStart: vi.fn(),
      }),
    );

    expect(markup).toContain('>Прогулки</h1>');
    expect(markup).not.toContain('Прогулки начинаются с намерения');
    expect(markup).toContain('Выберите режим');
    expect(markup).toContain('Начать прогулку');
    expect(markup).toContain('Свободная');
    expect(markup).toContain('Восстановительная');
    expect(markup).toContain('Размышление');
    expect(markup.match(/data-walk-quick-intent=/g)).toHaveLength(3);
    expect(markup.match(/walk-session-primary-action/g)).toHaveLength(1);
  });

  it('offers exactly the three WALK-03 intents', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkIntentSelector, {
        selectedIntent: WALK_INTENT.free,
        onSelect: vi.fn(),
        onBack: vi.fn(),
        onContinue: vi.fn(),
      }),
    );

    expect(markup.match(/name="walk-intent"/g)).toHaveLength(3);
    expect(markup).toContain('Свободная прогулка');
    expect(markup).toContain('Восстановительная');
    expect(markup).toContain('Размышление');
    expect(markup).not.toContain('Физическая');
    expect(markup).not.toContain('Без телефона');
  });

  it('renders preparation with 20/30/40 minutes, an optional question and optional before-state', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkPreparationForm, {
        intent: WALK_INTENT.reflection,
        isSaving: false,
        onBack: vi.fn(),
        onStart: vi.fn(),
      }),
    );

    expect(markup.match(/name="walk-duration"/g)).toHaveLength(3);
    expect(markup).toContain('20 минут');
    expect(markup).toContain('30 минут');
    expect(markup).toContain('40 минут');
    expect(markup).toContain('Вопрос для размышления');
    expect(markup.match(/name="walk-reflection-template"/g)).toHaveLength(5);
    expect(markup).toMatch(/checked="" value="freeThought"/);
    expect(markup).toContain('Свободная мысль');
    expect(markup).toContain('Отметить состояние перед прогулкой');
    expect(markup.match(/type="range"/g)).toHaveLength(3);
    expect(markup).toContain('Энергия');
    expect(markup).toContain('Напряжение');
    expect(markup).toContain('Ясность');
  });

  it('keeps the custom reflection question exclusive to reflection intent', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkPreparationForm, {
        intent: WALK_INTENT.recovery,
        isSaving: false,
        onBack: vi.fn(),
        onStart: vi.fn(),
      }),
    );

    expect(markup).not.toContain('Вопрос для размышления');
    expect(markup).toContain('Отметить состояние перед прогулкой');
  });

  it('renders running and paused active states without a second start or outcome UI', () => {
    const running = Walk.create({
      id: EntityId.create('walk-walk03-active'),
      date: DATE,
      type: WALK_TYPE.restorative,
      intent: WALK_INTENT.recovery,
      beforeState: { energy: 3, tension: 8, clarity: 4 },
      now: new Date('2026-08-08T07:00:00.000Z'),
    }).start({
      mode: WALK_MODE.timer,
      startedAt: new Date('2026-08-08T08:00:00.000Z'),
      timerTargetMinutes: 30,
      reflectionQuestion: 'Что поможет отпустить напряжение?',
    });
    const paused = running.pause(new Date('2026-08-08T08:12:00.000Z'));
    const sharedProps = {
      now: new Date('2026-08-08T08:20:00.000Z'),
      isSaving: false,
      finishConfirmationOpen: false,
      onPause: vi.fn(),
      onResume: vi.fn(),
      onRequestFinish: vi.fn(),
      onConfirmFinish: vi.fn(),
      onCancelFinish: vi.fn(),
      onAdvanceReflection: vi.fn(),
      onDisableReflectionGuidance: vi.fn(),
    };

    const runningMarkup = renderToStaticMarkup(
      createElement(WalkActivePanel, { ...sharedProps, walk: running }),
    );
    const pausedMarkup = renderToStaticMarkup(
      createElement(WalkActivePanel, { ...sharedProps, walk: paused }),
    );

    expect(runningMarkup).toContain('Прогулка идёт');
    expect(runningMarkup).toContain('Восстановительная');
    expect(runningMarkup).toContain('Прошло 00:20:00');
    expect(runningMarkup).toContain('Что поможет отпустить напряжение?');
    expect(runningMarkup).toContain('Пауза');
    expect(runningMarkup).not.toContain('Продолжить');
    expect(pausedMarkup).toContain('Прогулка на паузе');
    expect(pausedMarkup).toContain('Прошло 00:12:00');
    expect(pausedMarkup).toContain('Продолжить');
    expect(pausedMarkup).not.toContain('Начать прогулку');
    expect(pausedMarkup).not.toMatch(/Итог|Фото|Что дала/);
  });

  it('renders elapsed active time after resume without counting the pause', () => {
    const resumed = Walk.create({
      id: EntityId.create('walk-resumed-elapsed'),
      date: DATE,
      type: WALK_TYPE.mindful,
      intent: WALK_INTENT.free,
      now: new Date('2026-08-08T07:00:00.000Z'),
    })
      .start({
        mode: WALK_MODE.timer,
        startedAt: new Date('2026-08-08T08:00:00.000Z'),
        timerTargetMinutes: 20,
        reflectionQuestion: 'Что вокруг хочется заметить?',
      })
      .pause(new Date('2026-08-08T08:05:00.000Z'))
      .resume(new Date('2026-08-08T08:08:00.000Z'));

    const markup = renderToStaticMarkup(
      createElement(WalkActivePanel, {
        walk: resumed,
        now: new Date('2026-08-08T08:10:00.000Z'),
        isSaving: false,
        finishConfirmationOpen: false,
        onPause: vi.fn(),
        onResume: vi.fn(),
        onRequestFinish: vi.fn(),
        onConfirmFinish: vi.fn(),
        onCancelFinish: vi.fn(),
        onAdvanceReflection: vi.fn(),
        onDisableReflectionGuidance: vi.fn(),
      }),
    );

    expect(markup).toContain('role="timer"');
    expect(markup).toContain('Прошло 00:07:00');
  });

  it('renders immediately after resume even when the previous UI clock tick is stale', () => {
    const resumed = Walk.create({
      id: EntityId.create('walk-resume-render-race'),
      date: DATE,
      type: WALK_TYPE.mindful,
      intent: WALK_INTENT.free,
      now: new Date('2026-08-08T07:00:00.000Z'),
    })
      .start({
        mode: WALK_MODE.timer,
        startedAt: new Date('2026-08-08T08:00:00.000Z'),
        timerTargetMinutes: 30,
        reflectionQuestion: 'Что вокруг хочется заметить?',
      })
      .pause(new Date('2026-08-08T08:12:00.000Z'))
      .resume(new Date('2026-08-08T08:20:00.000Z'));

    const markup = renderToStaticMarkup(
      createElement(WalkActivePanel, {
        walk: resumed,
        now: new Date('2026-08-08T08:19:59.900Z'),
        isSaving: false,
        finishConfirmationOpen: false,
        onPause: vi.fn(),
        onResume: vi.fn(),
        onRequestFinish: vi.fn(),
        onConfirmFinish: vi.fn(),
        onCancelFinish: vi.fn(),
        onAdvanceReflection: vi.fn(),
        onDisableReflectionGuidance: vi.fn(),
      }),
    );

    expect(markup).toContain('Прошло 00:12:00');
  });

  it('uses legacy WalkType presentation and no fake zero-minute target for a stopwatch walk', () => {
    const legacy = Walk.create({
      id: EntityId.create('walk-legacy-active-view'),
      date: DATE,
      type: WALK_TYPE.mindful,
      now: new Date('2026-08-08T07:00:00.000Z'),
    }).start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T08:00:00.000Z'),
      reflectionQuestion: 'Что сейчас важно заметить?',
    });
    const markup = renderToStaticMarkup(
      createElement(WalkActivePanel, {
        walk: legacy,
        now: new Date('2026-08-08T08:10:00.000Z'),
        isSaving: false,
        finishConfirmationOpen: false,
        onPause: vi.fn(),
        onResume: vi.fn(),
        onRequestFinish: vi.fn(),
        onConfirmFinish: vi.fn(),
        onCancelFinish: vi.fn(),
        onAdvanceReflection: vi.fn(),
        onDisableReflectionGuidance: vi.fn(),
      }),
    );

    expect(markup).toContain('Осознанная');
    expect(markup).toContain('Без таймера');
    expect(markup).not.toContain('0 минут');
  });

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
