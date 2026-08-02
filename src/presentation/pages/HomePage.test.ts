import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('показывает успешное подключение постоянного хранилища', () => {
    const markup = renderToStaticMarkup(HomePage({ currentDate: '2026-08-02' }));

    expect(markup).toContain('LifeOS');
    expect(markup).toContain('Локальная система готова');
    expect(markup).toContain('Текущая дата: 2026-08-02');
    expect(markup).toContain('Хранилище: IndexedDB подключена');
    expect(markup).not.toContain('Согласованный запуск действий');
  });
});
