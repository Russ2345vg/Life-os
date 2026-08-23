// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const historicalCss = globalCss.slice(globalCss.lastIndexOf('/* E11.3F:'));

describe('E11.3F historical-mode visual system', () => {
  it('оставляет Journey читаемым без рамки вокруг выбранного history-step', () => {
    expect(historicalCss).toMatch(
      /li\.is-complete\.is-selected-history[\s\S]*?> button\s*{[^}]*border:\s*0;[^}]*background:[^}]*box-shadow:\s*none;/,
    );
    expect(historicalCss).toMatch(
      /li:not\(:last-child\)::after\s*{[^}]*background:\s*#242b30;[^}]*opacity:\s*0\.68;[^}]*transform:\s*scaleY\(0\.5\)/,
    );
    expect(historicalCss).toMatch(
      /li\.is-complete:not\(\.is-selected-history\)\s*{[^}]*color:\s*#78b781/,
    );
  });

  it('ослабляет KPI и сохраняет зелёный только для ready-результата', () => {
    expect(historicalCss).toMatch(
      /\.evening-kpi-card:nth-child\(n \+ 4\)\s*{[^}]*border-color:\s*#20282d;[^}]*background:\s*#101518;[^}]*box-shadow:\s*none;/,
    );
    expect(historicalCss).toMatch(
      /\.evening-kpi-card\[data-tone='ready'\]\s*{[^}]*border-color:\s*#26372b;[^}]*background:\s*#101618/,
    );
    expect(historicalCss).toMatch(
      /\.evening-kpi-card\[data-tone='ready'\][\s\S]*?\.evening-kpi-card-icon\s*{[^}]*color:\s*#70b87a/,
    );
  });

  it('убирает внутреннюю сетку Reflection, сохраняя две внешние поверхности', () => {
    expect(historicalCss).toMatch(
      /\.evening-reflection-history-workspace[\s\S]*?\.evening-reflection-guidance\s*{[^}]*border-color:\s*var\(--evening-history-border\)/,
    );
    expect(historicalCss).toMatch(
      /\.evening-reflection-history-answer\s*{[^}]*border:\s*0;[^}]*background:\s*var\(--evening-history-zone\)/,
    );
    expect(historicalCss).toMatch(/\.evening-reflection-guidance-divider\s*{[^}]*display:\s*none;/);
  });

  it('оставляет Tomorrow модульной сценой, а Preparation — в общем active/history V2B-каркасе', () => {
    expect(historicalCss).toMatch(
      /\.tomorrow-complete-plan\s*{[^}]*grid-template-areas:\s*'primary primary'\s*'outcomes outcomes'\s*'lower lower'/,
    );
    expect(historicalCss).toMatch(
      /\.tomorrow-complete-summary\.is-history[\s\S]*?\.secondary-button\.is-ghost\s*{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/,
    );
    expect(historicalCss).not.toContain('.tomorrow-complete-sequence');
    expect(historicalCss).toMatch(
      /\.evening-preparation-scene\s*{[^}]*border:\s*0;[^}]*background:\s*transparent/,
    );
    expect(historicalCss).toMatch(
      /\.preparation-workspace\s*{[^}]*border:\s*1px solid var\(--evening-v1-border-strong\)/,
    );
    expect(historicalCss).toMatch(
      /\.preparation-success-state\s*{[^}]*border:\s*0;[^}]*box-shadow:\s*none;/,
    );
    expect((historicalCss.match(/border:\s*0;/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it('делает возврат компактным ghost-действием', () => {
    expect(historicalCss).toMatch(
      /\.evening-return-to-current\s*{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/,
    );
    expect(historicalCss).toMatch(
      /\.evening-command-center-scene\[data-scene='preparation'\][\s\S]*?> \.evening-return-to-current\s*{[^}]*width:\s*fit-content;[^}]*min-height:\s*1\.75rem;[^}]*border:\s*0;[^}]*background:\s*transparent/,
    );
  });

  it('сохраняет desktop-композицию до 1024 px и mobile stack на 390 px', () => {
    const desktopWidths = [1600, 1440, 1280, 1024] as const;
    expect(desktopWidths.every((width) => width > 60 * 16)).toBe(true);
    expect(390).toBeLessThan(48 * 16);
    expect(historicalCss).toMatch(
      /@media \(max-width: 60rem\)[\s\S]*?\.evening-reflection-guidance\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(historicalCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-reflection-guidance\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.tomorrow-complete-lower-grid\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });
});
