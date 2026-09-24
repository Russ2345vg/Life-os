import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import { PlannerToday } from './PlannerToday';
import {
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';

describe('Planner Today', () => {
  it('renders an optional main, collapsed completed and an accessible quick add', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerToday, {
        date: DayDate.create('2026-09-13'),
        day: 'today',
        overview: { main: null, actions: [], unscheduled: [], completed: [], overdue: [] },
        goals: [],
        availableActions: [],
        mainDirectionId: null,
        directionChoices: [],
        busy: false,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMainDirection: vi.fn(),
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
    // Keyboard and screen-reader order follows the visible planning workflow.
    expect(html.indexOf('aria-label="План на день"')).toBeLessThan(
      html.indexOf('id="planner-main-direction"'),
    );
    expect(html.indexOf('id="planner-main-direction"')).toBeLessThan(
      html.indexOf('aria-label="Новое действие на сегодня"'),
    );
    expect(html.indexOf('aria-label="Новое действие на сегодня"')).toBeLessThan(
      html.indexOf('На сегодня пока ничего не запланировано.'),
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
        mainDirectionId: null,
        directionChoices: [],
        busy: false,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMainDirection: vi.fn(),
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
        mainDirectionId: null,
        directionChoices: [],
        busy: false,
        sleepEntry: {
          active: true,
          cycleDate: '2026-09-13',
          startsAt: new Date('2026-09-13T12:00:00.000Z'),
          closesAt: new Date('2026-09-13T22:00:00.000Z'),
        },
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMainDirection: vi.fn(),
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
        mainDirectionId: null,
        directionChoices: [],
        busy,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMainDirection: vi.fn(),
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
