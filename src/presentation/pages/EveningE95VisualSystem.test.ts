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
} from '../../domain';
import { EveningCommandCenter } from './EveningCommandCenter';
import { buildEveningKpis } from './EveningCommandCenterPresentation';

const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const v2bCss = globalCss.slice(
  globalCss.lastIndexOf('/* E11.3G-B: PreparationScene visual fidelity V2B */'),
);
const preparationSource = readFileSync(new URL('./PreparationPanel.tsx', import.meta.url), 'utf8');
const resolvingSource = readFileSync(
  new URL('./EveningResolvingScene.tsx', import.meta.url),
  'utf8',
);
const reflectionSource = readFileSync(
  new URL('./EveningReflectionScene.tsx', import.meta.url),
  'utf8',
);
const tomorrowSource = readFileSync(new URL('./TomorrowComposer.tsx', import.meta.url), 'utf8');
const shutdownSource = readFileSync(new URL('./EveningShutdownScene.tsx', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('./EveningReviewPanel.tsx', import.meta.url), 'utf8');

describe('E9.5 unified evening visual system', () => {
  it('строит KPI только из существующего снимка и пользовательского режима', () => {
    const snapshot = createSnapshot();
    const kpis = buildEveningKpis(snapshot, null);

    expect(kpis.map((item) => item.label)).toEqual([
      'Незавершённое',
      'Осмысление',
      'Завтра',
      'Подготовка',
      'Режим',
    ]);
    expect(kpis[0]).toMatchObject({ value: 'Нет', tone: 'ready' });
    expect(kpis[4]).toMatchObject({ value: 'Позднее', tone: 'neutral' });
  });

  it('использует золото для Незавершённого только при известном ненулевом количестве', () => {
    const snapshot = createSnapshot();
    const withOpenItems: EveningReviewSnapshot = {
      ...snapshot,
      openLoops: {
        ...snapshot.openLoops!,
        total: 2,
        remaining: 2,
      },
    };
    const withoutOpenLoopData: EveningReviewSnapshot = {
      cycle: snapshot.cycle,
      day: snapshot.day,
      currentDate: snapshot.currentDate,
      tomorrowDate: snapshot.tomorrowDate,
      isRecoveryReview: snapshot.isRecoveryReview,
      decisions: snapshot.decisions,
      lifeActions: snapshot.lifeActions,
      actionSessions: snapshot.actionSessions,
      unfinishedSession: snapshot.unfinishedSession,
      tomorrowDecisions: snapshot.tomorrowDecisions,
    };

    expect(buildEveningKpis(withOpenItems, null)[0]).toMatchObject({
      value: '2 элемента',
      tone: 'current',
    });
    expect(buildEveningKpis(withoutOpenLoopData, null)[0]).toMatchObject({
      value: '—',
      tone: 'neutral',
    });
  });

  it('показывает KPI и маршрут без технических названий', () => {
    const snapshot = createSnapshot();
    const markup = renderToStaticMarkup(
      createElement(EveningCommandCenter, {
        cycle: snapshot.cycle,
        isRecoveryReview: false,
        modeChangeDisabled: false,
        kpis: buildEveningKpis(snapshot, null),
        onModeChange: vi.fn(),
        onClose: vi.fn(),
        children: createElement('p', null, 'Сцена'),
      }),
    );

    expect(markup).toContain('aria-label="Сводка вечера"');
    expect(markup).toContain('Позднее завершение');
    expect(markup).toContain('Текущий шаг');
    expect(markup).toContain('Далее');
    expect(markup).not.toContain('RESOLVING');
    expect(markup).not.toContain('SHUTDOWN');
  });

  it('использует общую геометрию, спокойные motion-токены и мобильную сетку без scroll', () => {
    expect(globalCss).toMatch(
      /\/\* E9\.5:[\s\S]*?\.evening-command-center-kpis\s*{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/,
    );
    expect(globalCss).toContain('animation: evening-command-center-scene-in 240ms');
    expect(globalCss).toContain('animation: evening-shutdown-scene-out 280ms');
    expect(globalCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.evening-command-center \*[\s\S]*?animation:\s*none !important/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-command-center-journey\s*{[\s\S]*?overflow:\s*hidden/,
    );
    expect(globalCss).toContain('env(safe-area-inset-bottom)');
  });

  it('не использует старый progress bar и аварийную терминологию', () => {
    expect(preparationSource).toContain('preparation-progress-segments');
    expect(preparationSource).not.toContain('<progress');
    expect(reviewSource).not.toContain('аварийному завершению');
    expect(reviewSource).toContain('Позднее завершение · Завтра');
    expect(reviewSource).toContain('Позднее завершение · Подготовка');
  });

  it('синхронизирует шесть утверждённых состояний без изменения команд E1–E8', () => {
    expect(resolvingSource).toContain('Сегодня · Решения');
    expect(resolvingSource).toContain('aria-label="Прогресс разбора"');
    expect(reflectionSource).toContain('Инсайт');
    expect(reflectionSource).toContain('Рекомендация');
    expect(reflectionSource).not.toContain('Signal');
    expect(tomorrowSource).toContain('Вывод на завтра');
    expect(tomorrowSource).toContain('Подготовить завтра →');
    expect(preparationSource).toContain("[PREPARATION_CATEGORY.cognitive]: 'Дополнительно'");
    expect(preparationSource).toContain('aria-label="Общий прогресс подготовки"');
    expect(shutdownSource).toContain('Завершить день');
    expect(shutdownSource).toContain('className="evening-recovery-close"');
  });

  it('закрепляет пять шагов journey и адаптивные двухколоночные сцены', () => {
    expect(globalCss).toMatch(
      /\/\* E9\.5: approved sync cascade \*\/[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/,
    );
    expect(globalCss).toMatch(
      /\.evening-reflection-workspace\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(17rem, 0\.75fr\)/,
    );
    expect(v2bCss).toMatch(
      /\.preparation-sections-3\s*{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
  });
});

function createSnapshot(): EveningReviewSnapshot {
  const date = DayDate.create('2026-08-20');
  const now = new Date('2026-08-20T21:00:00.000+09:00');
  const dayId = EntityId.create('e95-day');
  const cycle = EveningCycle.create({
    id: EntityId.create('e95-cycle'),
    dayId,
    dateKey: date,
    occurredAt: now,
  });
  cycle.start(now);
  cycle.switchMode(EVENING_CYCLE_MODE.emergency, EVENING_MODE_REASON.userSelected, now);
  const day = Day.openCurrent({
    id: dayId,
    currentDate: date,
    occurredAt: now,
    createdEventId: EntityId.create('e95-created'),
    openedEventId: EntityId.create('e95-opened'),
  });

  return {
    cycle,
    day,
    currentDate: date,
    tomorrowDate: DayDate.create('2026-08-21'),
    isRecoveryReview: false,
    decisions: [],
    lifeActions: [],
    actionSessions: [],
    unfinishedSession: null,
    tomorrowDecisions: [],
    openLoops: {
      cycle,
      total: 0,
      resolved: 0,
      remaining: 0,
      items: [],
    },
  };
}
