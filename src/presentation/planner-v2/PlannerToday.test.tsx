import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../domain';
import { PlannerToday } from './PlannerToday';
import { HouseholdTaskList } from './HouseholdTaskList';
import {
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';

describe('Planner Today', () => {
  it('shows the action sphere and direction in the day plan', () => {
    const date = DayDate.create('2026-09-13');
    const action = LifeAction.createDraft({
      id: EntityId.create('invest-action'),
      title: LifeActionTitle.create('Изучить инвестиции'),
      sphereId: EntityId.create('finance'),
      directionId: EntityId.create('investing'),
      plannedDate: date,
      createdAt: new Date('2026-09-13T08:00:00Z'),
      eventId: EntityId.create('invest-action-created'),
    });
    const html = renderToStaticMarkup(
      createElement(PlannerToday, {
        date,
        day: 'today',
        overview: { main: null, actions: [action], unscheduled: [], completed: [], overdue: [] },
        goals: [],
        directions: [{ id: 'investing', title: 'Инвестиции', sphereId: 'finance' }],
        spheres: [{ id: 'finance', title: 'Финансы' }],
        availableActions: [action],
        monthlyDirectionFocus: {
          month: '2026-09',
          hasCurrent: false,
          directionId: null,
          directionLabel: null,
          suggestion: null,
          choices: [],
        },
        busy: false,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMonthlyDirectionChange: vi.fn(),
        onComplete: vi.fn(),
        onPlan: vi.fn(),
        onReschedule: async () => {},
        onQuickAdd: async () => {},
        onNewAction: vi.fn(),
        onOpenSleep: vi.fn(),
      }),
    );

    expect(html).toContain('planner-action-context');
    expect(html).toContain('aria-describedby="planner-action-context-invest-action"');
    expect(html).toContain('Сфера</span> Финансы');
    expect(html).toContain('Направление</span> Инвестиции');
  });

  it('shows scheduled hours, known workload and remaining unknown estimates', () => {
    const date = DayDate.create('2026-09-13');
    const timed = createLifeActionDraft('today-timed');
    timed.setPlan(date, false);
    timed.setTimePlanning({
      estimateMinutes: 90,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    });
    const unknown = createLifeActionDraft('today-unknown');
    unknown.setPlan(date, false);
    const html = renderToStaticMarkup(
      createElement(PlannerToday, {
        date,
        day: 'today',
        overview: {
          main: null,
          actions: [timed, unknown],
          unscheduled: [],
          completed: [],
          overdue: [],
        },
        goals: [],
        availableActions: [timed, unknown],
        monthlyDirectionFocus: {
          month: '2026-09',
          hasCurrent: false,
          directionId: null,
          directionLabel: null,
          suggestion: null,
          choices: [],
        },
        busy: false,
        capacityMinutes: 120,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMonthlyDirectionChange: vi.fn(),
        onComplete: vi.fn(),
        onPlan: vi.fn(),
        onReschedule: async () => {},
        onQuickAdd: async () => {},
        onNewAction: vi.fn(),
        onOpenSleep: vi.fn(),
      }),
    );
    expect(html).toContain('10:00–11:00');
    expect(html).toContain('План: 1 ч');
    expect(html).toContain('Доступно: 2 ч');
    expect(html).toContain('Без оценки: 1');
    expect(html).toContain('#/v2/actions?view=calendar');
  });

  it('presents the day plan as one compact center with visible status', () => {
    const date = DayDate.create('2026-09-13');
    const main = createLifeActionDraft('main');
    main.setPlan(date, true);
    const planned = createLifeActionDraft('planned');
    planned.setPlan(date, false);
    const completed = createLifeActionDraft('completed');
    const html = renderToStaticMarkup(
      createElement(PlannerToday, {
        date,
        day: 'today',
        overview: {
          main,
          actions: [planned],
          unscheduled: [],
          completed: [completed],
          overdue: [],
        },
        goals: [],
        availableActions: [main, planned, completed],
        monthlyDirectionFocus: {
          month: '2026-09',
          hasCurrent: false,
          directionId: null,
          directionLabel: null,
          suggestion: null,
          choices: [],
        },
        busy: false,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMonthlyDirectionChange: vi.fn(),
        onComplete: vi.fn(),
        onPlan: vi.fn(),
        onReschedule: async () => {},
        onQuickAdd: async () => {},
        onNewAction: vi.fn(),
        onOpenSleep: vi.fn(),
      }),
    );

    expect(html).toContain('planner-day-center__header');
    expect(html).toContain('Центр дня');
    expect(html).toContain('План на сегодня');
    expect(html).toContain('В плане <strong>2</strong>');
    expect(html).toContain('Готово <strong>1</strong>');
    expect(html).toContain('Утренний ритуал');
    expect(html).toContain('0 / 60 мин');
    expect(html).toContain('Главная задача дня');
    expect(html.indexOf('planner-day-center__header')).toBeLessThan(
      html.indexOf('aria-label="Новое действие на сегодня"'),
    );
  });

  it('renders an optional main, collapsed completed and an accessible quick add', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerToday, {
        date: DayDate.create('2026-09-13'),
        day: 'today',
        overview: { main: null, actions: [], unscheduled: [], completed: [], overdue: [] },
        goals: [],
        availableActions: [],
        monthlyDirectionFocus: {
          month: '2026-09',
          hasCurrent: false,
          directionId: null,
          directionLabel: null,
          suggestion: null,
          choices: [],
        },
        busy: false,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMonthlyDirectionChange: vi.fn(),
        onComplete: vi.fn(),
        onPlan: vi.fn(),
        onReschedule: async () => {},
        onQuickAdd: async () => {},
        onNewAction: vi.fn(),
        onOpenSleep: vi.fn(),
      }),
    );
    expect(html).toContain('Сегодня');
    expect(html).toContain('aria-label="Новое действие на сегодня"');
    expect(html).toContain('Выполнено');
    expect(html).not.toContain('<details open');
    expect(html).not.toContain('Начать');
    expect(html).not.toContain('Главное действие');
    expect(html).toContain('Подготовка ко сну');
    expect(html).toContain('Прогресс дня');
    expect(html).toContain('planner-today-sidebar');
    // Keyboard and screen-reader order follows the plan-first visual workflow.
    expect(html.indexOf('aria-label="План на день"')).toBeLessThan(
      html.indexOf('aria-label="Новое действие на сегодня"'),
    );
    expect(html.indexOf('aria-label="Новое действие на сегодня"')).toBeLessThan(
      html.indexOf('На сегодня пока ничего не запланировано.'),
    );
    expect(html.indexOf('На сегодня пока ничего не запланировано.')).toBeLessThan(
      html.indexOf('id="planner-month-direction"'),
    );
    expect(html.indexOf('planner-today-sidebar')).toBeLessThan(
      html.indexOf('id="planner-month-direction"'),
    );
  });

  it('makes creating a tomorrow action explicit', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerToday, {
        date: DayDate.create('2026-09-14'),
        day: 'tomorrow',
        overview: { main: null, actions: [], unscheduled: [], completed: [], overdue: [] },
        goals: [],
        availableActions: [],
        monthlyDirectionFocus: {
          month: '2026-09',
          hasCurrent: false,
          directionId: null,
          directionLabel: null,
          suggestion: null,
          choices: [],
        },
        busy: false,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMonthlyDirectionChange: vi.fn(),
        onComplete: vi.fn(),
        onPlan: vi.fn(),
        onReschedule: async () => {},
        onQuickAdd: async () => {},
        onNewAction: vi.fn(),
        onOpenSleep: vi.fn(),
      }),
    );

    expect(html).toContain('План на завтра');
    expect(html).toContain('placeholder="Что нужно сделать?"');
    expect(html).toContain('>Создать</button>');
    expect(html).toContain('>Создать с параметрами</button>');
    expect(html).not.toContain('>⋯</button>');
  });

  it('marks the existing sleep entry active during the preparation window', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerToday, {
        date: DayDate.create('2026-09-13'),
        day: 'today',
        overview: { main: null, actions: [], unscheduled: [], completed: [], overdue: [] },
        goals: [],
        availableActions: [],
        monthlyDirectionFocus: {
          month: '2026-09',
          hasCurrent: false,
          directionId: null,
          directionLabel: null,
          suggestion: null,
          choices: [],
        },
        busy: false,
        sleepEntry: {
          active: true,
          cycleDate: '2026-09-13',
          startsAt: new Date('2026-09-13T12:00:00.000Z'),
          closesAt: new Date('2026-09-13T22:00:00.000Z'),
        },
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMonthlyDirectionChange: vi.fn(),
        onComplete: vi.fn(),
        onPlan: vi.fn(),
        onReschedule: async () => {},
        onQuickAdd: async () => {},
        onNewAction: vi.fn(),
        onOpenSleep: vi.fn(),
      }),
    );

    expect(html).toContain('planner-sleep-entry--active');
    expect(html).toContain('Вечерняя подготовка уже доступна');
  });
});

describe('Today unfinished previous days', () => {
  const date = DayDate.create('2026-09-24');
  const past = DayDate.create('2026-09-23');
  const draft = createLifeActionDraft('past-draft');
  draft.setPlan(past, true);
  const ready = createReadyLifeAction('past-ready', past);
  const running = markLifeActionInProgress(createReadyLifeAction('past-running', past));
  const render = (day: 'today' | 'tomorrow', actions = [draft], busy = false) =>
    renderToStaticMarkup(
      createElement(PlannerToday, {
        date,
        day,
        overview: { main: null, actions: [], unscheduled: [], completed: [], overdue: actions },
        goals: [],
        availableActions: actions,
        monthlyDirectionFocus: {
          month: '2026-09',
          hasCurrent: false,
          directionId: null,
          directionLabel: null,
          suggestion: null,
          choices: [],
        },
        busy,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMonthlyDirectionChange: vi.fn(),
        onComplete: vi.fn(),
        onPlan: vi.fn(),
        onReschedule: async () => {},
        onQuickAdd: async () => {},
        onNewAction: vi.fn(),
        onOpenSleep: vi.fn(),
      }),
    );

  it('exposes previous tasks with three decisions without counting them in today progress', () => {
    const html = render('today');
    expect(html).toContain('Осталось с прошлых дней');
    expect(html).toContain('Разобрать план');
    expect(html).toContain('planner-plan-review');
    expect(html).toContain('Действие past-draft');
    expect(html).toContain('23 сентября 2026 г.');
    expect(html).toContain('На сегодня');
    expect(html).toContain('Выбрать дату');
    expect(html).toContain('Убрать из плана');
    expect(html).toContain('0 из 0');
    expect(html).not.toContain('Главное действие</h2>');
  });

  it('hides the block when empty or viewing tomorrow', () => {
    expect(render('today', [])).not.toContain('Осталось с прошлых дней');
    expect(render('tomorrow')).not.toContain('Осталось с прошлых дней');
  });

  it('keeps legacy tasks visible without offering forbidden date changes', () => {
    const readyHtml = render('today', [ready]);
    expect(readyHtml).toContain('Выбрать дату');
    expect(readyHtml).not.toContain('Убрать из плана');
    const runningHtml = render('today', [running]);
    expect(runningHtml).toContain('Действие past-running');
    expect(runningHtml).toContain('Действие уже выполняется');
    expect(runningHtml).not.toContain('Выбрать дату');
    expect(runningHtml).not.toContain('Убрать из плана');
  });
});

describe('Today household list', () => {
  const render = (
    includeHousehold = true,
    mainHousehold = false,
    day: 'today' | 'tomorrow' = 'today',
  ) => {
    const date = DayDate.create('2026-10-09');
    const ordinary = createLifeActionDraft('ordinary', { sphereId: EntityId.create('home') });
    ordinary.setPlan(date, false);
    const household = createLifeActionDraft(
      'plan-import:household-2026-10-v1:actions:t001-2026-10-09',
    );
    household.setPlan(date, false);
    const done = createLifeActionDraft('plan-import:household-2026-10-v1:actions:t002-2026-10-09');
    const main = createLifeActionDraft('plan-import:household-2026-10-v1:actions:main');
    main.setPlan(date, true);
    return renderToStaticMarkup(
      createElement(PlannerToday, {
        date,
        day,
        overview: {
          main: mainHousehold ? main : null,
          actions: includeHousehold ? [ordinary, household] : [ordinary],
          completed: includeHousehold ? [done] : [],
          unscheduled: [],
          overdue: [],
        },
        goals: [],
        availableActions: [ordinary, household, done, ...(mainHousehold ? [main] : [])],
        spheres: [{ id: 'home', title: 'Дом' }],
        monthlyDirectionFocus: {
          month: '2026-10',
          hasCurrent: false,
          directionId: null,
          directionLabel: null,
          suggestion: null,
          choices: [],
        },
        busy: false,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMonthlyDirectionChange: vi.fn(),
        onComplete: vi.fn(),
        onPlan: vi.fn(),
        onReschedule: async () => {},
        onQuickAdd: async () => {},
        onNewAction: vi.fn(),
        onOpenSleep: vi.fn(),
      }),
    );
  };
  it('keeps imported household actions in a collapsed list and counts completed items there', () => {
    const html = render();
    expect(html).toContain('aria-label="Порядок"');
    const group = html.slice(
      html.indexOf('aria-label="Порядок"'),
      html.indexOf('planner-completed'),
    );
    expect(group).toContain('t001-2026-10-09');
    expect(group).toContain('t002-2026-10-09');
    expect(group).toContain('Выполнено 1 из 2');
    const normal = html.slice(
      html.indexOf('planner-today-list'),
      html.indexOf('aria-label="Порядок"'),
    );
    expect(normal).toContain('Действие ordinary');
    expect(normal).not.toContain('t001-2026-10-09');
    expect(
      html.match(
        /data-planner-action-id="plan-import:household-2026-10-v1:actions:t001-2026-10-09"/g,
      ),
    ).toHaveLength(1);
    expect(html).not.toContain('<details open');
    expect(html).toContain('Готово <strong>1</strong>');
  });
  it('does not add an empty household list to unrelated plans', () => {
    expect(render(false)).not.toContain('aria-label="Порядок"');
  });
  it('keeps a household main action separate and unrelated Home actions in the ordinary plan', () => {
    const html = render(true, true);
    const groupStart = html.indexOf('aria-label="Порядок"');
    expect(
      html.slice(html.indexOf('class="planner-main"'), html.indexOf('planner-today-list')),
    ).toContain('data-planner-action-id="plan-import:household-2026-10-v1:actions:main"');
    expect(html.slice(groupStart)).not.toContain(
      'data-planner-action-id="plan-import:household-2026-10-v1:actions:main"',
    );
    expect(
      html.match(/data-planner-action-id="plan-import:household-2026-10-v1:actions:main"/g),
    ).toHaveLength(1);
    const ordinary = html.slice(html.indexOf('planner-today-list'), groupStart);
    expect(ordinary).toContain('Действие ordinary');
    expect(ordinary.replace(/<[^>]+>/g, '')).toContain('Сфера Дом');
    expect(html).toContain('В плане <strong>3</strong>');
    expect(html).toContain('1 из 4');
  });
  it('groups the selected tomorrow plan using the same day totals', () => {
    const html = render(true, false, 'tomorrow');
    expect(html).toContain('План на завтра');
    expect(html).toContain('aria-label="Порядок"');
    expect(html).toContain('Выполнено 1 из 2');
    expect(html).toContain('1 из 3');
  });
  it('renders collapsed when reading browser preferences is unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('Storage unavailable');
        },
      },
    });
    try {
      const html = renderToStaticMarkup(
        createElement(HouseholdTaskList, {
          pending: [createLifeActionDraft('plan-import:household-2026-10-v1:actions:test')],
          completed: [],
          renderAction: (action) =>
            createElement('li', { key: action.id.toString() }, action.title.toString()),
        }),
      );
      expect(html).toContain('aria-label="Порядок"');
      expect(html).not.toContain(' open=""');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
