import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а производственный tsconfig не подключает Node-типы.
import { readFileSync } from 'node:fs';

const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const todayPageSource = readFileSync(new URL('./TodayPage.tsx', import.meta.url), 'utf8');

describe('TodayPage layout contract', () => {
  it('ограничивает рабочий холст и строит desktop-сетку примерно 70/30', () => {
    expect(globalCss).toMatch(
      /\/\* Stage 17\.3: structured Today dashboard \*\/[\s\S]*?\.today-page\s*{[^}]*width:\s*min\(calc\(100% - 2rem\),\s*82\.5rem\)[^}]*overflow-x:\s*clip/,
    );
    expect(globalCss).toMatch(
      /@media \(min-width:\s*75rem\)[\s\S]*?\.today-dashboard\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*2\.15fr\) minmax\(18\.75rem,\s*0\.85fr\)/,
    );
  });

  it('собирает главную и боковую колонки из существующих состояний и данных', () => {
    expect(todayPageSource).toContain('className="today-dashboard-main"');
    expect(todayPageSource).toContain('className="today-dashboard-sidebar"');
    expect(todayPageSource).toContain('<TodayStateCard');
    expect(todayPageSource).toContain('<TodayScheduleCard');
    expect(todayPageSource).toContain('<TodayRemindersCard');
    expect(todayPageSource).toContain('<TodayFocusCard');
  });

  it('делает карточку главного Решения вертикально читаемой', () => {
    expect(globalCss).toMatch(
      /\.today-page \.main-decision-list \.decision-card\s*{[^}]*grid-template-columns:\s*3\.5rem minmax\(0,\s*1fr\) auto[^}]*min-height:\s*8rem/,
    );
    expect(todayPageSource).toContain('Ожидаемый результат');
    expect(todayPageSource).toContain("padStart(2, '0')");
  });

  it('выделяет только главное Решение спокойным золотым акцентом', () => {
    expect(globalCss).toMatch(
      /\.today-page \.main-decision-list \.decision-card::before\s*{[^}]*width:\s*3px[^}]*background:\s*var\(--color-accent-gold\)/,
    );
    expect(globalCss).toMatch(
      /\.today-page \.main-decision-list \.decision-card\s*{[^}]*border:\s*1px solid rgb\(199 168 98 \/ 22%\)[^}]*background:\s*linear-gradient\(90deg,\s*rgb\(199 168 98 \/ 10%\),\s*rgb\(199 168 98 \/ 3\.5%\) 34%,\s*transparent 68%\)/,
    );
    expect(globalCss).toMatch(
      /\.today-page \.additional-decision-list \.decision-card\s*{[^}]*border:\s*1px solid rgb\(255 255 255 \/ 6%\)[^}]*background:\s*#151916/,
    );
  });

  it('собирает контент главного Решения сверху вниз и сохраняет компактные действия', () => {
    expect(todayPageSource).toContain('className="decision-card-eyebrow">Главное решение');
    expect(todayPageSource).toContain('className="decision-card-actions"');
    expect(todayPageSource).toContain('className="decision-card-more"');
    expect(globalCss).toMatch(
      /\.today-page \.main-decision-list \.decision-card-title\s*{[^}]*font-size:\s*1\.1875rem[^}]*font-weight:\s*650/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width:\s*34rem\)[\s\S]*?\.today-page \.main-decision-list \.decision-card-actions\s*{[^}]*grid-column:\s*2[^}]*grid-row:\s*1/,
    );
  });

  it('сохраняет компактные зоны нажатия и не растягивает secondary CTA', () => {
    expect(globalCss).toMatch(/\.today-quick-action-list button\s*{[^}]*min-height:\s*2\.875rem/);
    expect(globalCss).toMatch(
      /\.add-main-decision-button\s*{[^}]*width:\s*fit-content[^}]*min-height:\s*2\.625rem/,
    );
  });

  it('сохраняет 44px touch targets у действий закрытого дня', () => {
    expect(globalCss).toMatch(
      /\.today-closed-sphere \.secondary-button\s*{[^}]*min-height:\s*2\.75rem/,
    );
    expect(globalCss).toMatch(
      /\.today-tomorrow-card \.today-closed-primary\s*{[^}]*min-height:\s*2\.75rem/,
    );
  });

  it('на tablet и mobile разворачивает колонки в заданном порядке без горизонтального scroll', () => {
    expect(globalCss).toMatch(
      /@media \(max-width:\s*74\.99rem\)[\s\S]*?\.today-dashboard-main,[\s\S]*?display:\s*contents/,
    );
    expect(globalCss).toMatch(/\.today-quick-actions\s*{[^}]*order:\s*3/);
    expect(globalCss).toMatch(/\.today-focus-card\s*{[^}]*order:\s*4/);
    expect(globalCss).toMatch(/\.today-reminders\s*{[^}]*order:\s*5/);
    expect(globalCss).toMatch(/\.today-schedule-card\s*{[^}]*order:\s*6/);
    expect(globalCss).toMatch(
      /@media \(max-width:\s*34rem\)[\s\S]*?\.today-metrics\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });
});
