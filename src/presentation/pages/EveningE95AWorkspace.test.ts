import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';

const commandCenterSource = readFileSync(
  new URL('./EveningCommandCenter.tsx', import.meta.url),
  'utf8',
);
const tomorrowSource = readFileSync(new URL('./TomorrowComposer.tsx', import.meta.url), 'utf8');
const routineSource = readFileSync(new URL('./RoutinePage.tsx', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const notStartedCss = globalCss.slice(
  globalCss.indexOf('/* NOT_STARTED: approved Evening Command Center start state */'),
);
const tomorrowV2Css = globalCss.slice(
  globalCss.lastIndexOf('/* E11.3G-A: TomorrowScene visual fidelity V2A */'),
);

describe('E9.5A Evening Command Center workspace', () => {
  it('встраивает центр в application shell без modal semantics и отдельного viewport', () => {
    expect(commandCenterSource).toContain('evening-command-center-page');
    expect(commandCenterSource).not.toContain('aria-modal');
    expect(routineSource).toContain('routine-evening-command-page');
    expect(globalCss).toMatch(
      /\/\* E9\.5A:[\s\S]*?\.evening-command-center-page \.evening-command-center\s*{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/,
    );
    expect(globalCss).toMatch(
      /\/\* E9\.5A:[\s\S]*?\.evening-command-center-page \.evening-command-center-scene-host\s*{[^}]*overflow:\s*visible;/,
    );
  });

  it('строит сцену Завтра как единый V2A-план с одним главным акцентом', () => {
    expect(tomorrowSource).toContain('className="tomorrow-dashboard"');
    expect(tomorrowSource).toContain('Выбрать или создать Решение');
    expect(tomorrowSource).toContain('Выбрать существующее');
    expect(tomorrowSource).toContain('Новое Решение');
    expect(tomorrowSource).toContain('Конкретное первое действие');
    expect(tomorrowSource).toContain('Если останется ресурс');
    expect(tomorrowSource).toContain('supportingIds.slice(0, 2)');
    expect(tomorrowSource).toContain('Подготовить завтра →');
    expect(tomorrowSource).not.toContain('aria-hidden="true">01');
    expect(tomorrowSource).not.toContain('aria-hidden="true">03');
    expect(tomorrowSource).toContain('rows={1}');
    expect(tomorrowV2Css).toMatch(
      /\.tomorrow-dashboard\s*{[^}]*grid-template-areas:\s*'primary primary'\s*'outcomes outcomes'/,
    );
    expect(tomorrowV2Css).toMatch(
      /\.tomorrow-primary-card\.is-empty\s*{[^}]*min-height:\s*0;[^}]*place-items:\s*stretch/,
    );
    expect(tomorrowV2Css).toMatch(
      /:is\(\s*\.tomorrow-primary-card,[\s\S]*?\.tomorrow-supporting\s*\)\s*{[^}]*border:\s*0/,
    );
  });

  it('сохраняет Норму центральной на desktop и перестраивает страницу на mobile', () => {
    const minimum = tomorrowSource.indexOf('Минимум');
    const target = tomorrowSource.indexOf('Норма');
    const maximum = tomorrowSource.indexOf('Максимум');

    expect(minimum).toBeGreaterThan(-1);
    expect(minimum).toBeGreaterThan(target);
    expect(maximum).toBeGreaterThan(minimum);
    expect(tomorrowV2Css).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.tomorrow-dashboard\s*{[^}]*grid-template-areas:\s*'primary'\s*'outcomes'\s*'first'\s*'supporting'/,
    );
    expect(notStartedCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-command-center-page \.evening-command-center-kpis\s*{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*overflow:\s*visible/,
    );
    expect(notStartedCss).not.toContain('overflow-x: auto');
  });

  it('выстраивает completed summary как иерархию без табличной сетки', () => {
    const summaryStart = tomorrowSource.indexOf('function TomorrowCompleteSummary');
    const summaryEnd = tomorrowSource.indexOf('function ComposerFrame');
    const summarySource = tomorrowSource.slice(summaryStart, summaryEnd);

    const primary = summarySource.indexOf('Главное Решение');
    const outcome = summarySource.indexOf('className="tomorrow-complete-outcomes"');
    const firstStep = summarySource.indexOf('Первый шаг');
    const supporting = summarySource.indexOf('Дополнительно');
    const action = summarySource.indexOf('{actionLabel}');

    expect(primary).toBeGreaterThan(-1);
    expect(outcome).toBeGreaterThan(primary);
    expect(firstStep).toBeGreaterThan(outcome);
    expect(supporting).toBeGreaterThan(firstStep);
    expect(action).toBeGreaterThan(supporting);
    expect(summarySource).not.toContain('<dl>');
    expect(summarySource).not.toContain('tomorrow-complete-sequence');
    expect(tomorrowV2Css).toMatch(
      /\.evening-command-center-page \.tomorrow-complete-plan\s*{[^}]*grid-template-areas:\s*'primary primary'\s*'outcomes outcomes'\s*'lower lower'/,
    );
    expect(tomorrowV2Css).toMatch(
      /\.evening-command-center-page \.tomorrow-complete-lower-grid\s*{[^}]*grid-template-columns:\s*minmax\(0, 0\.92fr\) minmax\(0, 1\.08fr\)/,
    );
  });
});
