import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а производственный tsconfig не подключает Node-типы.
import { readFileSync } from 'node:fs';

const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const tokensCss = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const todayPageSource = readFileSync(new URL('./TodayPage.tsx', import.meta.url), 'utf8');

describe('Animated Day Summary contract', () => {
  it('рендерит четыре информационные KPI-карточки без ложной интерактивности', () => {
    const metricsMarkup = todayPageSource.slice(
      todayPageSource.indexOf('<dl className="today-metrics"'),
      todayPageSource.indexOf('</dl>', todayPageSource.indexOf('<dl className="today-metrics"')),
    );

    expect(metricsMarkup.match(/<Metric/g)).toHaveLength(4);
    expect(metricsMarkup).toContain('label="Решения"');
    expect(metricsMarkup).toContain('label="Действия"');
    expect(metricsMarkup).toContain('label="Время действия"');
    expect(metricsMarkup).toContain('label="Статус дня"');
    expect(metricsMarkup).not.toContain('onClick');
    expect(globalCss).not.toMatch(/\.today-metric\s*{[^}]*cursor:\s*pointer/);
  });

  it('анимирует только фактическую смену значения и сохраняет прежнее значение скрытым от AT', () => {
    expect(todayPageSource).toContain('currentValue.current === value');
    expect(todayPageSource).toContain('className="today-metric-value-previous"');
    expect(todayPageSource).toContain('aria-hidden="true"');
    expect(globalCss).toMatch(
      /@keyframes today-metric-value-exit[\s\S]*?opacity:\s*0[\s\S]*?translateY\(3px\)/,
    );
    expect(globalCss).toMatch(
      /@keyframes today-metric-value-enter[\s\S]*?opacity:\s*0[\s\S]*?translateY\(-3px\)[\s\S]*?translateY\(0\)/,
    );
  });

  it('использует общий motion system для hover, stagger и краткого success feedback', () => {
    expect(tokensCss).toContain('--motion-feedback: 600ms');
    expect(globalCss).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.today-metric:hover\s*{[^}]*translateY\(-1px\)/,
    );
    expect(globalCss).toContain('animation-delay: 105ms');
    expect(globalCss).toContain('animation: today-metric-success var(--motion-feedback)');
    expect(globalCss).not.toMatch(/@keyframes today-metric[^}]*scale\(/);
  });

  it('убирает перемещение, stagger и value transitions в обоих режимах reduced motion', () => {
    expect(globalCss).toMatch(
      /\.application-reduce-motion \.today-metric[\s\S]*?animation:\s*none !important/,
    );
    expect(globalCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.today-metric-value-previous\s*{\s*display:\s*none/,
    );
  });
});
