import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionSession, DayDate, EntityId } from '../../domain';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { PlannerWorkTime } from './PlannerWorkTime';

const at = new Date('2026-09-28T10:42:18');
const action = createLifeActionDraft('project');
action.setPlan(DayDate.create('2026-09-28'), false);
action.setTimePlanning({
  estimateMinutes: 90,
  scheduledStartMinute: 600,
  scheduledDurationMinutes: 60,
});
const session = () =>
  ActionSession.start({
    id: EntityId.create('session'),
    lifeActionId: action.id,
    startedAt: new Date('2026-09-28T10:00:00'),
    eventId: EntityId.create('start'),
  });
const props = {
  actions: [action],
  goals: [],
  sessions: [],
  weekdays: [null, null, null, null, null, null, null],
  today: '2026-09-28',
  busy: false,
  onStart: async () => {},
  onPause: async () => {},
  onResume: async () => {},
  onFinish: async () => {},
  onRefresh: () => {},
  onNavigate: () => {},
};
afterEach(() => vi.useRealTimers());
describe('work time presentation', () => {
  it('distinguishes a session outside the planned date from an unknown estimate', () => {
    vi.setSystemTime(new Date('2026-09-29T11:00:00'));
    const work = ActionSession.start({
      id: EntityId.create('outside-plan'),
      lifeActionId: action.id,
      startedAt: new Date('2026-09-29T10:00:00'),
      eventId: EntityId.create('outside-start'),
    });
    const html = renderToStaticMarkup(
      createElement(PlannerWorkTime, { ...props, today: '2026-09-29', sessions: [work] }),
    );
    expect(html).toContain('не запланировано');
    expect(html).not.toContain('нет оценки');
  });
  it('shows elapsed work, current plan and separate action completion', () => {
    vi.setSystemTime(at);
    const html = renderToStaticMarkup(
      createElement(PlannerWorkTime, { ...props, sessions: [session()] }),
    );
    expect(html).toContain('00:42:18');
    expect(html).toContain('Пауза');
    expect(html).toContain('Закончить работу');
    expect(html).toContain('Само действие');
    expect(html).toContain('1 ч');
    expect(html).toContain('Доступное время не задано');
    expect(html).not.toContain('Выполнить задачу');
  });
  it('preserves a paused session and excludes the ongoing pause from the clock', () => {
    vi.setSystemTime(at);
    const paused = session();
    paused.pause(new Date('2026-09-28T10:30:00'), EntityId.create('pause'));
    const html = renderToStaticMarkup(
      createElement(PlannerWorkTime, { ...props, sessions: [paused] }),
    );
    expect(html).toContain('00:30:00');
    expect(html).toContain('Продолжить');
    expect(html).toContain('На паузе');
  });
  it('shows all imported unfinished sessions and blocks starting a third', () => {
    vi.setSystemTime(at);
    const other = ActionSession.start({
      id: EntityId.create('other'),
      lifeActionId: EntityId.create('missing'),
      startedAt: new Date('2026-09-28T10:10:00'),
      eventId: EntityId.create('other-start'),
    });
    const html = renderToStaticMarkup(
      createElement(PlannerWorkTime, { ...props, sessions: [session(), other] }),
    );
    expect(html).toContain('Несколько незавершённых сессий');
    expect(html).toContain('Действие недоступно');
    expect(html.match(/Закончить работу/g)).toHaveLength(2);
    expect(html).not.toContain('Начать работу');
  });
  it('offers only open actions and distinguishes unknown estimates from zero', () => {
    const unknown = createLifeActionDraft('unknown');
    unknown.setPlan(DayDate.create('2026-09-28'), false);
    vi.setSystemTime(at);
    const html = renderToStaticMarkup(
      createElement(PlannerWorkTime, { ...props, actions: [unknown] }),
    );
    expect(html).toContain('Начать работу');
    expect(html).toContain('Без оценки: 1');
    expect(html).toContain('нет оценки');
  });
  it('does not permit starting before sessions have loaded', () => {
    const html = renderToStaticMarkup(createElement(PlannerWorkTime, { ...props, sessions: null }));
    expect(html).toContain('Загружаем рабочие сессии');
    expect(html).not.toContain('Начать работу');
  });
  it('survives a clock behind the last session transition with visible feedback', () => {
    vi.setSystemTime(new Date('2026-09-28T09:50:00'));
    const html = renderToStaticMarkup(
      createElement(PlannerWorkTime, { ...props, sessions: [session()] }),
    );
    expect(html).toContain('Проверьте часы устройства');
    expect(html).toContain('Закончить работу');
  });
});
