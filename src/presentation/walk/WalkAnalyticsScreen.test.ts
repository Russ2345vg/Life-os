import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GetWalkAnalytics } from '../../application';
import { DayDate, type Walk } from '../../domain';
import { FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import { historyWalk } from '../../test/helpers/WalkHistoryFixtures';
const modules = import.meta.glob<typeof import('./WalkAnalyticsScreen')>(
  './WalkAnalyticsScreen.tsx',
  { eager: true },
);
function screen() {
  const module = Object.values(modules)[0];
  expect(module, 'WALK-12 screen is implemented').toBeDefined();
  return module!;
}
const DATE = DayDate.create('2026-08-26');
function query(walks: readonly Walk[] = []) {
  return new GetWalkAnalytics({ findAll: async () => walks }, new FakeCurrentDateProvider(DATE), {
    findByWalkId: async () => [],
  });
}
async function render(walks: readonly Walk[] = []) {
  const view = screen();
  return renderToStaticMarkup(
    createElement(view.WalkAnalyticsView, {
      analytics: await query(walks).execute(),
      onStart: vi.fn(),
      onOpenHistory: vi.fn(),
    }),
  );
}
function paired(count: number) {
  return Array.from({ length: count }, (_, i) =>
    historyWalk(`pair-${i}`, {
      beforeState: { energy: 3, tension: 8, clarity: 4 },
      afterState: { energy: 5, tension: 5, clarity: 6 },
    }),
  );
}

describe('WALK-12 read-only UI', () => {
  it('WALK-13 adds observations with evidence instead of recommendation actions', async () => {
    const markup = await render(paired(8));
    expect(markup).toContain('id="walk-insights-title"');
    expect(markup).toContain('data-walk-insight=');
    expect(markup).toContain('8 из 8');
    expect(markup).not.toContain('Можно попробовать');
  });
  it('shows the exact empty message and existing start action, without misleading KPI zero cards', async () => {
    const markup = await render();
    expect(markup).toContain('Недостаточно данных для аналитики.');
    expect(markup).toContain('Начать прогулку');
    expect(markup).not.toContain('data-walk-analytics-kpi');
  });
  it('renders four KPIs, all modes and the zero-filled day chart as accessible facts', async () => {
    const markup = await render(paired(3));
    expect(markup.match(/data-walk-analytics-kpi=/g)).toHaveLength(4);
    for (const label of [
      'Прогулок',
      'Общее время',
      'Средняя длительность',
      'Дней с прогулкой',
      'Изменение состояния',
      'По режимам',
      'Свободная',
      'Восстановительная',
      'Размышление',
      'Прогулки по дням',
      'Посмотреть прогулки',
      'История за всё время',
    ])
      expect(markup).toContain(label);
    expect(markup.match(/data-walk-analytics-day=/g)).toHaveLength(30);
    expect(markup).not.toMatch(/<(input|textarea|select)\b/);
  });
  it.each([1, 2])(
    'shows numeric facts at %i pairs, but no preliminary/stable interpretation',
    async (count) => {
      const markup = await render(paired(count));
      expect(markup).toContain('Среднее изменение после прогулок');
      expect(markup).toContain('+2');
      expect(markup).not.toMatch(/Предварительное наблюдение|устойчивая закономерность/);
      expect(markup).toContain('Недостаточно данных для сравнения');
    },
  );
  it.each([
    [3, 'Предварительное наблюдение'],
    [7, 'Предварительное наблюдение'],
    [8, 'Наблюдается устойчивая закономерность'],
  ] as const)('uses the per-metric sample threshold at %i pairs', async (count, wording) => {
    expect(await render(paired(count))).toContain(wording);
  });
  it('does not use overall completed count to imply paired observations', async () => {
    const markup = await render([
      ...paired(1),
      ...Array.from({ length: 8 }, (_, i) => historyWalk(`no-state-${i}`)),
    ]);
    expect(markup).toContain('На основе 1 прогулки');
    expect(markup).not.toMatch(/Предварительное наблюдение|устойчивая закономерность/);
  });
  it('keeps missing state distinct from a measured zero and explains legacy intentions', async () => {
    const markup = await render([historyWalk('legacy', { intent: null })]);
    expect(markup).toContain('Нет пар оценок');
    expect(markup).toContain('Без указанного режима');
    expect(markup).not.toMatch(/Предварительное наблюдение|устойчивая закономерность/);
  });
  it('announces loading with an accessible period switch instead of a fake result', () => {
    const markup = renderToStaticMarkup(
      createElement(screen().WalkAnalyticsScreen, {
        getWalkAnalytics: query(),
        currentDate: DATE,
        period: 'last30Days',
        onPeriodChange: vi.fn(),
        onBack: vi.fn(),
        onStart: vi.fn(),
        onOpenHistory: vi.fn(),
      }),
    );
    expect(markup).toContain('Загружаем аналитику');
    expect(markup).toContain('aria-label="Период аналитики"');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>30 дней/);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>7 дней/);
  });
});
