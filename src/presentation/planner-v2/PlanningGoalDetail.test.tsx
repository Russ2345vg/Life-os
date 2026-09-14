import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { DayDate } from '../../domain';
import { validateRule } from '../../domain/planner/RecurrenceRule';
import { automaticPeriod, type PeriodMembership } from '../../domain/planner/PlanningPeriod';
import { GoalDetailContent } from './PlanningGoalDetail';
import { selectGoalCardActions } from './plannerCatalogModel';
import type { PlannerViewOperations } from './PlannerViewParts';
import { emptyActionDraft, submitPlannerAction } from './plannerFormSubmission';
import type { CreateLifeActionDraftInput } from '../../application/commands/CreateLifeActionDraft';

const now = new Date('2026-09-13T10:00:00Z');
const goal = Goal.create({
  id: EntityId.create('goal-1'),
  title: 'Выучить язык',
  status: 'active',
  achievementCriteria: 'Свободно читать',
  now,
});
const otherGoal = Goal.create({
  id: EntityId.create('goal-2'),
  title: 'Другая цель',
  status: 'active',
  now,
});
const action = (id: string, goalId: EntityId | null, isNext = false) =>
  LifeAction.createDraft({
    id: EntityId.create(id),
    title: LifeActionTitle.create(id),
    goalId,
    isNext,
    plannedDate: isNext ? DayDate.create('2026-09-14') : null,
    createdAt: now,
    eventId: EntityId.create(`${id}-event`),
  });
const operations: PlannerViewOperations = {
  busy: false,
  onComplete: () => {},
  onPlan: async () => {},
  onLink: async () => {},
  onGoalStatus: async () => {},
  onGoalDirection: async () => {},
  onGoalNextAction: async () => {},
};

describe('V2 Goal action centre', () => {
  it('separates status and horizon, shows an empty action state and collapsed details before history', () => {
    const annual = Goal.create({
      id: EntityId.create('annual'),
      title: 'Годовая цель',
      status: 'active',
      horizon: '<1y',
      now,
    });
    const html = renderToStaticMarkup(
      createElement(GoalDetailContent, {
        goal: annual,
        actions: [],
        directions: [],
        spheres: [],
        facts: [],
        today: '2026-09-14',
        operations,
      }),
    );
    expect(html).toContain('Активна · В течение года');
    expect(html).toContain('Пока нет действий');
    expect(html).toContain('+ Добавить действие');
    expect(html).toContain('<details class="planner-goal-details">');
    expect(html.indexOf('Детали')).toBeLessThan(html.indexOf('История'));
    expect(html).toContain('Без периода');
  });
  it('shows current Goal memberships as compact metadata', () => {
    const periods = [
      automaticPeriod('year', '2026-09-14'),
      automaticPeriod('quarter', '2026-09-14'),
      automaticPeriod('week', '2026-09-14'),
    ];
    const memberships: PeriodMembership[] = periods.map((period) => ({
      id: `membership:${period.id}`,
      periodId: period.id,
      entityType: 'goal',
      entityId: goal.id.toString(),
      focused: false,
      removed: false,
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    }));
    const html = renderToStaticMarkup(
      createElement(GoalDetailContent, {
        goal,
        actions: [],
        directions: [],
        spheres: [],
        facts: [],
        today: '2026-09-14',
        operations,
        periods,
        memberships,
      }),
    );
    expect(html).toContain('Год · Квартал · Неделя');
    expect(html).not.toContain('Без периода');
    const previousYear = automaticPeriod('year', '2025-09-14');
    const oldOnly = renderToStaticMarkup(
      createElement(GoalDetailContent, {
        goal,
        actions: [],
        directions: [],
        spheres: [],
        facts: [],
        today: '2026-09-14',
        operations,
        periods: [previousYear],
        memberships: [{ ...memberships[0]!, id: 'old-membership', periodId: previousYear.id }],
      }),
    );
    expect(oldOnly).toContain('Без периода');
  });
  it('shows a count recurrence from completed occurrences inside the Goal Card', () => {
    const current = action('Повторяемый шаг', goal.id);
    current.setPlanningMetadata({
      occurrence: {
        ruleId: 'rule-count',
        slot: 'after:previous',
        ruleRevision: 1,
        originalDate: '2026-09-14',
      },
    });
    const rule = validateRule({
      id: 'rule-count',
      schemaVersion: 1,
      version: 1,
      updatedAt: now.toISOString(),
      title: 'Повторяемый шаг',
      goalId: goal.id.toString(),
      priority: null,
      startDate: '2026-09-14',
      endDate: null,
      maxCompletions: 66,
      paused: false,
      pauseUntil: null,
      schedule: { kind: 'count' },
      revision: 1,
      effectiveFrom: '2026-09-14',
    });
    const html = renderToStaticMarkup(
      createElement(GoalDetailContent, {
        goal,
        actions: [current],
        directions: [],
        spheres: [],
        facts: [],
        rules: [rule],
        today: '2026-09-14',
        operations,
      }),
    );
    expect(html).toContain('Повтор · 0/66');
  });
  it('creates one linked Action through the existing V2 form command and shows it on refresh', async () => {
    const created = action('Новое действие', goal.id);
    const execute = vi.fn(async (input: CreateLifeActionDraftInput) => {
      expect(input.goalId?.toString()).toBe(goal.id.toString());
      return { ok: true as const, value: created };
    });
    const saved = await submitPlannerAction(
      { execute },
      {
        ...emptyActionDraft(goal.id.toString()),
        title: 'Новое действие',
      },
    );
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]?.goalId?.toString()).toBe(goal.id.toString());
    expect(saved).toBe(created);
    expect(selectGoalCardActions(goal, [saved]).open).toEqual([created]);
  });

  it('uses mathematical progress for a metric and no fake percent for a qualitative Goal', () => {
    const metric = Goal.create({
      id: EntityId.create('metric'),
      title: 'Метрика',
      now,
      progress: { type: 'metric', current: 3, target: 12, unit: 'км' },
    });
    const qualitative = Goal.create({
      id: EntityId.create('qualitative'),
      title: 'Качество',
      now,
      progress: { type: 'qualitative', stage: 'moving' },
    });
    const render = (item: Goal) =>
      renderToStaticMarkup(
        createElement(GoalDetailContent, {
          goal: item,
          actions: [],
          directions: [],
          spheres: [],
          facts: [],
          today: '2026-09-13',
          operations,
        }),
      );
    expect(render(metric)).toContain('value="25"');
    expect(render(metric)).toContain('25%');
    expect(render(qualitative)).not.toContain('<progress');
    expect(render(qualitative)).not.toContain('%');
  });
  it('selects only the same LifeAction goalId and updates after late link or unlink', () => {
    const linked = action('linked', goal.id);
    const foreign = action('foreign', otherGoal.id);
    const standalone = action('standalone', null);
    expect(selectGoalCardActions(goal, [linked, foreign, standalone]).open).toEqual([linked]);
    standalone.setGoal(goal.id);
    expect(selectGoalCardActions(goal, [linked, foreign, standalone]).open).toContain(standalone);
    standalone.setGoal(null);
    expect(selectGoalCardActions(goal, [linked, foreign, standalone]).open).toEqual([linked]);
  });

  it('separates next, open and completed actions with history below', () => {
    const next = action('Следующий шаг', goal.id, true);
    const open = action('Открытое действие', goal.id);
    const completed = createReadyLifeAction('completed', DayDate.create('2026-09-13'));
    completed.setGoal(goal.id);
    completeLifeAction(completed);
    const selected = selectGoalCardActions(goal, [next, open, completed]);
    expect(selected.next).toBe(next);
    expect(selected.open).toEqual([next, open]);
    expect(selected.completed).toEqual([completed]);
    const html = renderToStaticMarkup(
      createElement(GoalDetailContent, {
        goal,
        actions: [next, open, completed],
        directions: [],
        spheres: [],
        facts: [],
        today: '2026-09-13',
        operations,
      }),
    );
    expect(html).toContain('Свободно читать');
    expect(html).toContain('Следующее действие');
    expect(html).toContain('Действия цели');
    expect(html).toContain('Выполненные · 1');
    expect(html.indexOf('Действия цели')).toBeLessThan(html.indexOf('Выполненные · 1'));
    expect(html.indexOf('Выполненные · 1')).toBeLessThan(html.indexOf('История'));
    expect(html).toContain('returnToGoal=1');
    expect(html).not.toContain('<progress');
  });
});
