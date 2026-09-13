import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DAY_STATUS, DayDate } from '../../domain';
import { APP_SECTION } from '../navigation/AppSection';
import type { AppSection } from '../navigation/AppSection';
import { INTERFACE_DENSITY } from '../settings/localSettings';
import { ApplicationMobileMenu, ApplicationShellView } from './ApplicationShellView';

const CURRENT_DATE = DayDate.create('2026-08-04');

function renderShell(activeSection: AppSection = APP_SECTION.today, sidebarCollapsed = false) {
  return renderToStaticMarkup(
    createElement(ApplicationShellView, {
      activeSection,
      currentDate: CURRENT_DATE,
      selectedDate: CURRENT_DATE,
      currentDayStatus: DAY_STATUS.planned,
      onOpenSection: vi.fn(),
      onCreate: vi.fn(),
      interfaceDensity: INTERFACE_DENSITY.comfortable,
      reduceMotion: false,
      showMobileWeekday: true,
      sidebarCollapsed,
      onToggleSidebar: vi.fn(),
      children: createElement('main', null, 'Содержимое раздела'),
    }),
  );
}

describe('ApplicationShellView', () => {
  it('показывает простую настольную навигацию и локальный статус', () => {
    const markup = renderShell();

    expect(markup).toContain('Навигация LifeOS');
    expect(markup).toContain('Основные разделы');
    expect(markup).toContain('День');
    expect(markup).toContain('Управление');
    expect(markup).not.toContain('<span class="application-navigation-label">Решения</span>');
    expect(markup).not.toContain('<span class="application-navigation-label">Действия</span>');
    expect(markup).toContain('Сферы');
    expect(markup).toContain('История');
    expect(markup).toContain('Ещё');
    expect(markup).toContain('День не начат');
    expect(markup).toContain('Локальный режим');
    expect(markup).toContain('Данные хранятся на устройстве');
  });

  it('отмечает активный раздел через aria-current', () => {
    const markup = renderShell(APP_SECTION.management);

    expect(markup).toContain('aria-current="page"');
    expect(markup).toMatch(
      /aria-current="page"[^>]*>[\s\S]*?<span class="application-navigation-label">Управление<\/span>/,
    );
  });

  it('подключает Управление как самостоятельный раздел desktop и mobile', () => {
    const markup = renderShell(APP_SECTION.management);

    expect(markup).toMatch(
      /aria-current="page"[^>]*>[\s\S]*?<span class="application-navigation-label">Управление<\/span>/,
    );
    const mobileNavigation = markup.slice(markup.indexOf('Мобильная навигация'));
    expect(mobileNavigation).toContain(
      '<span class="application-navigation-label">Управление</span>',
    );
  });

  it('сворачивает панель до режима иконок, сохраняя подписи и кнопку разворачивания', () => {
    const markup = renderShell(APP_SECTION.management, true);

    expect(markup).toContain('application-sidebar-collapsed');
    expect(markup).toContain('aria-label="Развернуть боковое меню"');
    expect(markup).toContain('data-tooltip="Управление"');
    expect(markup).toContain('title="Локальный режим"');
    expect(markup).toContain('aria-current="page"');
  });

  it('в развёрнутом состоянии показывает названия и доступную кнопку сворачивания', () => {
    const markup = renderShell(APP_SECTION.today, false);

    expect(markup).not.toContain('application-sidebar-collapsed');
    expect(markup).toContain('aria-label="Свернуть боковое меню"');
    expect(markup).toContain('<span class="application-navigation-label">Сегодня</span>');
  });

  it('сохраняет одноколоночное содержимое Сегодня при обоих состояниях бокового меню', () => {
    const expanded = renderShell(APP_SECTION.today, false);
    const collapsed = renderShell(APP_SECTION.today, true);

    expect(expanded).toContain('Содержимое раздела');
    expect(expanded).not.toContain('application-sidebar-collapsed');
    expect(collapsed).toContain('Содержимое раздела');
    expect(collapsed).toContain('application-sidebar-collapsed');
  });

  it('показывает мобильную навигацию без дублирующих входов и отдельную кнопку создания', () => {
    const markup = renderShell(APP_SECTION.history);

    expect(markup).toContain('Мобильная навигация');
    expect(markup).toContain('aria-label="Создать решение"');
    expect(markup).toContain('>Создать</span>');
    expect(markup).toContain('Перейти к содержимому');
    const mobileNavigation = markup.slice(markup.indexOf('Мобильная навигация'));
    expect(mobileNavigation).not.toContain(
      '<span class="application-navigation-label">Действия</span>',
    );
  });

  it('применяет плотность и уменьшение движения через классы оболочки', () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationShellView, {
        activeSection: APP_SECTION.more,
        currentDate: CURRENT_DATE,
        selectedDate: CURRENT_DATE,
        currentDayStatus: DAY_STATUS.open,
        onOpenSection: vi.fn(),
        onCreate: vi.fn(),
        interfaceDensity: INTERFACE_DENSITY.compact,
        reduceMotion: true,
        showMobileWeekday: false,
        sidebarCollapsed: false,
        onToggleSidebar: vi.fn(),
        children: createElement('main', null, 'Содержимое раздела'),
      }),
    );

    expect(markup).toContain('application-density-compact');
    expect(markup).toContain('application-reduce-motion');
    expect(markup).not.toContain('Вторник');
  });

  it('показывает название текущего раздела и выбранный день в мобильной шапке', () => {
    const markup = renderShell(APP_SECTION.more);

    expect(markup).toContain('Ещё');
    expect(markup).toContain('Сегодня');
    expect(markup).toContain('Вторник');
    expect(markup).toContain('Содержимое раздела');
  });

  it('показывает сферы в настольной навигации, сохраняя мобильный доступ через «Ещё»', () => {
    const markup = renderShell(APP_SECTION.spheres);

    expect(markup).toMatch(
      /aria-current="page"[^>]*>[\s\S]*?<span class="application-navigation-label">Сферы<\/span>/,
    );
    const mobileNavigation = markup.slice(markup.indexOf('Мобильная навигация'));
    expect(mobileNavigation).toContain('<span class="application-navigation-label">Ещё</span>');
    expect(mobileNavigation).not.toContain(
      '<span class="application-navigation-label">Сферы</span>',
    );
  });

  it('показывает Прогулки в desktop sidebar и mobile menu, но не в фиксированной нижней панели', () => {
    const markup = renderShell(APP_SECTION.walks);
    const bottomNavigation = markup.slice(markup.indexOf('Мобильная навигация'));
    const mobileMenu = renderToStaticMarkup(
      createElement(ApplicationMobileMenu, {
        activeSection: APP_SECTION.walks,
        currentDayStatus: DAY_STATUS.open,
        onOpenSection: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(markup).toMatch(
      /aria-current="page"[^>]*>[\s\S]*?<span class="application-navigation-label">Прогулки<\/span>/,
    );
    expect(bottomNavigation).not.toContain(
      '<span class="application-navigation-label">Прогулки</span>',
    );
    expect(mobileMenu).toContain('<span class="application-navigation-label">Прогулки</span>');
    expect(mobileMenu).toContain('aria-current="page"');
  });

  it('показывает основной Сегодня на desktop и mobile без временного пункта V2', () => {
    const desktop = renderShell(APP_SECTION.today);
    const mobileMenu = renderToStaticMarkup(
      createElement(ApplicationMobileMenu, {
        activeSection: APP_SECTION.today,
        currentDayStatus: DAY_STATUS.open,
        onOpenSection: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    for (const markup of [desktop, mobileMenu]) {
      expect(markup).toContain('aria-label="Сегодня"');
      expect(markup).toContain('<span class="application-navigation-label">Сегодня</span>');
      expect(markup).not.toContain('V2 Планировщик');
    }
    expect(desktop.slice(desktop.indexOf('Мобильная навигация'))).toContain('aria-label="Сегодня"');
  });

  it('готовит мобильное меню поверх страницы с управлением закрытием', () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationMobileMenu, {
        activeSection: APP_SECTION.management,
        currentDayStatus: DAY_STATUS.open,
        onOpenSection: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(markup).toContain('application-mobile-menu-backdrop');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Закрыть меню"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('<span class="application-navigation-label">Управление</span>');
    expect(markup).not.toContain('<span class="application-navigation-label">Решения</span>');
    expect(markup).not.toContain('<span class="application-navigation-label">Действия</span>');
  });
});
