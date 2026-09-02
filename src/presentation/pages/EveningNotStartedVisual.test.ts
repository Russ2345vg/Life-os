import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import { DayDate, EntityId, EveningCycle } from '../../domain';
import { EveningCommandCenter } from './EveningCommandCenter';
import type { EveningKpiItem } from './EveningCommandCenterPresentation';

const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const commandCenterSource = readFileSync(
  new URL('./EveningCommandCenter.tsx', import.meta.url),
  'utf8',
);
const reviewSource = readFileSync(new URL('./EveningReviewPanel.tsx', import.meta.url), 'utf8');
const finalVisualMarker =
  '/* E11.3C: Visual Fidelity V1 — approved Evening Command Center composition */';
const startStateMarker = '/* NOT_STARTED: approved Evening Command Center start state */';
const compactDensityMarker =
  '/* E11.3E: independent history navigation and compact dashboard density */';
const finalVisualStart = globalCss.indexOf(finalVisualMarker);
const startStateStart = globalCss.indexOf(startStateMarker);
const compactDensityStart = globalCss.indexOf(compactDensityMarker);
const finalVisualCss = globalCss.slice(finalVisualStart, startStateStart);
const startStateCss = globalCss.slice(startStateStart);
const compactDensityCss = globalCss.slice(compactDensityStart);

describe('NOT_STARTED Evening Command Center visual contract', () => {
  it('не возвращает broad direct-child селекторы, которые накладывали icon и copy KPI', () => {
    expect(globalCss).not.toMatch(/\.evening-kpi-card\s*>\s*(?:span|strong)/);
    expect(commandCenterSource.match(/<EveningKpiCard item=/g)).toHaveLength(1);
    expect(commandCenterSource).toContain('evening-kpi-card-icon is-');
    expect(commandCenterSource).toContain('className="evening-kpi-card-copy"');
  });

  it('закрепляет одинаковую desktop-геометрию и безопасный перенос label/value/meta', () => {
    expect(finalVisualStart).toBeGreaterThan(-1);
    expect(startStateStart).toBeGreaterThan(finalVisualStart);
    expect(compactDensityStart).toBeGreaterThan(startStateStart);
    expect(compactDensityCss).toMatch(
      /\.evening-kpi-card:nth-child\(n \+ 4\)\s*{[^}]*min-height:\s*5\.25rem;[^}]*height:\s*auto;[^}]*grid-template-columns:\s*2rem minmax\(0, 1fr\);[^}]*padding:\s*0\.75rem 0\.875rem/,
    );
    expect(compactDensityCss).toMatch(
      /\.evening-kpi-card-icon\s*{[^}]*width:\s*2rem;[^}]*height:\s*2rem/,
    );
    expect(compactDensityCss).toMatch(
      /\.evening-kpi-card-value\s*{[^}]*font-size:\s*clamp\(1\.25rem, 1\.35vw, 1\.45rem\)/,
    );
    expect(finalVisualCss).toMatch(
      /\.evening-kpi-card-label,[\s\S]*?\.evening-kpi-card-meta\s*{[^}]*overflow:\s*visible;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal/,
    );
    expect(finalVisualCss).toMatch(/\.evening-kpi-card-value\s*{[^}]*line-height:\s*1\.12/);
  });

  it('оставляет neutral графитовым, current золотым, ready зелёным', () => {
    expect(finalVisualCss).toMatch(
      /\.evening-kpi-card-icon\s*{[^}]*color:\s*#8d969a;[^}]*background:\s*#11171a/,
    );
    expect(finalVisualCss).toMatch(
      /\.evening-kpi-card-icon\.is-current\s*{[^}]*color:\s*var\(--evening-v1-gold-bright\)/,
    );
    expect(finalVisualCss).toMatch(/\.evening-kpi-card-icon\.is-ready\s*{[^}]*color:\s*#7bc887/);
    expect(finalVisualCss).toMatch(/\.evening-kpi-card\[data-tone='ready'\]\s*{[^}]*#31533a/);
  });

  it('рендерит длинный KPI одним текстовым слоем', () => {
    const occurredAt = new Date('2026-08-21T20:00:00.000+09:00');
    const cycle = EveningCycle.create({
      id: EntityId.create('not-started-visual-cycle'),
      dayId: EntityId.create('not-started-visual-day'),
      dateKey: DayDate.create('2026-08-21'),
      occurredAt,
    });
    const longLabel = 'Незавершённое с очень длинным русским названием';
    const longValue = 'Несколько элементов требуют внимательного решения';
    const longMeta = 'Спокойно перенесётся на несколько строк без пересечения';
    const kpis = [
      {
        label: longLabel,
        value: longValue,
        meta: longMeta,
        icon: 'list',
        tone: 'neutral',
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
        children: createElement('p', null, 'Стартовая сцена'),
      }),
    );

    expect(markup.match(new RegExp(longLabel, 'g'))).toHaveLength(1);
    expect(markup.match(new RegExp(longValue, 'g'))).toHaveLength(1);
    expect(markup.match(new RegExp(longMeta, 'g'))).toHaveLength(1);
    expect(markup).toContain('class="evening-kpi-card" data-tone="neutral"');
  });

  it('делает Journey компактным и оставляет locked future steps некликабельными', () => {
    expect(finalVisualCss).toMatch(
      /\.evening-command-center-journey li\s*{[^}]*min-height:\s*3rem;[^}]*border:\s*0;[^}]*background:\s*transparent/,
    );
    expect(finalVisualCss).toMatch(
      /\.evening-command-center-journey li > button\s*{[^}]*background:\s*transparent/,
    );
    expect(finalVisualCss).toMatch(
      /\.evening-command-center-journey li > button:disabled\s*{[^}]*cursor:\s*default;[^}]*opacity:\s*1/,
    );
  });

  it('сохраняет один компактный KPI-ряд на 1024 и две колонки без horizontal scroll на mobile', () => {
    expect(compactDensityCss).toMatch(
      /@media \(max-width: 68rem\)\s*{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/,
    );
    expect(compactDensityCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-command-center-kpis\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(compactDensityCss).toMatch(
      /\.evening-kpi-card:last-child\s*{[^}]*grid-column:\s*1 \/ -1/,
    );
    expect(compactDensityCss).not.toContain('overflow-x: auto');
    expect(startStateCss).toContain('env(safe-area-inset-bottom)');
  });

  it('закрепляет один primary CTA со всеми интерактивными состояниями', () => {
    expect(startStateCss).toMatch(
      /\.evening-not-started-primary\.primary-button\s*{[^}]*min-height:\s*3rem;[^}]*background:\s*linear-gradient\(180deg, #e2b452, #c99132\)/,
    );
    expect(startStateCss).toContain(
      '.evening-not-started-primary.primary-button:hover:not(:disabled)',
    );
    expect(startStateCss).toContain(
      '.evening-not-started-primary.primary-button:active:not(:disabled)',
    );
    expect(startStateCss).toContain('.evening-not-started-primary.primary-button:focus-visible');
    expect(startStateCss).toContain('.evening-not-started-primary.primary-button:disabled');
    expect(reviewSource).toContain('aria-busy={busy}');
  });

  it('сохраняет вызов существующей application-команды и pre-render double-click guard', () => {
    expect(reviewSource).toContain('!tryBeginEveningStart(startRequestRef)');
    expect(reviewSource).toContain(
      'await executeEveningStartChoice(eveningCycle, loadState.snapshot.currentDate, choice)',
    );
    expect(reviewSource).toContain('await service.start(dateKey)');
    expect(reviewSource).toContain('await service.startShort(dateKey)');
    expect(reviewSource).not.toContain('loadState.snapshot.cycle.start(');
  });

  it('не предлагает late SHORT в recovery прошлого дня', () => {
    expect(reviewSource).toContain('loadState.snapshot.isRecoveryReview');
    expect(reviewSource).toMatch(
      /const lateOffer = loadState\.snapshot\.isRecoveryReview\s*\? null\s*: buildLateEveningOffer/,
    );
  });
});
