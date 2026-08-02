import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StartupPage } from './StartupPage';

describe('StartupPage', () => {
  it('показывает состояние загрузки локальной системы', () => {
    const markup = renderToStaticMarkup(StartupPage({ status: 'loading' }));

    expect(markup).toContain('LifeOS');
    expect(markup).toContain('Загрузка локальной системы…');
  });

  it('показывает понятное состояние ошибки вместо пустого экрана', () => {
    const markup = renderToStaticMarkup(StartupPage({ status: 'error' }));

    expect(markup).toContain('Не удалось запустить локальную систему.');
    expect(markup).toContain('Обновите страницу.');
  });
});
