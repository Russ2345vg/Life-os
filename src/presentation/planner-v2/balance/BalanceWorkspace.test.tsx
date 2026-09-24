import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Direction, Sphere, Goal, EntityId } from '../../../domain';
import type { BalanceState } from '../../../application/ports/BalanceRepository';
import type { BalanceServices } from '../../../application/balance/BalanceServices';
import { validateIndicator } from '../../../domain/balance/DirectionIndicator';
import { BalanceWorkspace } from './BalanceWorkspace';
import { BalanceIndicatorForm } from './BalanceIndicatorForm';
import { BalanceEntityForm } from './BalanceEntityForm';
import { useBalanceState } from './useBalanceState';
import type { PlannerRoute } from '../PlannerNavigation';
vi.mock('./useBalanceState', () => ({ useBalanceState: vi.fn() }));
const now = new Date('2026-09-14T12:00:00Z');
const unexpected = vi.fn(async () => {
  throw new Error('Rendering must not mutate state');
});
const services: BalanceServices = {
  read: { execute: unexpected },
  indicators: { save: unexpected, remove: unexpected },
  createSphere: { execute: unexpected },
  updateSphere: { execute: unexpected },
  createDirection: { execute: unexpected },
  updateDirection: { execute: unexpected },
  archiveSphere: { execute: unexpected },
  archiveDirection: { execute: unexpected },
  restoreSphere: { execute: unexpected },
  restoreDirection: { execute: unexpected },
  deletePilotSphere: { execute: unexpected },
  deletePilotDirection: { execute: unexpected },
  removeDirectionSafely: { inspect: unexpected, execute: unexpected },
  refreshSnapshots: unexpected,
};
function data(): BalanceState {
  const sphere = Sphere.create({
    id: EntityId.create('s'),
    name: 'Здоровье',
    now,
    desiredLevel: 8,
    includeInBalanceWheel: true,
    importance: 'high',
  });
  const direction = Direction.create({
    id: EntityId.create('d'),
    name: 'Сон',
    sphereId: sphere.id,
    now,
    mode: 'maintain',
    manualScore: 7.5,
  });
  const indicator = validateIndicator({
    id: 'indicator:d:0',
    directionId: 'd',
    name: 'Самочувствие',
    type: 'rating',
    value: 4,
    target: null,
    importance: 'normal',
    sourceType: 'manual',
    sourceGoalId: null,
    removed: false,
    version: 1,
    schemaVersion: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  return {
    spheres: [sphere],
    directions: [direction],
    goals: [],
    actions: [],
    indicators: [indicator],
    snapshots: [],
    periods: [],
    memberships: [],
    decisions: [],
    contributions: [],
  };
}
function withState(state: BalanceState | null, error: string | null = null) {
  vi.mocked(useBalanceState).mockReturnValue({
    state,
    error,
    load: async () => {},
    refresh: () => {},
  });
}
function screen(route: PlannerRoute) {
  return renderToStaticMarkup(
    <BalanceWorkspace services={services} today="2026-09-14" route={route} onNavigate={() => {}} />,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  withState(data());
});
describe('balance screens and compact editors', () => {
  it('offers creation when only archived spheres remain', () => {
    const state = data();
    withState({
      ...state,
      spheres: [state.spheres[0]!.archive(now)],
      directions: [],
      indicators: [],
    });
    const html = screen({ view: 'spheres' });
    expect(html).toContain('Создать первую сферу');
    expect(html).not.toContain('Колесо состояния жизни:');
    expect(unexpected).not.toHaveBeenCalled();
  });
  it('offers selection before rating and distinguishes zero from missing scores', () => {
    const state = data();
    const sphere = state.spheres[0]!;
    withState({
      ...state,
      spheres: [sphere.update({ name: sphere.name, includeInBalanceWheel: false }, now)],
    });
    expect(screen({ view: 'spheres' })).toContain('Выбрать сферы');
    withState({ ...state, directions: [], indicators: [] });
    const empty = screen({ view: 'spheres' });
    expect(empty).toContain('Оценить первую сферу');
    expect(empty).toContain('Контекст целей');
    expect(empty).toContain('Квартал');
    expect(empty).toContain('Недостаточно данных для сравнения');
    expect(empty).not.toContain('Колесо состояния жизни:');
    withState({
      ...state,
      directions: [],
      indicators: [],
      spheres: [
        sphere.update({ name: sphere.name, manualScore: 0 }, now),
        Sphere.create({
          id: EntityId.create('missing'),
          name: 'Работа',
          includeInBalanceWheel: true,
          now,
        }),
      ],
    });
    const partial = screen({ view: 'spheres' });
    expect(partial).toContain('Оценено 1 из 2 сфер');
    expect(partial).toContain('Оценить следующую сферу');
    expect(partial).toContain('Здоровье: 0.0 из 10');
  });
  it('requires a desired level before declaring no deficit', () => {
    const state = data();
    withState({
      ...state,
      spheres: [state.spheres[0]!.update({ name: 'Здоровье', desiredLevel: null }, now)],
    });
    expect(screen({ view: 'spheres' })).toContain('Недостаточно данных для сравнения');
    withState({
      ...state,
      spheres: [state.spheres[0]!.update({ name: 'Здоровье', desiredLevel: 7 }, now)],
    });
    expect(screen({ view: 'spheres' })).toContain('Среди оценённых сфер дефицита не выявлено');
    expect(screen({ view: 'spheres' })).toContain('Оценено 1 из 1 сфер');
  });
  it('renders a sphere without directions with only a manual score', () => {
    const state = data();
    withState({
      ...state,
      directions: [],
      indicators: [],
      spheres: [state.spheres[0]!.update({ name: 'Здоровье', manualScore: 6.5 }, now)],
    });
    const html = screen({ view: 'sphere', id: 's' });
    expect(html).toContain('Пока нет направлений');
    expect(html).toContain('Автоматически: Нет данных');
    expect(html).toContain('Вручную: 6.5');
  });
  it('renders develop without indicators as unknown state', () => {
    const state = data();
    withState({
      ...state,
      indicators: [],
      directions: [
        state.directions[0]!.update({ name: 'Сон', mode: 'develop', manualScore: null }, now),
      ],
    });
    const html = screen({ view: 'direction', id: 'd' });
    expect(html).toContain('Развиваю');
    expect(html).toContain('Добавьте до пяти показателей');
    expect(html).toContain('Нет данных');
  });
  it('renders period context, recommendations and wheel settings without writing goals', () => {
    const html = screen({ view: 'spheres' });
    expect(html).toMatch(/aria-pressed="true"[^>]*>Квартал/);
    expect(html).toContain('Сферы жизни');
    expect(html).toContain('Требует внимания');
    for (const label of [
      'Год',
      '30 дней',
      'Неделя',
      'Настроить колесо',
      'Рекомендуемый фокус',
      '4 целей',
    ])
      expect(html).toContain(label);
    expect(unexpected).not.toHaveBeenCalled();
  });
  it('separates manual and automatic state and carries sphere filter into Goals and Plans', () => {
    const html = screen({ view: 'sphere', id: 's' });
    for (const label of [
      '7.5',
      'Автоматически:',
      'Нет данных',
      '#/v2/goals?sphereId=s',
      '#/v2/goals?sphereId=s&amp;period=week',
    ])
      expect(html).toContain(label);
    const detail = screen({ view: 'direction', id: 'd' });
    expect(detail).toContain('Автоматически: 4.0');
    expect(detail).toContain('Вручную: 7.5');
  });
  it.each(['active', 'paused', 'archived'] as const)(
    'renders %s maintain direction without inventing a goal',
    (status) => {
      const state = data();
      withState({
        ...state,
        directions: [state.directions[0]!.update({ name: 'Сон', status }, now)],
      });
      const html = screen({ view: 'direction', id: 'd' });
      expect(html).toContain('Поддерживаю');
      expect(html).toContain(
        { active: 'Активно', paused: 'На паузе', archived: 'В архиве' }[status],
      );
      expect(html).toContain('Поддерживать направление можно без активной цели.');
    },
  );
  it('explains unavailable sources and undated goals instead of a blank active section', () => {
    const state = data();
    withState({
      ...state,
      goals: [
        Goal.create({
          id: EntityId.create('g'),
          title: 'Без срока',
          status: 'active',
          directionId: EntityId.create('d'),
          now,
        }),
      ],
      indicators: [
        { ...state.indicators[0]!, sourceType: 'quantitativeGoal', sourceGoalId: 'gone' },
      ],
    });
    const html = screen({ view: 'direction', id: 'd' });
    expect(html).toContain('Источник недоступен');
    expect(html).toContain('<div class="balance-row"><a href="#/v2/goals/g">Без срока</a>');
    expect(html).toContain('Нет данных');
  });
  it('renders voice fields, lifecycle choices and only the selected indicator inputs', () => {
    const state = data();
    const entity = renderToStaticMarkup(
      <BalanceEntityForm
        kind="direction"
        entity={state.directions[0]!}
        sphereId="s"
        spheres={state.spheres}
        services={services}
        onSaved={async () => {}}
        onCancel={() => {}}
      />,
    );
    for (const text of [
      'Текущее состояние',
      'Желаемое состояние',
      'Голосовой ввод',
      'На паузе',
      'Ручная оценка',
    ])
      expect(entity).toContain(text);
    const indicator = renderToStaticMarkup(
      <BalanceIndicatorForm
        indicator={{
          ...state.indicators[0]!,
          sourceType: 'quantitativeGoal',
          sourceGoalId: 'gone',
        }}
        directionId="d"
        goals={[]}
        services={services}
        onSaved={async () => {}}
        onCancel={() => {}}
      />,
    );
    expect(indicator).toContain('Источник недоступен');
    expect(indicator).not.toContain('Порог');
    expect(indicator).not.toContain('type="number"');
  });
  it('renders loading, retry and empty states', () => {
    withState(null);
    expect(screen({ view: 'spheres' })).toContain('Загружаем сферы');
    withState(null, 'Ошибка чтения');
    expect(screen({ view: 'spheres' })).toContain('Ошибка чтения');
    withState({ ...data(), spheres: [], directions: [], indicators: [] });
    expect(screen({ view: 'spheres' })).toContain('Пока нет сфер');
  });
});
