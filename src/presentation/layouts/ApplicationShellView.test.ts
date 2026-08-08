import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DAY_STATUS, DayDate } from '../../domain';
import { APP_SECTION } from '../navigation/AppSection';
import type { AppSection } from '../navigation/AppSection';
import { INTERFACE_DENSITY } from '../settings/localSettings';
import { ApplicationShellView } from './ApplicationShellView';

const CURRENT_DATE = DayDate.create('2026-08-04');

function renderShell(activeSection: AppSection = APP_SECTION.today) {
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
    expect(markup).toContain('Решения');
    expect(markup).toContain('Действия');
    expect(markup).toContain('История');
    expect(markup).toContain('Ещё');
    expect(markup).toContain('День не начат');
    expect(markup).toContain('Локальный режим');
    expect(markup).toContain('Данные хранятся на устройстве');
  });

  it('отмечает активный раздел через aria-current', () => {
    const markup = renderShell(APP_SECTION.actions);

    expect(markup).toContain('aria-current="page"');
    expect(markup).toMatch(/aria-current="page"[^>]*><svg[^>]*>[\s\S]*?<span>Действия<\/span>/);
  });

  it('показывает мобильную навигацию и отдельную кнопку создания', () => {
    const markup = renderShell(APP_SECTION.history);

    expect(markup).toContain('Мобильная навигация');
    expect(markup).toContain('aria-label="Создать решение"');
    expect(markup).toContain('>Создать</span>');
    expect(markup).toContain('Перейти к содержимому');
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
});
