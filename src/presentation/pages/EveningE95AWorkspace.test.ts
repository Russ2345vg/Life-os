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
const tomorrowFormCss = readFileSync(
  new URL('../styles/evening-tomorrow-form-v3.css', import.meta.url),
  'utf8',
);
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
    expect(tomorrowSource).toContain('Выбрать или создать решение');
    expect(tomorrowSource).toContain('Выбрать существующее');
    expect(tomorrowSource).toContain('Новое решение');
    expect(tomorrowSource).toContain('Конкретное первое действие');
    expect(tomorrowSource).toContain('Дополнительные решения');
    expect(tomorrowSource).toContain('supportingIds.slice(0, 2)');
    expect(tomorrowSource).toContain('Продолжить →');
    expect(tomorrowSource).not.toContain('aria-hidden="true">01');
    expect(tomorrowSource).not.toContain('aria-hidden="true">03');
    expect(tomorrowSource).toContain('rows={1}');
    expect(tomorrowFormCss).toMatch(
      /\.tomorrow-dashboard\s*{[^}]*grid-template-areas:\s*none;[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(tomorrowFormCss).toMatch(
      /\.tomorrow-primary-card\.is-empty\s*{[^}]*background:\s*linear-gradient/,
    );
    expect(tomorrowFormCss).toMatch(
      /:is\(\s*\.tomorrow-primary-card,[\s\S]*?\.tomorrow-supporting\s*\)[\s\S]*?min-height:\s*0;[^}]*border:\s*1px solid/,
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

  it('выстраивает compact current и подробный history summary без табличной сетки', () => {
    const summaryStart = tomorrowSource.indexOf('function TomorrowCompleteSummary');
    const summaryEnd = tomorrowSource.indexOf('function ComposerFrame');
    const summarySource = tomorrowSource.slice(summaryStart, summaryEnd);
    const historyStart = summarySource.indexOf('const primaryIsCarried');
    const currentSource = summarySource.slice(0, historyStart);
    const historySource = summarySource.slice(historyStart);

    const currentPrimary = currentSource.indexOf('Главное решение');
    const currentOutcome = currentSource.indexOf('Граница результата');
    const currentFirstStep = currentSource.indexOf('Первый шаг');
    const currentSupporting = currentSource.indexOf('Дополнительно');
    const currentAction = currentSource.indexOf('{actionLabel}');

    expect(currentPrimary).toBeGreaterThan(-1);
    expect(currentOutcome).toBeGreaterThan(currentPrimary);
    expect(currentFirstStep).toBeGreaterThan(currentOutcome);
    expect(currentSupporting).toBeGreaterThan(currentFirstStep);
    expect(currentAction).toBeGreaterThan(currentSupporting);

    const historyPrimary = historySource.indexOf('Главное Решение');
    const historyOutcome = historySource.indexOf('className="tomorrow-complete-outcomes"');
    const historyFirstStep = historySource.indexOf('Первый шаг');
    const historySupporting = historySource.indexOf('Дополнительно');
    const historyAction = historySource.indexOf('{actionLabel}');

    expect(historyPrimary).toBeGreaterThan(-1);
    expect(historyOutcome).toBeGreaterThan(historyPrimary);
    expect(historyFirstStep).toBeGreaterThan(historyOutcome);
    expect(historySupporting).toBeGreaterThan(historyFirstStep);
    expect(historyAction).toBeGreaterThan(historySupporting);
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
