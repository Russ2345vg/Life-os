import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а производственный tsconfig не подключает Node-типы.
import { readFileSync } from 'node:fs';

const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');

describe('Management layout contract', () => {
  it('использует горизонтальную навигацию вместо второго sidebar', () => {
    expect(globalCss).toMatch(
      /\.management-navigation-list\s*{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(globalCss).toMatch(/\.management-navigation\s*{[^}]*border-bottom:/);
    expect(globalCss).toMatch(/\.management-navigation-tab\s*{[^}]*min-height:\s*2\.25rem/);
  });

  it('keeps compact management cards, dialogs and filters scoped to the workspace', () => {
    expect(globalCss).toMatch(/\.management-page\s*{[^}]*--management-radius:\s*0\.7rem/);
    expect(globalCss).toMatch(
      /\.direction-card-open,[\s\S]*?\.project-card-open\s*{[^}]*min-height:\s*7\.25rem/,
    );
    expect(globalCss).toMatch(
      /\.management-dialog\s*{[^}]*max-height:\s*calc\(100dvh[^}]*overflow-y:\s*auto/,
    );
    expect(globalCss).toMatch(
      /\.management-page \.actions-page \.action-filter-field:first-child\s*{[^}]*display:\s*none/,
    );
  });

  it('uses one restrained graphite card system with accessible motion fallbacks', () => {
    expect(globalCss).toMatch(
      /Management patch 15:[\s\S]*?--management-surface:\s*#141715[\s\S]*?--management-gold-soft:\s*#1b1911/,
    );
    expect(globalCss).toMatch(
      /\.management-focus,[\s\S]*?\.management-overview-section\s*{[^}]*border:[^}]*border-radius:[^}]*background:/,
    );
    expect(globalCss).toMatch(
      /\.history-range-panel,[\s\S]*?\.history-timeline-card\s*{[^}]*border-color:\s*var\(--management-border\)[^}]*background:\s*var\(--management-surface\)/,
    );
    expect(globalCss).toMatch(
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation-duration:\s*0\.01ms\s*!important/,
    );
  });

  it('на телефоне укладывает вкладки и карточки без горизонтального переполнения', () => {
    expect(globalCss).toMatch(
      /@media \(max-width:\s*48rem\)[\s\S]*?\.management-navigation-list\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width:\s*30rem\)[\s\S]*?\.management-overview-grid,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(globalCss).toMatch(/\.management-page\s*{[^}]*min-width:\s*0/);
    expect(globalCss).toMatch(
      /\.management-day-section\s*{[^}]*min-width:\s*0[^}]*overflow-x:\s*clip/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width:\s*48rem\)[\s\S]*?\.direction-card-grid,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(globalCss).toMatch(/\.direction-detail\s*{[^}]*overflow-x:\s*clip/);
    expect(globalCss).toMatch(/\.projects-page,[\s\S]*?overflow-x:\s*clip/);
    expect(globalCss).toMatch(
      /@media \(max-width:\s*48rem\)[\s\S]*?\.project-card-grid,[\s\S]*?\.project-detail-layout\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });
});
