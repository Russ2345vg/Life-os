import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  Day,
  EveningCycle,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EVENING_MODE_REASON,
  DayDate,
  EntityId,
} from '../../domain';
import { EveningCommandCenter } from './EveningCommandCenter';
import {
  EVENING_JOURNEY,
  buildEveningKpis,
  defaultEveningView,
  eveningJourneyIdForState,
  eveningReturnToCurrentLabel,
  isEveningViewAvailable,
  selectEveningView,
  type EveningKpiItem,
  type SelectedEveningView,
} from './EveningCommandCenterPresentation';

describe('EveningCommandCenter', () => {
  it('переводит технические состояния в пользовательские этапы и отдельный Recovery', () => {
    expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.notStarted)).toBe('today');
    expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.windingDown)).toBe('today');
    expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.resolving)).toBe('today');
    expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.reflecting)).toBe('reflection');
    expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.planningTomorrow)).toBe('tomorrow');
    expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.preparing)).toBe('preparation');
    expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.shutdown)).toBe('shutdown');
    expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.completed)).toBe('recovery');
  });

  it('показывает единый путь, режимы и сцену без технических названий состояний', () => {
    const occurredAt = new Date('2026-08-14T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('command-center-cycle'),
      dayId: EntityId.create('command-center-day'),
      dateKey: DayDate.create('2026-08-14'),
      occurredAt,
    });
    cycle.start(occurredAt);
    cycle.beginResolving(occurredAt);

    const markup = renderToStaticMarkup(
      createElement(EveningCommandCenter, {
        cycle,
        isRecoveryReview: false,
        modeChangeDisabled: false,
        onModeChange: vi.fn(),
        onClose: vi.fn(),
        children: createElement('p', null, 'Содержимое текущей сцены'),
      }),
    );

    expect(markup).toContain('class="evening-command-center-page"');
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain('aria-modal="true"');
    expect(markup).toContain('data-journey="today"');
    expect(markup).toContain('data-view-mode="current"');
    expect(markup).toContain('Содержимое текущей сцены');
    expect(markup).toContain('Обычный');
    expect(markup).toContain('Быстрый');
    expect(markup).toContain('Позднее завершение');
    expect(markup).toContain('<select aria-label="Режим завершения">');
    expect(markup).toContain('Текущий шаг');
    expect(markup).toContain('Далее');
    expect(EVENING_JOURNEY.map((item) => item.label)).toEqual([
      'Сегодня',
      'Осмысление',
      'Завтра',
      'Среда',
      'Завершение',
    ]);
    expect(markup.match(/data-journey-stage=/g)).toHaveLength(5);
    expect(markup).not.toContain('RESOLVING');
    expect(markup).not.toContain('PREPARING');
    expect(markup).not.toContain('Экстренный');
  });

  it('называет KPI подготовки средой, не меняя preparation view ID', () => {
    const occurredAt = new Date('2026-08-14T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('environment-kpi-cycle'),
      dayId: EntityId.create('environment-kpi-day'),
      dateKey: DayDate.create('2026-08-14'),
      occurredAt,
    });

    const kpis = buildEveningKpis(
      {
        cycle,
        day: Day.openCurrent({
          id: EntityId.create('environment-kpi-day'),
          currentDate: DayDate.create('2026-08-14'),
          occurredAt,
          createdEventId: EntityId.create('environment-kpi-day-created'),
          openedEventId: EntityId.create('environment-kpi-day-opened'),
        }),
        currentDate: DayDate.create('2026-08-14'),
        tomorrowDate: DayDate.create('2026-08-15'),
        isRecoveryReview: false,
        decisions: [],
        lifeActions: [],
        actionSessions: [],
        unfinishedSession: null,
        tomorrowDecisions: [],
      },
      null,
    );

    expect(kpis.find((item) => item.icon === 'preparation')?.label).toBe('Среда');
    expect(eveningJourneyIdForState(EVENING_CYCLE_STATE.preparing)).toBe('preparation');
  });

  it('оставляет текущий шаг доступным, а четыре будущих шага locked', () => {
    const occurredAt = new Date('2026-08-14T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('not-started-journey-cycle'),
      dayId: EntityId.create('not-started-journey-day'),
      dateKey: DayDate.create('2026-08-14'),
      occurredAt,
    });

    const markup = renderToStaticMarkup(
      createElement(EveningCommandCenter, {
        cycle,
        isRecoveryReview: false,
        modeChangeDisabled: false,
        onModeChange: vi.fn(),
        onSelectView: vi.fn(),
        onClose: vi.fn(),
        children: createElement('p', null, 'Старт'),
      }),
    );
    const journeyMarkup = markup.slice(markup.indexOf('<nav'), markup.indexOf('</nav>') + 6);

    expect(journeyMarkup).toContain('data-domain-current="true" data-selected-view="true"');
    expect(journeyMarkup).toContain('aria-current="page" aria-label="Сегодня: Текущий шаг"');
    expect(journeyMarkup.match(/disabled=""/g)).toHaveLength(4);
    expect(journeyMarkup).toContain('Осмысление: Далее');
    expect(journeyMarkup).toContain('Завершение: Далее');
  });

  it('после refresh выбирает Recovery отдельно от пяти завершённых этапов', () => {
    const occurredAt = new Date('2026-08-14T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('completed-command-center-cycle'),
      dayId: EntityId.create('completed-command-center-day'),
      dateKey: DayDate.create('2026-08-14'),
      occurredAt,
    });
    cycle.skip(occurredAt);

    const markup = renderToStaticMarkup(
      createElement(EveningCommandCenter, {
        cycle,
        isRecoveryReview: true,
        modeChangeDisabled: true,
        onModeChange: vi.fn(),
        onClose: vi.fn(),
        children: createElement('p', null, 'Восстановление'),
      }),
    );

    expect(defaultEveningView(cycle.state)).toBe('recovery');
    expect(markup).toContain('data-journey="recovery"');
    expect(markup.match(/Завершено/g)).toHaveLength(10);
    expect(markup.match(/data-journey-stage=/g)).toHaveLength(5);
    expect(markup.match(/data-evening-icon="check"/g)).toHaveLength(5);
    expect(markup.match(/<button type="button"/g)).toHaveLength(5);
    expect(markup).not.toContain('aria-label="Сводка вечера"');
  });

  it.each([
    'today',
    'reflection',
    'tomorrow',
    'preparation',
    'shutdown',
    'recovery',
  ] satisfies readonly SelectedEveningView[])(
    'выбирает %s только как UI view и сохраняет domain state COMPLETED',
    (requested) => {
      const state = EVENING_CYCLE_STATE.completed;
      const selected = selectEveningView(state, 'recovery', requested);

      expect(selected).toBe(requested);
      expect(state).toBe(EVENING_CYCLE_STATE.completed);
    },
  );

  it.each([
    'today',
    'reflection',
    'tomorrow',
    'preparation',
    'shutdown',
  ] satisfies readonly SelectedEveningView[])(
    'в SHUTDOWN открывает %s как UI view, не откатывая domain state',
    (requested) => {
      const state = EVENING_CYCLE_STATE.shutdown;
      const selected = selectEveningView(state, 'shutdown', requested);

      expect(selected).toBe(requested);
      expect(state).toBe(EVENING_CYCLE_STATE.shutdown);
    },
  );

  it('разрешает только текущий и пройденные этапы, оставляя future и Recovery locked', () => {
    expect(isEveningViewAvailable(EVENING_CYCLE_STATE.reflecting, 'today')).toBe(true);
    expect(isEveningViewAvailable(EVENING_CYCLE_STATE.reflecting, 'reflection')).toBe(true);
    expect(isEveningViewAvailable(EVENING_CYCLE_STATE.reflecting, 'tomorrow')).toBe(false);
    expect(isEveningViewAvailable(EVENING_CYCLE_STATE.planningTomorrow, 'preparation')).toBe(false);
    expect(isEveningViewAvailable(EVENING_CYCLE_STATE.preparing, 'tomorrow')).toBe(true);
    expect(isEveningViewAvailable(EVENING_CYCLE_STATE.shutdown, 'recovery')).toBe(false);
  });

  it('разделяет current domain step, выбранный completed step и компактный возврат', () => {
    const occurredAt = new Date('2026-08-14T20:00:00.000+09:00');
    const cycle = createShutdownCycle(occurredAt);

    const markup = renderToStaticMarkup(
      createElement(EveningCommandCenter, {
        cycle,
        selectedView: 'tomorrow',
        isRecoveryReview: false,
        modeChangeDisabled: false,
        onModeChange: vi.fn(),
        onSelectView: vi.fn(),
        onClose: vi.fn(),
        children: createElement('p', null, 'Редактирование сохранённого плана'),
      }),
    );

    expect(markup).toContain('data-journey="tomorrow" data-domain-journey="shutdown"');
    expect(markup).toContain('class="evening-command-center is-history-view"');
    expect(markup).toContain('data-view-mode="history"');
    expect(markup).toContain('Завтра: Открыто для просмотра');
    expect(markup).toContain('Завершение: Текущий шаг');
    expect(markup).toContain('data-domain-current="true"');
    expect(markup).toContain('data-selected-view="true" data-selected-history="true"');
    expect(markup).toContain('class="evening-return-to-current"');
    expect(markup).toContain('Вернуться к завершению');
    expect(markup).not.toContain('Завтра: Текущий шаг');
    expect(cycle.state).toBe(EVENING_CYCLE_STATE.shutdown);
  });

  it('даёт отдельные подписи возврата для фактических этапов', () => {
    expect(eveningReturnToCurrentLabel('reflection')).toBe('Вернуться к осмыслению');
    expect(eveningReturnToCurrentLabel('tomorrow')).toBe('Вернуться к планированию завтра');
    expect(eveningReturnToCurrentLabel('preparation')).toBe('Вернуться к среде');
    expect(eveningReturnToCurrentLabel('shutdown')).toBe('Вернуться к завершению');
    expect(eveningReturnToCurrentLabel('recovery')).toBe('Вернуться к восстановлению');
  });

  it('показывает выбранный старый этап как просмотр, а не как текущий доменный шаг', () => {
    const occurredAt = new Date('2026-08-14T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('selected-command-center-cycle'),
      dayId: EntityId.create('selected-command-center-day'),
      dateKey: DayDate.create('2026-08-14'),
      occurredAt,
    });
    cycle.skip(occurredAt);

    const markup = renderToStaticMarkup(
      createElement(EveningCommandCenter, {
        cycle,
        selectedView: 'tomorrow',
        isRecoveryReview: true,
        modeChangeDisabled: true,
        onModeChange: vi.fn(),
        onSelectView: vi.fn(),
        onClose: vi.fn(),
        children: createElement('p', null, 'Сохранённый план завтра'),
      }),
    );

    expect(markup).toContain('data-journey="tomorrow"');
    expect(markup).toContain('class="evening-command-center is-recovery is-history-view"');
    expect(markup).toContain('data-view-mode="history"');
    expect(markup).toContain('Завтра: Открыто для просмотра');
    expect(markup).not.toContain('Завтра: Текущий шаг');
    expect(markup).toContain('data-selected-view="true" data-selected-history="true"');
    expect(markup).not.toContain('data-domain-current="true" data-selected-view="true"');
    expect(markup).toContain('Сохранённый план завтра');
  });

  it('показывает KPI как единую нейтральную структуру с typed SVG icon и meta', () => {
    const occurredAt = new Date('2026-08-14T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('kpi-command-center-cycle'),
      dayId: EntityId.create('kpi-command-center-day'),
      dateKey: DayDate.create('2026-08-14'),
      occurredAt,
    });
    cycle.start(occurredAt);
    cycle.beginResolving(occurredAt);
    const kpis = [
      {
        label: 'Незавершённое',
        value: '2 элемента',
        meta: 'Требует решения',
        icon: 'list',
        tone: 'current',
      },
    ] satisfies readonly EveningKpiItem[];

    const markup = renderToStaticMarkup(
      createElement(EveningCommandCenter, {
        cycle,
        isRecoveryReview: false,
        modeChangeDisabled: false,
        kpis,
        onModeChange: vi.fn(),
        onClose: vi.fn(),
        children: createElement('p', null, 'Сцена'),
      }),
    );

    expect(markup).toContain('class="evening-kpi-card" data-tone="current"');
    expect(markup).toContain('data-evening-icon="list"');
    expect(markup).toContain('class="evening-kpi-card-label">Незавершённое');
    expect(markup).toContain('class="evening-kpi-card-value">2 элемента');
    expect(markup).toContain('class="evening-kpi-card-meta">Требует решения');
    expect(markup).not.toContain('class="evening-kpi-card is-current"');
  });
});

function createShutdownCycle(occurredAt: Date): EveningCycle {
  const cycle = EveningCycle.create({
    id: EntityId.create('shutdown-navigation-cycle'),
    dayId: EntityId.create('shutdown-navigation-day'),
    dateKey: DayDate.create('2026-08-14'),
    occurredAt,
  });
  cycle.switchMode(EVENING_CYCLE_MODE.quick, EVENING_MODE_REASON.userSelected, occurredAt);
  cycle.start(occurredAt);
  cycle.beginResolving(occurredAt);
  cycle.completeResolving(occurredAt);
  cycle.skipReflection(occurredAt);
  cycle.completeTomorrowPlanning(occurredAt);
  cycle.skipPreparation(occurredAt);
  return cycle;
}
