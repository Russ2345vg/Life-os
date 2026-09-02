import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import type { EveningReviewSnapshot } from '../../application';
import {
  Day,
  DayDate,
  EntityId,
  EveningCycle,
  EVENING_CYCLE_MODE,
  EVENING_MODE_REASON,
  type EveningCycleMode,
} from '../../domain';
import {
  buildEveningRecoverySceneModel,
  buildEveningShutdownSceneModel,
  formatEveningDate,
} from './EveningFinalPresentation';
import { EveningRecoveryScene, EveningShutdownScene } from './EveningShutdownScene';

const panelSource = readFileSync(new URL('./EveningReviewPanel.tsx', import.meta.url), 'utf8');
const commandCenterSource = readFileSync(
  new URL('./EveningCommandCenter.tsx', import.meta.url),
  'utf8',
);
const applicationShellSource = readFileSync(
  new URL('../../app/ApplicationShell.tsx', import.meta.url),
  'utf8',
);
const todayPageSource = readFileSync(new URL('./TodayPage.tsx', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const finalScenesCss = readFileSync(
  new URL('../styles/evening-final-scenes.css', import.meta.url),
  'utf8',
);

describe('E9.4 shutdown scene', () => {
  it.each([
    {
      mode: EVENING_CYCLE_MODE.normal,
      title: 'Завершение дня',
      expected: 'Итоги сохранены',
      omitted: 'Критическое разобрано',
    },
    {
      mode: EVENING_CYCLE_MODE.quick,
      title: 'Завершение дня',
      expected: 'Критическое разобрано',
      omitted: 'Итоги дня сохранены',
    },
    {
      mode: EVENING_CYCLE_MODE.emergency,
      title: 'Позднее завершение',
      expected: 'Всё необходимое сохранено. Остальное можно уточнить утром.',
      omitted: 'Осмысление не выполнено',
    },
  ] as const)(
    'показывает пользовательский итог режима $mode',
    ({ mode, title, expected, omitted }) => {
      const snapshot = createSnapshot(mode);
      const model = buildEveningShutdownSceneModel(
        snapshot,
        mode === EVENING_CYCLE_MODE.emergency
          ? { primaryDecisionTitle: null, firstStepTitle: null }
          : { primaryDecisionTitle: 'Главное решение', firstStepTitle: 'Первый шаг' },
      );
      const markup = renderToStaticMarkup(
        createElement(EveningShutdownScene, {
          model,
          isSubmitting: false,
          error: null,
          onComplete: vi.fn(),
          onResolveBlocker: vi.fn(),
        }),
      );

      expect(markup).toContain(title);
      expect(markup).toContain(expected);
      expect(markup).not.toContain(omitted);
      expect(markup).not.toContain('SHUTDOWN');
      expect(markup).not.toContain('COMPLETED');
    },
  );

  it('в QUICK оставляет только критическое, главное завтра и обязательную подготовку', () => {
    const model = buildEveningShutdownSceneModel(createSnapshot(EVENING_CYCLE_MODE.quick), {
      primaryDecisionTitle: 'Главное решение',
      firstStepTitle: 'Не показывать этот шаг',
    });
    const markup = renderToStaticMarkup(
      createElement(EveningShutdownScene, {
        model,
        isSubmitting: false,
        error: null,
        onComplete: vi.fn(),
        onResolveBlocker: vi.fn(),
      }),
    );

    expect(markup).toContain('Критическое разобрано');
    expect(markup).toContain('Главное решение');
    expect(markup).toContain('Обязательная подготовка выполнена');
    expect(markup).not.toContain('Не показывать этот шаг');
    expect(markup).not.toContain('Итоги сохранены');
  });

  it('показывает доменную блокировку отдельно от компактной технической ошибки', () => {
    const model = buildEveningShutdownSceneModel(createSnapshot(EVENING_CYCLE_MODE.normal), {
      primaryDecisionTitle: 'Главное решение',
      firstStepTitle: null,
    });
    const blocked = renderToStaticMarkup(
      createElement(EveningShutdownScene, {
        model,
        isSubmitting: false,
        error: { kind: 'blocking', message: 'Осталась активная рабочая сессия.' },
        onComplete: vi.fn(),
        onResolveBlocker: vi.fn(),
      }),
    );
    const technical = renderToStaticMarkup(
      createElement(EveningShutdownScene, {
        model,
        isSubmitting: false,
        error: { kind: 'technical', message: 'Не удалось завершить день.' },
        onComplete: vi.fn(),
        onResolveBlocker: vi.fn(),
      }),
    );

    expect(blocked).toContain('День пока нельзя закрыть');
    expect(blocked).toContain('Разобрать');
    expect(technical).toContain('role="alert"');
    expect(technical).toContain('Повторить');
  });

  it('собирает shutdown в единый двухколоночный workspace с постоянной визуальной опорой', () => {
    const model = buildEveningShutdownSceneModel(createSnapshot(EVENING_CYCLE_MODE.normal), {
      primaryDecisionTitle: 'Главное решение',
      firstStepTitle: 'Первый шаг',
    });
    const markup = renderToStaticMarkup(
      createElement(EveningShutdownScene, {
        model,
        isSubmitting: false,
        error: null,
        onComplete: vi.fn(),
        onResolveBlocker: vi.fn(),
      }),
    );

    const visual = markup.indexOf('evening-shutdown-visual-panel');
    const content = markup.indexOf('evening-shutdown-content');
    const readiness = markup.indexOf('Готовность сегодня');
    const primary = markup.indexOf('Главное решение');
    const firstStep = markup.indexOf('Первый шаг');
    const action = markup.indexOf('Завершить день');
    const aftercare = markup.indexOf('режим восстановления');

    expect(visual).toBeGreaterThan(-1);
    expect(content).toBeGreaterThan(visual);
    expect(readiness).toBeGreaterThan(content);
    expect(primary).toBeGreaterThan(readiness);
    expect(firstStep).toBeGreaterThan(primary);
    expect(action).toBeGreaterThan(firstStep);
    expect(aftercare).toBeGreaterThan(action);
    expect(markup).not.toContain('evening-final-dashboard');
    expect(finalScenesCss).toMatch(
      /\.evening-command-center-page \.evening-shutdown-workspace\s*{[^}]*grid-template-columns:\s*minmax\([^;]+\) minmax\(0, 1fr\)/,
    );
    expect(finalScenesCss).toMatch(
      /\.evening-command-center-page \.evening-shutdown-readiness \.evening-final-facts\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(finalScenesCss).toMatch(
      /\.evening-command-center-page \.evening-shutdown-content \.evening-complete-day-action\s*{[^}]*width:\s*100%/,
    );
    expect(finalScenesCss).toContain('overflow-wrap: anywhere');
  });

  it('сохраняет loading, disabled и read-only history без повторного CTA', () => {
    const model = buildEveningShutdownSceneModel(createSnapshot(EVENING_CYCLE_MODE.normal), {
      primaryDecisionTitle: 'Главное решение',
      firstStepTitle: 'Первый шаг',
    });
    const loading = renderToStaticMarkup(
      createElement(EveningShutdownScene, {
        model,
        isSubmitting: true,
        error: null,
        onComplete: vi.fn(),
        onResolveBlocker: vi.fn(),
      }),
    );
    const history = renderToStaticMarkup(
      createElement(EveningShutdownScene, {
        model,
        isSubmitting: false,
        error: null,
        readOnly: true,
        onComplete: vi.fn(),
        onResolveBlocker: vi.fn(),
      }),
    );

    expect(loading).toContain('disabled=""');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('Завершаем день…');
    expect(history).toContain('Итог завершения сохранён');
    expect(history).not.toContain('Завершить день');
  });
});

describe('E9.4 recovery scene', () => {
  it('полностью заменяет shutdown цельным recovery overview и даёт закрыть центр', () => {
    const model = buildEveningRecoverySceneModel(createSnapshot(EVENING_CYCLE_MODE.normal), {
      primaryDecisionTitle: 'Завершить интерфейс вечера',
      firstStepTitle: 'Открыть LifeOS',
    });
    const markup = renderToStaticMarkup(
      createElement(EveningRecoveryScene, { model, onClose: vi.fn() }),
    );

    expect(markup).toContain('День завершён');
    expect(markup).toContain('Среда · 5 августа 2026');
    expect(markup).toContain('Главное завтра');
    expect(markup).toContain('Первый шаг');
    expect(markup).toContain('Закрыть');
    expect(markup).not.toContain('Завершить день');
    expect(markup).toMatch(
      /evening-recovery-overview[\s\S]*evening-recovery-visual-panel[\s\S]*evening-recovery-content[\s\S]*evening-recovery-summary[\s\S]*evening-final-tomorrow/,
    );
    expect(markup).not.toContain('evening-recovery-prepared');
    expect(finalScenesCss).toMatch(
      /\.evening-command-center-page \.evening-recovery-overview\s*{[^}]*grid-template-columns:\s*minmax\([^;]+\) minmax\(0, 1fr\)/,
    );
  });

  it('не выводит пустые строки tomorrow preview, но подтверждает подготовку', () => {
    const model = buildEveningRecoverySceneModel(createSnapshot(EVENING_CYCLE_MODE.emergency), {
      primaryDecisionTitle: null,
      firstStepTitle: null,
    });
    const markup = renderToStaticMarkup(
      createElement(EveningRecoveryScene, { model, onClose: vi.fn() }),
    );

    expect(markup).not.toContain('<dt>');
    expect(markup).toContain('Завтра подготовлено');
    expect(formatEveningDate('2026-08-15')).toBe('Суббота · 15 августа 2026');
  });

  it('сохраняет длинный контекст завтра внутри спокойной recovery-композиции', () => {
    const longPrimary = 'Главное решение '.repeat(10).trim();
    const longFirstStep = 'Первый шаг с подробным контекстом '.repeat(7).trim();
    const model = buildEveningRecoverySceneModel(createSnapshot(EVENING_CYCLE_MODE.quick), {
      primaryDecisionTitle: longPrimary,
      firstStepTitle: longFirstStep,
    });
    const markup = renderToStaticMarkup(
      createElement(EveningRecoveryScene, { model, onClose: vi.fn() }),
    );

    expect(markup).toContain(longPrimary);
    expect(markup).toContain(longFirstStep);
    expect(finalScenesCss).toMatch(
      /\.evening-recovery-content \.evening-final-tomorrow dd\s*{[^}]*overflow-wrap:\s*anywhere/,
    );
  });
});

describe('E9.4 controller and responsive contract', () => {
  it('использует E7 command, read-only preview и синхронный single-flight guard', () => {
    expect(panelSource).toContain('completeCurrentDay.execute');
    expect(panelSource).toMatch(/tomorrowPlan\s*\.getByTargetDate\(snapshot\.tomorrowDate\)/);
    expect(panelSource).toContain('completionRequestRef.current');
    expect(panelSource).toContain("setShutdownError({ kind: 'blocking'");
    expect(commandCenterSource).toContain('aria-label="Закрыть вечерний центр"');
  });

  it('на старте приложения открывает сохранённые SHUTDOWN и COMPLETED по дате цикла', () => {
    expect(applicationShellSource).toContain('application.getApplicationMode');
    expect(applicationShellSource).toContain('setStartupEveningDate(result.date)');
    expect(todayPageSource).toContain('setEveningReviewDate(startupEveningDate)');
    expect(todayPageSource).toContain('reviewDate={eveningReviewDate}');
  });

  it('поддерживает мобильный safe-area, спокойный переход и reduced motion', () => {
    expect(finalScenesCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-command-center-page \.evening-final-scene\s*{[\s\S]*?padding-bottom:\s*max\(0\.5rem, env\(safe-area-inset-bottom\)\)/,
    );
    expect(globalCss).toContain('animation: evening-shutdown-scene-out 280ms');
    expect(globalCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.evening-command-center\.is-completing[\s\S]*?animation:\s*none/,
    );
    expect(finalScenesCss).toMatch(
      /@media \(max-width: 30rem\)[\s\S]*?\.evening-command-center-page \.evening-shutdown-workspace,[\s\S]*?\.evening-command-center-page \.evening-recovery-overview\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(finalScenesCss).toMatch(
      /data-domain-journey='shutdown'[\s\S]*?\.evening-command-center-kpis\s*{\s*display:\s*none/,
    );
  });

  it('не создаёт горизонтальный scroll и сохраняет touch-target CTA на узком viewport', () => {
    expect(finalScenesCss).toMatch(
      /\.evening-command-center-page \.evening-final-scene\s*{[^}]*max-width:\s*100%/,
    );
    expect(finalScenesCss).toMatch(
      /@media \(max-width: 30rem\)[\s\S]*?\.evening-command-center-page \.evening-recovery-close\s*{[^}]*min-height:\s*3rem/,
    );
    expect(finalScenesCss).toMatch(
      /@media \(max-width: 30rem\)[\s\S]*?\.evening-command-center-page \.evening-final-tomorrow dl\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });

  it('сохраняет видимый focus ring у icon-only закрытия Evening Center', () => {
    expect(globalCss).toMatch(
      /\.evening-command-center-page \.evening-command-center-close:focus-visible\s*{[^}]*outline:\s*2px solid var\(--color-accent-gold\)[^}]*outline-offset:\s*2px/,
    );
  });

  it('оставляет V3 readiness последним применимым правилом scoped-каскада', () => {
    const readinessRule = lastCssRule(
      finalScenesCss,
      '.evening-command-center-page .evening-shutdown-readiness .evening-final-facts',
    );

    expect(readinessRule).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(readinessRule).not.toContain('repeat(2');
  });
});

function lastCssRule(source: string, selector: string): string {
  const start = source.lastIndexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('}', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 1);
}

function createSnapshot(mode: EveningCycleMode): EveningReviewSnapshot {
  const date = DayDate.create('2026-08-05');
  const now = new Date('2026-08-05T20:00:00.000+09:00');
  const dayId = EntityId.create('e94-day');
  const cycle = EveningCycle.create({
    id: EntityId.create(`e94-${mode.toLowerCase()}`),
    dayId,
    dateKey: date,
    occurredAt: now,
  });
  cycle.start(now);
  if (mode !== EVENING_CYCLE_MODE.normal) {
    cycle.switchMode(mode, EVENING_MODE_REASON.userSelected, now);
  }
  const day = Day.openCurrent({
    id: dayId,
    currentDate: date,
    occurredAt: now,
    createdEventId: EntityId.create(`e94-created-${mode.toLowerCase()}`),
    openedEventId: EntityId.create(`e94-opened-${mode.toLowerCase()}`),
  });

  return {
    cycle,
    day,
    currentDate: date,
    tomorrowDate: DayDate.create('2026-08-06'),
    isRecoveryReview: false,
    decisions: [],
    lifeActions: [],
    actionSessions: [],
    unfinishedSession: null,
    tomorrowDecisions: [],
  };
}
