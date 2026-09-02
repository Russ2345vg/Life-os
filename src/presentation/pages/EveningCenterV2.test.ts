import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import {
  Day,
  DayDate,
  EntityId,
  EveningCycle,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
} from '../../domain';
import { EveningCommandCenter } from './EveningCommandCenter';
import {
  EVENING_STEPS,
  buildEveningKpis,
  eveningStepIdForView,
} from './EveningCommandCenterPresentation';

const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const v2Css = readFileSync(new URL('../styles/evening-center-v2.css', import.meta.url), 'utf8');

describe('Evening Center v2 master shell', () => {
  it('показывает ровно пять визуальных шагов без служебных подписей', () => {
    const occurredAt = new Date('2026-09-01T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('evening-v2-steps-cycle'),
      dayId: EntityId.create('evening-v2-steps-day'),
      dateKey: DayDate.create('2026-09-01'),
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
        children: createElement('p', null, 'Стартовая сцена'),
      }),
    );

    expect(EVENING_STEPS.map((step) => step.label)).toEqual([
      'Сегодня',
      'Осмысление',
      'Завтра',
      'Подготовка',
      'Завершение',
    ]);
    expect(markup.match(/data-evening-step=/g)).toHaveLength(5);
    expect(markup).toContain('Шаг 1 из 5');
    expect(markup).not.toContain('Текущий шаг');
    expect(markup).not.toContain('Далее');
    expect(markup).not.toContain('>Среда<');
    expect(markup).not.toContain('>Расслабление<');
  });

  it('сворачивает legacy preparation, relaxation и sleep в один шаг Подготовка', () => {
    expect(eveningStepIdForView('preparation')).toBe('preparation');
    expect(eveningStepIdForView('relaxation')).toBe('preparation');
    expect(eveningStepIdForView('sleep')).toBe('preparation');
    expect(eveningStepIdForView('shutdown')).toBe('shutdown');
    expect(eveningStepIdForView('recovery')).toBe('shutdown');
  });

  it('оставляет выбор ядра внутренней фазой активного шага 4 и показывает подготовленное завтра', () => {
    const occurredAt = new Date('2026-09-01T22:00:00.000+09:00');
    const cycle = EveningCycle.rehydrate({
      id: EntityId.create('evening-v2-preparation-cycle'),
      dayId: EntityId.create('evening-v2-preparation-day'),
      dateKey: DayDate.create('2026-09-01'),
      state: EVENING_CYCLE_STATE.preparing,
      mode: EVENING_CYCLE_MODE.normal,
      startedAt: occurredAt,
      updatedAt: occurredAt,
      completedAt: null,
      version: 1,
    });
    const snapshot = {
      cycle,
      day: Day.openCurrent({
        id: EntityId.create('evening-v2-preparation-day'),
        currentDate: DayDate.create('2026-09-01'),
        occurredAt,
        createdEventId: EntityId.create('evening-v2-preparation-day-created'),
        openedEventId: EntityId.create('evening-v2-preparation-day-opened'),
      }),
      currentDate: DayDate.create('2026-09-01'),
      tomorrowDate: DayDate.create('2026-09-02'),
      isRecoveryReview: false,
      decisions: [],
      lifeActions: [],
      actionSessions: [],
      unfinishedSession: null,
      tomorrowDecisions: [],
      openLoops: { cycle, total: 0, resolved: 0, remaining: 0, items: [] },
    };
    const markup = renderToStaticMarkup(
      createElement(EveningCommandCenter, {
        cycle,
        isRecoveryReview: false,
        modeChangeDisabled: false,
        kpis: buildEveningKpis(snapshot, null, true),
        onModeChange: vi.fn(),
        onSelectView: vi.fn(),
        onClose: vi.fn(),
        children: createElement('p', null, 'Выбор ядра'),
      }),
    );

    expect(markup).toContain('Шаг 4 из 5');
    expect(markup.match(/class="is-complete"/g)).toHaveLength(3);
    expect(markup).toMatch(
      /data-evening-step="preparation" data-domain-current="true" data-selected-view="true"/,
    );
    expect(markup).toContain('aria-label="Завершение: недоступен"');
    expect(markup).toMatch(/Завтра<\/span><strong[^>]*>Подготовлено<\/strong>/);
  });

  it('строит ровно три сводки из реальных данных снимка', () => {
    const occurredAt = new Date('2026-09-01T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('evening-v2-kpis-cycle'),
      dayId: EntityId.create('evening-v2-kpis-day'),
      dateKey: DayDate.create('2026-09-01'),
      occurredAt,
    });
    const snapshot = {
      cycle,
      day: Day.openCurrent({
        id: EntityId.create('evening-v2-kpis-day'),
        currentDate: DayDate.create('2026-09-01'),
        occurredAt,
        createdEventId: EntityId.create('evening-v2-kpis-day-created'),
        openedEventId: EntityId.create('evening-v2-kpis-day-opened'),
      }),
      currentDate: DayDate.create('2026-09-01'),
      tomorrowDate: DayDate.create('2026-09-02'),
      isRecoveryReview: false,
      decisions: [],
      lifeActions: [],
      actionSessions: [],
      unfinishedSession: null,
      tomorrowDecisions: [],
      openLoops: { cycle, total: 0, resolved: 0, remaining: 0, items: [] },
    };

    const kpis = buildEveningKpis(snapshot, null);

    expect(kpis).toHaveLength(3);
    expect(kpis.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: 'Осталось сегодня', value: 'Всё разобрано' },
      { label: 'Завтра', value: 'Не подготовлено' },
      { label: 'Режим', value: 'Обычный' },
    ]);
    expect(cycle.state).toBe(EVENING_CYCLE_STATE.notStarted);
  });

  it('рендерит в каждой status card один icon wrapper и один SVG', () => {
    const occurredAt = new Date('2026-09-01T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('evening-v2-icons-cycle'),
      dayId: EntityId.create('evening-v2-icons-day'),
      dateKey: DayDate.create('2026-09-01'),
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
        children: createElement('p', null, 'Стартовая сцена'),
      }),
    );

    expect(markup.match(/class="evening-kpi-card"/g)).toHaveLength(3);
    expect(markup.match(/class="evening-kpi-card-icon/g)).toHaveLength(3);
    expect(markup.match(/data-evening-icon="(?:list|calendar|moon)"/g)).toHaveLength(3);
  });

  it('не генерирует legacy glyph layer через status-card pseudo-elements', () => {
    expect(globalCss).not.toMatch(
      /\.evening-kpi-card:nth-child\([123]\)::before\s*{\s*content:\s*['"][≡✓▦]['"]/,
    );
  });

  it('задаёт master shell gaps 20px, 22px и 24px без невалидного space-5', () => {
    expect(v2Css).toMatch(
      /\.evening-command-center-page\s*{[^}]*--evening-shell-header-padding-block:\s*var\(--space-3\);[^}]*--evening-shell-header-to-stepper:\s*var\(--space-2\);[^}]*--evening-shell-stepper-to-status:\s*1\.375rem;[^}]*--evening-shell-status-to-scene:\s*var\(--space-6\);/s,
    );
    expect(v2Css).toMatch(
      /\.evening-command-center-page \.evening-command-center-header\s*{[^}]*padding-block:\s*var\(--evening-shell-header-padding-block\);/s,
    );
    expect(v2Css).toMatch(
      /\.evening-command-center-page \.evening-command-center-journey\s*{[^}]*margin:\s*var\(--evening-shell-header-to-stepper\) auto 0;/s,
    );
    expect(v2Css).toMatch(
      /\.evening-command-center-page \.evening-command-center-step-count\s*{[^}]*position:\s*absolute;[^}]*top:\s*-1\.5rem;/s,
    );
    expect(v2Css).toMatch(
      /\.evening-command-center-page \.evening-command-center-kpis\s*{[^}]*margin:\s*var\(--evening-shell-stepper-to-status\) auto 0;/s,
    );
    expect(v2Css).toMatch(
      /\.evening-command-center-page \.evening-command-center-scene-host\s*{[^}]*padding:\s*var\(--evening-shell-status-to-scene\) 0 0;/s,
    );
    expect(v2Css).not.toContain('var(--space-5)');
  });

  it('затемняет низ hero единым градиентом без отдельной blurred CTA-панели', () => {
    expect(v2Css).toMatch(
      /\.evening-command-center-page \.evening-not-started-card\s*{[^}]*grid-template-rows:\s*auto auto;[^}]*gap:\s*1\.875rem;[^}]*linear-gradient\(\s*180deg,\s*transparent 0%,\s*transparent 64%/s,
    );
    expect(v2Css).toMatch(
      /\.evening-command-center-page \.evening-not-started-cta-zone\s*{[^}]*border-top:\s*0;[^}]*background:\s*transparent;[^}]*backdrop-filter:\s*none;/s,
    );
  });
});
