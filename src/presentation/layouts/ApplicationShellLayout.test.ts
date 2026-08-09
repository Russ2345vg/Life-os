import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а производственный tsconfig не подключает Node-типы.
import { readFileSync } from 'node:fs';

const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');

describe('ApplicationShell layout contract', () => {
  it('выделяет панели ровно 68 px и отдаёт остальную ширину содержимому', () => {
    expect(globalCss).toMatch(
      /\.application-shell\.application-sidebar-collapsed\s*{[^}]*--application-sidebar-width:\s*4\.25rem/,
    );
    expect(globalCss).toMatch(
      /grid-template-columns:\s*var\(--application-sidebar-width\)\s+minmax\(0,\s*1fr\)/,
    );
    expect(globalCss).toMatch(/\.application-stage\s*{[^}]*width:\s*100%[^}]*min-width:\s*0/);
  });

  it('не допускает горизонтальную прокрутку и сохраняет зоны нажатия 44 px', () => {
    expect(globalCss).toMatch(/body\s*{[^}]*overflow-x:\s*clip/);
    expect(globalCss).toMatch(/\.application-shell\s*{[^}]*overflow-x:\s*clip/);
    expect(globalCss).toMatch(
      /\.application-sidebar-toggle,[\s\S]*?\.application-mobile-menu-button\s*{[^}]*min-width:\s*2\.75rem[^}]*min-height:\s*2\.75rem/,
    );
  });

  it('на телефоне скрывает настольную панель и открывает меню поверх страницы', () => {
    expect(globalCss).toMatch(
      /@media \(max-width:\s*60rem\)[\s\S]*?\.application-desktop-sidebar\s*{\s*display:\s*none/,
    );
    expect(globalCss).toMatch(
      /\.application-mobile-menu-backdrop\s*{[^}]*position:\s*fixed[^}]*inset:\s*0/,
    );
    expect(globalCss).toMatch(/\.application-mobile-menu\s*{[^}]*height:\s*100dvh/);
  });
});
