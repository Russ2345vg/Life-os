import {
  createElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GOAL_STATUS } from '../../domain';
import { GoalCard } from './GoalCard';
import { GoalAlbumPage, GoalAlbumScreen } from './GoalAlbumPage';
import {
  createGoalAlbumLoadController,
  settleGoalAlbumLoad,
  type GoalAlbumLoadState,
} from './GoalAlbumPageController';
import type { GoalAlbumLoader, GoalAlbumQueries, GoalAlbumSource } from './GoalAlbumLoader';
import type {
  GoalAlbumModel,
  GoalAlbumProgressView,
  GoalCardDirectionView,
  GoalCardViewModel,
} from './goalAlbumPresentation';

const LONG_TITLE =
  'Создать спокойный и устойчивый дом для семьи с пространством для каждого человека и долгими совместными вечерами';
const LONG_NEXT_PROGRESS =
  'Следующий шаг: обсудить план участка, проверить документы и согласовать подробный бюджет строительства';

const ASSIGNED_DIRECTION: GoalCardDirectionView = {
  kind: 'assigned',
  id: 'direction-home',
  name: 'Дом и семья',
  sphere: { id: 'sphere-life', name: 'Жизнь' },
};

function createCard(id: string, overrides: Partial<GoalCardViewModel> = {}): GoalCardViewModel {
  return {
    id,
    title: `Цель ${id}`,
    coverImageUrl: null,
    direction: ASSIGNED_DIRECTION,
    status: GOAL_STATUS.future,
    statusLabel: 'Будущая',
    stageLabel: 'Идея',
    horizonLabel: '1–3 года',
    progress: { kind: 'none', label: 'Прогресс не задан' },
    nextProgress: 'Следующий шаг не задан',
    updatedAtMs: Date.parse('2026-08-23T08:00:00.000Z'),
    ...overrides,
  };
}

function createModel(cards: readonly GoalCardViewModel[]): GoalAlbumModel {
  return {
    counts: { active: 1, future: 2, achieved: 1, total: 4 },
    cards,
  };
}

const noOp = (): void => undefined;

function renderScreen(
  state: GoalAlbumLoadState,
  options: {
    readonly filter?: 'all' | (typeof GOAL_STATUS)[keyof typeof GOAL_STATUS];
    readonly viewMode?: 'grid' | 'by-direction';
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(GoalAlbumScreen, {
      state,
      filter: options.filter ?? 'all',
      viewMode: options.viewMode ?? 'grid',
      onFilterChange: noOp,
      onViewModeChange: noOp,
      onRouteChange: noOp,
      onRetry: noOp,
    }),
  );
}

describe('GoalAlbumScreen', () => {
  it('renders loading as a live status without showing the global empty state', () => {
    const markup = renderScreen({ status: 'loading' });

    expect(markup).toContain('role="status"');
    expect(markup).toContain('Загружаем цели…');
    expect(markup).not.toContain('В Альбоме пока нет целей');
  });

  it('renders a neutral retryable error without technical details', () => {
    const markup = renderScreen({ status: 'error' });

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Не удалось загрузить Альбом целей');
    expect(markup).toContain('>Повторить</button>');
    expect(markup).not.toContain('Error:');
  });

  it('renders the global empty state with a real create href', () => {
    const markup = renderScreen({ status: 'ready', model: createModel([]) });

    expect(markup).toContain('В Альбоме пока нет целей');
    expect(markup).toContain('href="#/goals/new"');
    expect(markup).not.toContain('По выбранному фильтру целей нет');
  });

  it('renders a distinct filter empty state and returns to all goals', () => {
    const markup = renderScreen(
      { status: 'ready', model: createModel([createCard('goal-future')]) },
      { filter: GOAL_STATUS.archived },
    );

    expect(markup).toContain('По выбранному фильтру целей нет');
    expect(markup).toContain('>Показать все</button>');
    expect(markup).not.toContain('В Альбоме пока нет целей');
  });

  it('renders real KPI, separate accessible controls, and flat cards', () => {
    const markup = renderScreen({
      status: 'ready',
      model: createModel([
        createCard('goal-active', {
          title: LONG_TITLE,
          status: GOAL_STATUS.active,
          statusLabel: 'Активная',
        }),
      ]),
    });

    expect(markup).toContain('Альбом целей');
    expect(markup).toContain('href="#/goals/new"');
    expect(markup).toContain('Картина будущего');
    for (const value of ['Активные', 'Будущие', 'Достигнутые', 'Всего целей']) {
      expect(markup).toContain(value);
    }
    expect(markup).toContain('>4</dd>');
    expect(markup).toContain('role="group" aria-label="Фильтр целей по статусу"');
    expect(markup).toContain('role="group" aria-label="Режим отображения целей"');
    for (const label of ['Все', 'Активные', 'Будущие', 'Достигнутые', 'Архив']) {
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('Сетка');
    expect(markup).toContain('По направлениям');
    expect(markup).toContain(LONG_TITLE);
  });

  it('renders real Sphere, Direction, and fallback groups in by-direction mode', () => {
    const markup = renderScreen(
      {
        status: 'ready',
        model: createModel([
          createCard('goal-assigned'),
          createCard('goal-assigned-second'),
          createCard('goal-no-sphere', {
            direction: {
              kind: 'assigned',
              id: 'direction-independent',
              name: 'Свободное направление',
              sphere: null,
            },
          }),
          createCard('goal-unassigned', {
            direction: { kind: 'unassigned', label: 'Без направления' },
          }),
          createCard('goal-missing', {
            direction: { kind: 'missing', label: 'Направление недоступно' },
          }),
        ]),
      },
      { viewMode: 'by-direction' },
    );

    expect(markup).toContain('Жизнь');
    expect(markup).toContain('Дом и семья');
    expect(markup).toContain('Без сферы');
    expect(markup).toContain('Свободное направление');
    expect(markup).toContain('Без направления');
    expect(markup).toContain('Направление недоступно');
    expect(markup).toMatch(/>По направлениям<\/button>/);
    expect(markup).toContain('class="goal-album-sphere-header"');
    expect(markup).toContain('class="goal-album-direction-header"');
    expect(markup).toContain('>2 цели<');
    expect(markup).toContain('goal-album-card-grid goal-album-card-grid--compact');
    expect(markup).toContain('goal-album-card goal-album-card--compact');
  });
});

describe('GoalCard', () => {
  it('uses the compact visual variant only when explicitly requested', () => {
    const card = createCard('goal-compact');

    const defaultMarkup = renderToStaticMarkup(
      createElement(GoalCard, { goal: card, onOpen: noOp }),
    );
    const compactMarkup = renderToStaticMarkup(
      createElement(GoalCard, { goal: card, onOpen: noOp, variant: 'compact' }),
    );

    expect(defaultMarkup).toContain('class="goal-album-card"');
    expect(defaultMarkup).not.toContain('goal-album-card--compact');
    expect(compactMarkup).toContain('goal-album-card goal-album-card--compact');
  });

  it('renders cover, complete content, a real detail href, and metric progress', () => {
    const card = createCard('goal-active', {
      title: LONG_TITLE,
      coverImageUrl: 'data:image/png;base64,AA==',
      status: GOAL_STATUS.active,
      statusLabel: 'Активная',
      stageLabel: 'Активная цель',
      horizonLabel: 'В течение года',
      progress: {
        kind: 'metric',
        label: '68 из 100 %',
        percent: 68,
        current: 68,
        target: 100,
        unit: '%',
      },
      nextProgress: LONG_NEXT_PROGRESS,
    });

    const markup = renderToStaticMarkup(createElement(GoalCard, { goal: card, onOpen: noOp }));

    expect(markup).toContain('href="#/goals/goal-active"');
    expect(markup).toContain(`alt="Обложка цели ${LONG_TITLE}"`);
    expect(markup).toContain(LONG_TITLE);
    expect(markup).toContain('Дом и семья');
    expect(markup).toContain('Активная цель');
    expect(markup).toContain('Активная');
    expect(markup).toContain('В течение года');
    expect(markup).toContain('68 из 100 %');
    expect(markup).toContain('<progress');
    expect(markup).toContain('Следующий шаг');
    expect(markup).toContain(LONG_NEXT_PROGRESS);
  });

  it('renders placeholder, milestone, qualitative, and absent progress honestly', () => {
    const progressCases: readonly {
      readonly id: string;
      readonly progress: GoalAlbumProgressView;
      readonly expected: string;
      readonly hasProgressElement: boolean;
    }[] = [
      {
        id: 'goal-milestones',
        progress: {
          kind: 'milestones',
          label: '3 из 6',
          percent: 50,
          completed: 3,
          total: 6,
        },
        expected: '3 из 6',
        hasProgressElement: true,
      },
      {
        id: 'goal-qualitative',
        progress: { kind: 'qualitative', label: 'В движении' },
        expected: 'В движении',
        hasProgressElement: false,
      },
      {
        id: 'goal-none',
        progress: { kind: 'none', label: 'Прогресс не задан' },
        expected: 'Прогресс не задан',
        hasProgressElement: false,
      },
    ];

    for (const testCase of progressCases) {
      const markup = renderToStaticMarkup(
        createElement(GoalCard, {
          goal: createCard(testCase.id, { progress: testCase.progress }),
          onOpen: noOp,
        }),
      );
      expect(markup).toContain('goal-album-card-cover-placeholder');
      expect(markup).toContain(testCase.expected);
      expect(markup.includes('<progress')).toBe(testCase.hasProgressElement);
    }
  });

  it('intercepts only an unmodified primary click', () => {
    const onOpen = vi.fn<(goalId: string) => void>();
    const anchor = findAnchor(GoalCard({ goal: createCard('goal-active'), onOpen }));
    const primaryPreventDefault = vi.fn();
    const modifiedPreventDefault = vi.fn();

    anchor.props.onClick?.(createClickEvent({ button: 0, preventDefault: primaryPreventDefault }));
    anchor.props.onClick?.(
      createClickEvent({ button: 0, ctrlKey: true, preventDefault: modifiedPreventDefault }),
    );
    anchor.props.onClick?.(createClickEvent({ button: 1, preventDefault: modifiedPreventDefault }));

    expect(primaryPreventDefault).toHaveBeenCalledTimes(1);
    expect(modifiedPreventDefault).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('goal-active');
  });
});

describe('GoalAlbumPage create route', () => {
  it('renders the A3 create loading state without activating A1 album queries during server render', () => {
    const queries = createQueries();
    const markup = renderToStaticMarkup(
      createElement(GoalAlbumPage, {
        ...queries.value,
        getGoalById: { execute: vi.fn().mockResolvedValue(null) },
        createGoal: { execute: vi.fn() },
        updateGoal: { execute: vi.fn() },
        archiveGoal: { execute: vi.fn() },
        deleteGoal: { execute: vi.fn() },
        route: { view: 'create' },
        onRouteChange: noOp,
      }),
    );

    expect(markup).toContain('Новая цель');
    expect(markup).toContain('Загружаем параметры цели…');
    expect(markup).not.toContain('<form');
    expect(queries.calls()).toEqual([0, 0, 0]);
  });

  it('delegates an edit route to its dedicated retryable loader', () => {
    const queries = createQueries();
    const markup = renderToStaticMarkup(
      createElement(GoalAlbumPage, {
        ...queries.value,
        getGoalById: { execute: vi.fn().mockResolvedValue(null) },
        createGoal: { execute: vi.fn() },
        updateGoal: { execute: vi.fn() },
        archiveGoal: { execute: vi.fn() },
        deleteGoal: { execute: vi.fn() },
        route: { view: 'edit', goalId: 'goal-home' },
        onRouteChange: noOp,
      }),
    );

    expect(markup).toContain('Редактирование цели');
    expect(markup).toContain('Загружаем цель…');
    expect(queries.calls()).toEqual([0, 0, 0]);
  });
});

describe('GoalAlbumPage load controller', () => {
  it('loads only the album route and leaves create/detail/edit to their route-specific loaders', () => {
    for (const route of [
      { view: 'create' },
      { view: 'detail', goalId: 'goal-active' },
      { view: 'edit', goalId: 'goal-active' },
    ] as const) {
      const harness = createLoadControllerHarness();

      harness.controller.activate(route);

      expect(harness.load).not.toHaveBeenCalled();
      expect(harness.refresh).not.toHaveBeenCalled();
      expect(harness.published).toEqual([]);
    }

    const albumHarness = createLoadControllerHarness();
    albumHarness.controller.activate({ view: 'album' });
    expect(albumHarness.load).toHaveBeenCalledOnce();
  });

  it('retries with refresh and publishes loading before the refreshed result', async () => {
    const initial = createDeferred<GoalAlbumSource>();
    const refreshed = createDeferred<GoalAlbumSource>();
    const harness = createLoadControllerHarness({
      initial: initial.promise,
      refreshed: refreshed.promise,
    });
    harness.controller.activate({ view: 'album' });

    harness.controller.retry({ view: 'album' });

    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.published).toEqual([{ status: 'loading' }]);

    refreshed.resolve(emptySource());
    await flushPromises();
    expect(harness.published).toEqual([
      { status: 'loading' },
      {
        status: 'ready',
        model: { counts: { active: 0, future: 0, achieved: 0, total: 0 }, cards: [] },
      },
    ]);
    initial.resolve(emptySource());
    await flushPromises();
    expect(harness.published).toHaveLength(2);
  });

  it('prevents late success and late failure from publishing after cleanup', async () => {
    const success = createDeferred<GoalAlbumSource>();
    const successHarness = createLoadControllerHarness({ initial: success.promise });
    successHarness.controller.activate({ view: 'album' });
    successHarness.controller.cancel();
    success.resolve(emptySource());

    const failure = createDeferred<GoalAlbumSource>();
    const failureHarness = createLoadControllerHarness({ initial: failure.promise });
    failureHarness.controller.activate({ view: 'album' });
    failureHarness.controller.cancel();
    failure.reject(new Error('late failure'));
    await flushPromises();

    expect(successHarness.published).toEqual([]);
    expect(failureHarness.published).toEqual([]);
  });

  it('publishes ready and error for current attempts', async () => {
    const readyHarness = createLoadControllerHarness({ initial: Promise.resolve(emptySource()) });
    readyHarness.controller.activate({ view: 'album' });

    const errorHarness = createLoadControllerHarness({
      initial: Promise.reject(new Error('storage unavailable')),
    });
    errorHarness.controller.activate({ view: 'album' });
    await flushPromises();

    expect(readyHarness.published).toEqual([
      {
        status: 'ready',
        model: { counts: { active: 0, future: 0, achieved: 0, total: 0 }, cards: [] },
      },
    ]);
    expect(errorHarness.published).toEqual([{ status: 'error' }]);
  });

  it('cancels an album attempt when a route-specific screen takes over', async () => {
    const oldRoute = createDeferred<GoalAlbumSource>();
    const harness = createLoadControllerHarness({ initial: oldRoute.promise });
    harness.controller.activate({ view: 'album' });

    harness.controller.activate({ view: 'detail', goalId: 'goal-active' });
    oldRoute.resolve(emptySource());
    await flushPromises();

    expect(harness.load).toHaveBeenCalledOnce();
    expect(harness.published).toEqual([]);
  });
});

describe('settleGoalAlbumLoad', () => {
  it('maps a current success to ready and a current rejection to error', async () => {
    const source = emptySource();

    await expect(settleGoalAlbumLoad(Promise.resolve(source), () => true)).resolves.toEqual({
      status: 'ready',
      model: { counts: { active: 0, future: 0, achieved: 0, total: 0 }, cards: [] },
    });
    await expect(
      settleGoalAlbumLoad(Promise.reject(new Error('storage unavailable')), () => true),
    ).resolves.toEqual({ status: 'error' });
  });

  it('drops deferred success and rejection after the request becomes stale', async () => {
    const success = createDeferred<GoalAlbumSource>();
    const failure = createDeferred<GoalAlbumSource>();
    let current = true;
    const settledSuccess = settleGoalAlbumLoad(success.promise, () => current);
    const settledFailure = settleGoalAlbumLoad(failure.promise, () => current);

    current = false;
    success.resolve(emptySource());
    failure.reject(new Error('late failure'));

    await expect(settledSuccess).resolves.toBeNull();
    await expect(settledFailure).resolves.toBeNull();
  });
});

function findAnchor(node: ReactNode): ReactElement<AnchorHTMLAttributes<HTMLAnchorElement>, 'a'> {
  if (isValidElement<AnchorHTMLAttributes<HTMLAnchorElement>>(node) && node.type === 'a') {
    return node as ReactElement<AnchorHTMLAttributes<HTMLAnchorElement>, 'a'>;
  }
  if (!isValidElement<{ readonly children?: ReactNode }>(node)) {
    throw new Error('Expected GoalCard to contain an anchor.');
  }
  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
  for (const child of children) {
    try {
      return findAnchor(child);
    } catch {
      // Continue searching sibling nodes.
    }
  }
  throw new Error('Expected GoalCard to contain an anchor.');
}

function createClickEvent(
  overrides: Partial<
    Pick<
      ReactMouseEvent<HTMLAnchorElement>,
      'altKey' | 'button' | 'ctrlKey' | 'metaKey' | 'preventDefault' | 'shiftKey'
    >
  >,
): ReactMouseEvent<HTMLAnchorElement> {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    preventDefault: noOp,
    shiftKey: false,
    ...overrides,
  } as unknown as ReactMouseEvent<HTMLAnchorElement>;
}

function createQueries(): {
  readonly value: GoalAlbumQueries;
  readonly calls: () => readonly number[];
} {
  let goalCalls = 0;
  let directionCalls = 0;
  let sphereCalls = 0;
  return {
    value: {
      getGoals: {
        execute: async () => {
          goalCalls += 1;
          return [];
        },
      },
      getDirections: {
        execute: async () => {
          directionCalls += 1;
          return [];
        },
      },
      getSpheres: {
        execute: async () => {
          sphereCalls += 1;
          return { active: [], archived: [] };
        },
      },
    },
    calls: () => [goalCalls, directionCalls, sphereCalls],
  };
}

function emptySource(): GoalAlbumSource {
  return { goals: [], directions: [], spheres: { active: [], archived: [] } };
}

function createLoadControllerHarness(
  options: {
    readonly initial?: Promise<GoalAlbumSource>;
    readonly subsequentLoad?: Promise<GoalAlbumSource>;
    readonly refreshed?: Promise<GoalAlbumSource>;
  } = {},
): {
  readonly controller: ReturnType<typeof createGoalAlbumLoadController>;
  readonly load: ReturnType<typeof vi.fn<GoalAlbumLoader['load']>>;
  readonly refresh: ReturnType<typeof vi.fn<GoalAlbumLoader['refresh']>>;
  readonly published: GoalAlbumLoadState[];
} {
  const initial = options.initial ?? Promise.resolve(emptySource());
  const subsequentLoad = options.subsequentLoad ?? initial;
  const refreshed = options.refreshed ?? Promise.resolve(emptySource());
  const load = vi
    .fn<GoalAlbumLoader['load']>()
    .mockReturnValueOnce(initial)
    .mockReturnValue(subsequentLoad);
  const refresh = vi.fn<GoalAlbumLoader['refresh']>().mockReturnValue(refreshed);
  const published: GoalAlbumLoadState[] = [];
  return {
    controller: createGoalAlbumLoadController({
      loader: { load, refresh },
      publish: (state) => published.push(state),
    }),
    load,
    refresh,
    published,
  };
}

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
}

function createDeferred<Value>(): Deferred<Value> {
  let resolvePromise: ((value: Value) => void) | null = null;
  let rejectPromise: ((reason: unknown) => void) | null = null;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value) {
      if (resolvePromise === null) throw new Error('Deferred is already settled.');
      resolvePromise(value);
      resolvePromise = null;
      rejectPromise = null;
    },
    reject(reason) {
      if (rejectPromise === null) throw new Error('Deferred is already settled.');
      rejectPromise(reason);
      resolvePromise = null;
      rejectPromise = null;
    },
  };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}
