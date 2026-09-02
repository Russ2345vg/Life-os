import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MORNING_COLD_SHOWER_PRESENTATION_STATUS,
  MORNING_CENTER_STAGE_ID,
  MORNING_CENTER_STAGE_STATUS,
  MORNING_MIRROR_PRESENTATION_STATUS,
  MORNING_WATER_PRESENTATION_STATUS,
  type MorningCenterOverview,
} from '../../application';
import {
  DayDate,
  MORNING_CYCLE_STATE,
  MORNING_SHORTENED_ACTION,
  MORNING_SHORTENED_MODE_STATE,
} from '../../domain';
import { ROUTINE_MORNING_VIEW } from '../routine/RoutineNavigation';
import {
  MorningCenterLoadErrorView,
  MorningCenterView,
  finishMorningPhysicalExecutionView,
  mirrorSuccessDelay,
  openMorningPhysicalExecution,
  resolveMirrorViewState,
} from './MorningCenterPage';
import { calculateMorningElapsedMinutes } from './MorningCenterTime';

const DATE = DayDate.create('2026-08-27');
const NOOP = () => undefined;

describe('MorningCenterView', () => {
  it('показывает подготовленное утро и ведёт на отдельный итог', () => {
    const overview: MorningCenterOverview = {
      ...activeOverview(),
      cycleState: MORNING_CYCLE_STATE.readyToWork,
      canUseQuickStart: false,
      canShorten: false,
      currentStageId: MORNING_CENTER_STAGE_ID.workBlock,
      stages: [
        stage(MORNING_CENTER_STAGE_ID.quickStart, MORNING_CENTER_STAGE_STATUS.completed, 5),
        stage(
          MORNING_CENTER_STAGE_ID.physicalActivation,
          MORNING_CENTER_STAGE_STATUS.completed,
          10,
        ),
        stage(MORNING_CENTER_STAGE_ID.mirror, MORNING_CENTER_STAGE_STATUS.optional, 5),
        stage(MORNING_CENTER_STAGE_ID.mainAction, MORNING_CENTER_STAGE_STATUS.completed, 5),
        stage(MORNING_CENTER_STAGE_ID.workBlock, MORNING_CENTER_STAGE_STATUS.current, 2),
      ],
    };

    const markup = renderCenter(overview);

    expect(markup).toContain('Утро подготовлено');
    expect(markup).toContain('Открыть итог');
    expect(markup).toContain('Необязательный этап');
    expect(markup).not.toContain('Настрой завершён');
  });

  it('показывает центр с пятью этапами, общим прогрессом и ориентиром времени', () => {
    const markup = renderCenter(notStartedOverview());

    expect(markup).not.toContain('>Утренний центр<');
    expect(markup).toContain('0%');
    expect(markup).toContain('≈ 50 мин');
    expect(markup).toContain('Начать утро');
    for (const title of [
      'Быстрый старт',
      'Физическая активация',
      'Настрой перед зеркалом',
      'Главное действие',
      'Рабочий блок',
    ]) {
      expect(markup).toContain(title);
    }
    expect(markup).toContain('осталось ориентировочно');
    expect(markup).not.toContain('MOR-02');
    expect(markup.match(/data-morning-stage=/g)).toHaveLength(5);
    expect(markup.match(/>Дальше</g)).toHaveLength(1);
    expect(markup).toContain('morning-center-progress-ring');
  });

  it('сохраняет команду сокращения видимой, но недоступной до старта цикла', () => {
    const markup = renderCenter(notStartedOverview());

    expect(markup).toContain('Сократить утро');
    expect(markup).toMatch(/class="morning-shorten-button"[^>]*disabled=""/);
  });

  it('показывает сохранённое состояние под Быстрым стартом без второго визуального центра', () => {
    const markup = renderCenter({
      ...notStartedOverview(),
      startState: {
        energy: 6,
        clarity: 7,
        mood: 'спокойный',
        recordedAt: new Date('2026-08-27T07:00:00+09:00'),
      },
    });

    expect(markup).toContain('aria-label="Состояние перед стартом"');
    expect(markup).toContain('Состояние перед стартом');
    expect(markup).toContain('Энергия');
    expect(markup).toContain('6/10');
    expect(markup).toContain('Ясность');
    expect(markup).toContain('7/10');
    expect(markup).toContain('Настрой:');
    expect(markup).toContain('спокойный');
    expect(markup).toContain('Отметить состояние →');
  });

  it('не подставляет фиктивные оценки, когда состояние ещё не отмечено', () => {
    const markup = renderCenter(notStartedOverview());

    expect(markup).toContain('—/10');
    expect(markup).toContain('Настрой:');
    expect(markup).toContain('не отмечен');
  });

  it('располагает существующую навигацию по дате после прогресса и перед этапами', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningCenterView, {
        ...handlers,
        overview: notStartedOverview(),
        view: 'center',
        elapsedMinutes: 0,
        pendingAction: null,
        mutationError: null,
        dateNavigation: createElement('div', { 'data-date-navigation': true }, 'Дата'),
      }),
    );

    expect(markup.indexOf('morning-center-hero')).toBeLessThan(
      markup.indexOf('data-date-navigation'),
    );
    expect(markup.indexOf('data-date-navigation')).toBeLessThan(
      markup.indexOf('morning-stage-flow'),
    );
  });

  it('завершает центр спокойным утренним ориентиром после этапов', () => {
    const markup = renderCenter(notStartedOverview());

    expect(markup).toContain('aria-label="Утренний ориентир"');
    expect(markup).toContain('Утро задаёт тон всему дню');
    expect(markup.indexOf('morning-stage-flow')).toBeLessThan(
      markup.indexOf('aria-label="Утренний ориентир"'),
    );
  });

  it('различает завершённый, текущий и будущие этапы и предлагает сокращение', () => {
    const overview = completedQuickStartOverview();

    const markup = renderCenter(overview);

    expect(markup).toContain('20%');
    expect(markup).toContain('≈ 45 мин');
    expect(markup).toContain('Сократить утро');
    expect(markup).toContain('data-morning-stage-status="completed"');
    expect(markup).toContain('data-morning-stage-status="current"');
    expect(markup).toContain('data-morning-stage-status="upcoming"');
    expect(markup).toContain('Текущий этап');
    expect(markup).toContain('✓ Вода');
    expect(markup).toContain('✓ Холодный душ');
    expect(markup).not.toContain('MOR-02');
    expect(markup).toContain('Упражнения не выбраны');
    expect(markup).toContain('id="morning-physical-trigger"');
  });

  it('закрепляет семантические тона этапов и нейтральный тон состояния перед стартом', () => {
    const markup = renderCenter(completedQuickStartOverview());

    expect(markup).toMatch(
      /data-morning-stage="quick-start"[^>]*data-morning-stage-tone="completed"/,
    );
    expect(markup).toMatch(
      /data-morning-stage="physical-activation"[^>]*data-morning-stage-tone="current"/,
    );
    expect(markup).toMatch(/data-morning-stage="mirror"[^>]*data-morning-stage-tone="neutral"/);
    expect(markup).toContain('data-morning-start-state-tone="neutral"');
  });

  it('показывает сохранённую сводку физического плана и открывает её в read-only', () => {
    const overview = {
      ...completedQuickStartOverview(),
      mutable: false,
      physicalPlan: { selectedCount: 2, totalSets: 6, estimatedMinutes: 12 },
      stages: completedQuickStartOverview().stages.map((stage) =>
        stage.id === MORNING_CENTER_STAGE_ID.physicalActivation
          ? { ...stage, estimatedMinutes: 12 }
          : stage,
      ),
    } satisfies MorningCenterOverview;

    const markup = renderCenter(overview);

    expect(markup).toContain('2 упражнения · 6 подходов');
    expect(markup).toContain('≈ 12 мин');
    expect(markup).toContain('id="morning-physical-trigger"');
    expect(markup).toContain('Просмотреть');
  });

  it('показывает активное подробное выполнение и явный Continue', () => {
    const overview = {
      ...completedQuickStartOverview(),
      physicalPlan: { selectedCount: 2, totalSets: 6, estimatedMinutes: 12 },
      physicalExecution: {
        statusText: 'Выполняется · 2 из 6 подходов',
        resolvedSets: 2,
        totalSets: 6,
        canContinue: true,
      },
    } satisfies MorningCenterOverview;

    const markup = renderCenter(overview);

    expect(markup).toContain('Выполняется · 2 из 6 подходов');
    expect(markup).toContain('>Продолжить</button>');
  });

  it('открывает завершённые подробные результаты, но не принимает legacy plan за детали', () => {
    const historical = {
      ...completedQuickStartOverview(),
      mutable: false,
      physicalPlan: { selectedCount: 2, totalSets: 4, estimatedMinutes: 8 },
      physicalExecution: {
        statusText: null,
        resolvedSets: 4,
        totalSets: 4,
        canContinue: false,
      },
      stages: completedQuickStartOverview().stages.map((stage) =>
        stage.id === MORNING_CENTER_STAGE_ID.physicalActivation
          ? { ...stage, status: MORNING_CENTER_STAGE_STATUS.completed }
          : stage,
      ),
    } satisfies MorningCenterOverview;

    expect(renderCenter(historical)).toContain('>Результаты</button>');
    expect(
      renderCenter({
        ...historical,
        physicalExecution: {
          statusText: null,
          resolvedSets: 0,
          totalSets: 4,
          canContinue: false,
        },
      }),
    ).not.toContain('>Результаты</button>');
  });

  it('открывает текущий Mirror и завершённый Mirror только для просмотра', () => {
    const current = mirrorCurrentOverview();
    const currentMarkup = renderCenter(current);
    expect(currentMarkup).toContain('id="morning-mirror-trigger"');
    expect(currentMarkup).toContain('>Открыть</button>');

    const completedAt = new Date('2026-08-27T07:24:00+09:00');
    const completed = {
      ...current,
      overallProgressPercent: 60,
      remainingMinutes: 30,
      currentStageId: MORNING_CENTER_STAGE_ID.mainAction,
      stages: [
        stage(MORNING_CENTER_STAGE_ID.quickStart, MORNING_CENTER_STAGE_STATUS.completed, 5),
        stage(
          MORNING_CENTER_STAGE_ID.physicalActivation,
          MORNING_CENTER_STAGE_STATUS.completed,
          10,
        ),
        stage(MORNING_CENTER_STAGE_ID.mirror, MORNING_CENTER_STAGE_STATUS.completed, 5),
        stage(MORNING_CENTER_STAGE_ID.mainAction, MORNING_CENTER_STAGE_STATUS.current, 5),
        stage(MORNING_CENTER_STAGE_ID.workBlock, MORNING_CENTER_STAGE_STATUS.upcoming, 25),
      ],
      mirror: {
        status: MORNING_MIRROR_PRESENTATION_STATUS.completed,
        completedAt,
        canOpen: true,
        canComplete: false,
      },
    } satisfies MorningCenterOverview;

    const completedMarkup = renderCenter(completed);
    expect(completedMarkup).toContain('Настрой завершён · 07:24');
    expect(completedMarkup).toContain('>Просмотреть</button>');
    expect(completedMarkup).toContain('data-morning-stage="main-action"');
    expect(completedMarkup).not.toContain('Начать главное действие');
  });

  it('opens the current main-action check as an in-page detail view', () => {
    const overview = {
      ...mirrorCurrentOverview(),
      currentStageId: MORNING_CENTER_STAGE_ID.mainAction,
      stages: mirrorCurrentOverview().stages.map((item) =>
        item.id === MORNING_CENTER_STAGE_ID.mirror
          ? { ...item, status: MORNING_CENTER_STAGE_STATUS.completed }
          : item.id === MORNING_CENTER_STAGE_ID.mainAction
            ? { ...item, status: MORNING_CENTER_STAGE_STATUS.current }
            : item,
      ),
      mainAction: {
        ...mirrorCurrentOverview().mainAction,
        decisionTitle: 'Запустить MOR-05',
        expectedResult: 'Сценарий работает',
      },
    } satisfies MorningCenterOverview;

    expect(renderCenter(overview)).toContain('id="morning-main-action-trigger"');
    const detail = renderToStaticMarkup(
      createElement(MorningCenterView, {
        ...handlers,
        overview,
        view: 'mainAction',
        elapsedMinutes: 0,
        pendingAction: null,
        mutationError: null,
        selectedMainActionCandidateId: null,
        onMainActionCandidateChange: NOOP,
        onSelectMainActionCandidate: NOOP,
        onScheduleMainAction: NOOP,
      }),
    );
    expect(detail).toContain('Проверь четыре опоры');
    expect(detail).toContain('Запустить MOR-05');
  });

  it('не открывает незавершённый исторический Mirror', () => {
    const overview = {
      ...mirrorCurrentOverview(),
      mutable: false,
      mirror: {
        status: MORNING_MIRROR_PRESENTATION_STATUS.pending,
        completedAt: null,
        canOpen: false,
        canComplete: false,
      },
    } satisfies MorningCenterOverview;

    expect(renderCenter(overview)).not.toContain('id="morning-mirror-trigger"');
  });

  it('разрешает Mirror feedback без задержки при reduced motion', () => {
    expect(mirrorSuccessDelay(false)).toBe(600);
    expect(mirrorSuccessDelay(true)).toBe(0);
  });

  it('выбирает Mirror view state из authoritative и transient state', () => {
    const current = mirrorCurrentOverview();
    expect(resolveMirrorViewState(current, null, null, false)).toBe('current');
    expect(resolveMirrorViewState(current, 'mirror', null, false)).toBe('pending');
    expect(resolveMirrorViewState(current, null, 'storage', false)).toBe('error');
    expect(resolveMirrorViewState(current, 'mirror', 'storage', true)).toBe('success');
    expect(
      resolveMirrorViewState(
        {
          ...current,
          mirror: {
            status: MORNING_MIRROR_PRESENTATION_STATUS.completed,
            completedAt: new Date('2026-08-27T07:24:00+09:00'),
            canOpen: true,
            canComplete: false,
          },
        },
        null,
        null,
        false,
      ),
    ).toBe('readonly');
  });

  it('запрашивает route-owned execution view через callback', () => {
    const requested: Array<string | null> = [];

    openMorningPhysicalExecution((view) => requested.push(view));

    expect(requested).toEqual([ROUTINE_MORNING_VIEW.physicalExecution]);
  });

  it('возвращается к центру после authoritative reload завершённого этапа', async () => {
    const events: string[] = [];

    await finishMorningPhysicalExecutionView(
      async () => events.push('reload-center'),
      (view) => events.push(view === null ? 'clear-route' : String(view)),
    );

    expect(events).toEqual(['reload-center', 'clear-route']);
  });

  it('показывает сохранённый сокращённый режим без повторной команды', () => {
    const overview = {
      ...activeOverview(),
      shortenedMode: true,
      canShorten: false,
      canRevertShortened: true,
      shortenedModeState: MORNING_SHORTENED_MODE_STATE.shortenedActive,
      shortenedConfiguration: {
        coldShower: MORNING_SHORTENED_ACTION.skip,
        physical: MORNING_SHORTENED_ACTION.shorten,
        mirror: MORNING_SHORTENED_ACTION.keep,
      },
      remainingMinutes: 18,
      stages: activeOverview().stages.map((stage, index) => ({
        ...stage,
        estimatedMinutes: [5, 5, 5, 5, 2][index]!,
        scenarioStatus: index === 1 ? 'shortened' : stage.scenarioStatus,
      })),
    } satisfies MorningCenterOverview;

    const markup = renderCenter(overview);

    expect(markup).toContain('Сокращённый режим');
    expect(markup).toContain('≈ 18 мин');
    expect(markup).toContain('Вернуться к обычному режиму');
    expect(markup).not.toContain('>Сократить утро<');
  });

  it('требует явно закрыть прошлый запуск до нового старта', () => {
    const overview = {
      ...notStartedOverview(),
      canStart: false,
      canAbandonPrevious: true,
      previousUnfinished: {
        date: DayDate.create('2026-08-26'),
        startedAt: new Date('2026-08-26T07:00:00+09:00'),
      },
    } satisfies MorningCenterOverview;

    const markup = renderCenter(overview);

    expect(markup).toContain('Незавершённое утро за 26.08.2026');
    expect(markup).toContain('Закрыть прошлый запуск');
    expect(markup).not.toContain('>Начать утро<');
  });

  it('показывает в Quick Start текущую воду и будущий холодный душ', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningCenterView, {
        ...handlers,
        overview: activeOverview(),
        view: 'quickStart',
        elapsedMinutes: 5,
        pendingAction: null,
        mutationError: null,
      }),
    );

    expect(markup).toContain('Вода и холодный душ — быстрый переход от сна к активности.');
    expect(markup).toContain('aria-label="Шаги быстрого старта"');
    expect(markup).toContain('data-quick-start-step-status="current"');
    expect(markup).toContain('data-quick-start-step-status="future"');
    expect(markup).toContain('Стакан воды');
    expect(markup).toContain('≈ 1 мин');
    expect(markup).toContain('Восстановите воду после сна перед следующим этапом.');
    expect(markup).toContain('Выпил воду');
    expect(markup).toContain('Следующий шаг');
    expect(markup).not.toContain('Не выполнено');
    expect(markup).not.toContain('Холодный душ выполнен');
    expect(markup).not.toContain('Пропустить сегодня');
    expect(markup).toContain('morning-action-card-current');
    expect(markup).toContain('morning-action-card-upcoming');
    expect(markup.match(/class="primary-button/g)).toHaveLength(1);
    expect(markup).toContain('<svg');
    expect(markup).not.toContain('💧');
    expect(markup).not.toContain('🚿');
    expect(markup).not.toContain('Пропустить этап');
  });

  it('после воды делает её завершённой, а холодный душ текущим шагом', () => {
    const overview = {
      ...activeOverview(),
      quickStart: {
        water: MORNING_WATER_PRESENTATION_STATUS.completed,
        coldShower: MORNING_COLD_SHOWER_PRESENTATION_STATUS.pending,
        resolvedCount: 1,
        total: 2,
        completed: false,
      },
    } satisfies MorningCenterOverview;

    const markup = renderToStaticMarkup(
      createElement(MorningCenterView, {
        ...handlers,
        overview,
        view: 'quickStart',
        elapsedMinutes: 3,
        pendingAction: null,
        mutationError: null,
      }),
    );

    expect(markup).toContain('morning-action-card-completed');
    expect(markup).toContain('morning-action-card-compact');
    expect(markup).toContain('data-quick-start-step-status="completed"');
    expect(markup).toContain('data-quick-start-step-status="current"');
    expect(markup).toContain('250 мл');
    expect(markup).toContain('Выполнено');
    expect(markup).toContain('morning-action-card-current');
    expect(markup).toContain('≈ 3 мин');
    expect(markup).toContain('Холодный душ выполнен');
    expect(markup).toContain('Пропустить сегодня');
    expect(markup.match(/class="primary-button/g)).toHaveLength(1);
  });

  it('отмечает shower skip как завершённый Quick Start', () => {
    const overview = {
      ...activeOverview(),
      quickStart: {
        water: MORNING_WATER_PRESENTATION_STATUS.completed,
        coldShower: MORNING_COLD_SHOWER_PRESENTATION_STATUS.skipped,
        resolvedCount: 2,
        total: 2,
        completed: true,
      },
    } satisfies MorningCenterOverview;

    const markup = renderToStaticMarkup(
      createElement(MorningCenterView, {
        ...handlers,
        overview,
        view: 'quickStart',
        elapsedMinutes: 7,
        pendingAction: null,
        mutationError: null,
      }),
    );

    expect(markup).toContain('Пропущен сегодня');
    expect(markup).toContain('morning-action-card-skipped');
    expect(markup).toContain('data-quick-start-step-status="completed"');
    expect(markup).toContain('data-quick-start-step-status="skipped"');
    expect(markup).toContain('✓ Быстрый старт завершён');
    expect(markup).toContain('Следующий этап — физическая активность');
    expect(markup).toContain('К обзору утра');
    expect(markup).not.toContain('Перейти к следующему этапу');
  });

  it('не показывает команды для исторической даты', () => {
    const overview = {
      ...activeOverview(),
      mutable: false,
      canUseQuickStart: false,
    } satisfies MorningCenterOverview;

    const markup = renderToStaticMarkup(
      createElement(MorningCenterView, {
        ...handlers,
        overview,
        view: 'quickStart',
        elapsedMinutes: 10,
        pendingAction: null,
        mutationError: null,
      }),
    );

    expect(markup).toContain('Режим просмотра');
    expect(markup).not.toContain('Выпил 250 мл воды');
    expect(markup).not.toContain('Пропустить душ сегодня');
  });

  it('оставляет Quick Start доступным для просмотра исторических фактов', () => {
    const overview = {
      ...activeOverview(),
      mutable: false,
      canUseQuickStart: false,
    } satisfies MorningCenterOverview;

    const markup = renderCenter(overview);

    expect(markup).toContain('id="morning-quick-start-trigger"');
    expect(markup).toContain('Просмотреть');
  });

  it('блокирует повторные действия и объявляет mutation error', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningCenterView, {
        ...handlers,
        overview: activeOverview(),
        view: 'quickStart',
        elapsedMinutes: 5,
        pendingAction: 'water',
        mutationError: 'Не удалось сохранить воду.',
      }),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Не удалось сохранить воду.');
    expect(markup).toContain('class="morning-back-button" type="button" disabled=""');
  });

  it('показывает ошибку загрузки с явным retry', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningCenterLoadErrorView, {
        message: 'Хранилище недоступно.',
        onRetry: NOOP,
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Хранилище недоступно.');
    expect(markup).toContain('Повторить загрузку');
  });

  it('замораживает elapsed time на finishedAt закрытого цикла', () => {
    const overview = {
      ...activeOverview(),
      finishedAt: new Date('2026-08-27T07:12:00+09:00'),
    } satisfies MorningCenterOverview;

    expect(calculateMorningElapsedMinutes(overview, new Date('2026-08-27T12:00:00+09:00'))).toBe(
      12,
    );
  });
});

const handlers = {
  onStart: NOOP,
  onOpenQuickStart: NOOP,
  onOpenPhysicalActivation: NOOP,
  onOpenMirror: NOOP,
  onOpenMainAction: NOOP,
  onContinuePhysicalExecution: NOOP,
  onOpenCompletion: NOOP,
  onBackToCenter: NOOP,
  onAdvanceFromQuickStart: NOOP,
  onCompleteWater: NOOP,
  onCompleteColdShower: NOOP,
  onSkipColdShower: NOOP,
  onShorten: NOOP,
  onRevertShortened: NOOP,
  onAbandonPrevious: NOOP,
  onRecordStartState: async () => true,
};

function renderCenter(overview: MorningCenterOverview): string {
  return renderToStaticMarkup(
    createElement(MorningCenterView, {
      ...handlers,
      overview,
      view: 'center',
      elapsedMinutes: 0,
      pendingAction: null,
      mutationError: null,
    }),
  );
}

function notStartedOverview(): MorningCenterOverview {
  return {
    date: DATE,
    mutable: true,
    cycleState: null,
    startedAt: null,
    finishedAt: null,
    canStart: true,
    canUseQuickStart: false,
    canShorten: false,
    canRevertShortened: false,
    canAbandonPrevious: false,
    canRecordStartState: true,
    shortenedMode: false,
    shortenedModeState: null,
    shortenedConfiguration: null,
    overallProgressPercent: 0,
    remainingMinutes: 50,
    currentStageId: MORNING_CENTER_STAGE_ID.quickStart,
    previousUnfinished: null,
    startState: null,
    stages: [
      stage(MORNING_CENTER_STAGE_ID.quickStart, MORNING_CENTER_STAGE_STATUS.current, 5),
      stage(MORNING_CENTER_STAGE_ID.physicalActivation, MORNING_CENTER_STAGE_STATUS.upcoming, 10),
      stage(MORNING_CENTER_STAGE_ID.mirror, MORNING_CENTER_STAGE_STATUS.upcoming, 5),
      stage(MORNING_CENTER_STAGE_ID.mainAction, MORNING_CENTER_STAGE_STATUS.upcoming, 5),
      stage(MORNING_CENTER_STAGE_ID.workBlock, MORNING_CENTER_STAGE_STATUS.upcoming, 25),
    ],
    quickStart: {
      water: MORNING_WATER_PRESENTATION_STATUS.pending,
      coldShower: MORNING_COLD_SHOWER_PRESENTATION_STATUS.pending,
      resolvedCount: 0,
      total: 2,
      completed: false,
    },
    physicalPlan: { selectedCount: 0, totalSets: 0, estimatedMinutes: 0 },
    physicalExecution: {
      statusText: null,
      resolvedSets: 0,
      totalSets: 0,
      canContinue: false,
    },
    mirror: {
      status: MORNING_MIRROR_PRESENTATION_STATUS.pending,
      completedAt: null,
      canOpen: false,
      canComplete: false,
    },
    mainAction: {
      decisionId: null,
      decisionTitle: null,
      expectedResult: null,
      firstStepId: null,
      firstStepTitle: null,
      scheduledTime: null,
      completed: false,
      ready: false,
      candidates: [],
    },
  };
}

function activeOverview(): MorningCenterOverview {
  return {
    ...notStartedOverview(),
    cycleState: MORNING_CYCLE_STATE.inProgress,
    startedAt: new Date('2026-08-27T07:00:00+09:00'),
    canStart: false,
    canUseQuickStart: true,
    canShorten: true,
  };
}

function completedQuickStartOverview(): MorningCenterOverview {
  return {
    ...activeOverview(),
    overallProgressPercent: 20,
    remainingMinutes: 45,
    currentStageId: MORNING_CENTER_STAGE_ID.physicalActivation,
    stages: [
      stage(MORNING_CENTER_STAGE_ID.quickStart, MORNING_CENTER_STAGE_STATUS.completed, 5),
      stage(MORNING_CENTER_STAGE_ID.physicalActivation, MORNING_CENTER_STAGE_STATUS.current, 10),
      stage(MORNING_CENTER_STAGE_ID.mirror, MORNING_CENTER_STAGE_STATUS.upcoming, 5),
      stage(MORNING_CENTER_STAGE_ID.mainAction, MORNING_CENTER_STAGE_STATUS.upcoming, 5),
      stage(MORNING_CENTER_STAGE_ID.workBlock, MORNING_CENTER_STAGE_STATUS.upcoming, 25),
    ],
    quickStart: {
      water: MORNING_WATER_PRESENTATION_STATUS.completed,
      coldShower: MORNING_COLD_SHOWER_PRESENTATION_STATUS.completed,
      resolvedCount: 2,
      total: 2,
      completed: true,
    },
  };
}

function mirrorCurrentOverview(): MorningCenterOverview {
  return {
    ...completedQuickStartOverview(),
    overallProgressPercent: 40,
    remainingMinutes: 35,
    currentStageId: MORNING_CENTER_STAGE_ID.mirror,
    stages: [
      stage(MORNING_CENTER_STAGE_ID.quickStart, MORNING_CENTER_STAGE_STATUS.completed, 5),
      stage(MORNING_CENTER_STAGE_ID.physicalActivation, MORNING_CENTER_STAGE_STATUS.completed, 10),
      stage(MORNING_CENTER_STAGE_ID.mirror, MORNING_CENTER_STAGE_STATUS.current, 5),
      stage(MORNING_CENTER_STAGE_ID.mainAction, MORNING_CENTER_STAGE_STATUS.upcoming, 5),
      stage(MORNING_CENTER_STAGE_ID.workBlock, MORNING_CENTER_STAGE_STATUS.upcoming, 25),
    ],
    mirror: {
      status: MORNING_MIRROR_PRESENTATION_STATUS.pending,
      completedAt: null,
      canOpen: true,
      canComplete: true,
    },
  };
}

function stage(
  id: MorningCenterOverview['stages'][number]['id'],
  status: MorningCenterOverview['stages'][number]['status'],
  estimatedMinutes: number,
): MorningCenterOverview['stages'][number] {
  return { id, status, estimatedMinutes, scenarioStatus: 'normal' };
}
